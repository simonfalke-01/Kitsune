//! Transactional instance lease issuance and flag rotation.

use chrono::{DateTime, Duration, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    challenge::ChallengeKind,
    events::DomainEvent,
    identity::{ChallengeId, EventId, InstanceId, OrganizationId, UserId},
    instances::InstanceState,
    scoring::CompetitorId,
};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::resources::persist_audit_event;

const MINIMUM_TTL: Duration = Duration::minutes(1);
const MAXIMUM_TTL: Duration = Duration::days(30);
const MAXIMUM_CONNECTION_BYTES: usize = 16 * 1024;

/// Secret-bearing command emitted after a provider has made an instance ready.
pub struct IssueReadyInstance<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Dynamic challenge target.
    pub challenge_id: ChallengeId,
    /// Stable Kitsune instance identity.
    pub instance_id: InstanceId,
    /// User or team that owns the isolated lease.
    pub competitor: CompetitorId,
    /// Optional organizer actor; absent for system reconciliation.
    pub actor: Option<UserId>,
    /// Adapter key such as `kubernetes` or `docker`.
    pub orchestrator: &'a str,
    /// Provider-native resource identifier.
    pub provider_id: &'a str,
    /// Logical challenge template selected during authoring.
    pub template: &'a str,
    /// Player-safe connection document; credentials and flags are forbidden.
    pub connection: &'a Value,
    /// High-entropy issued flag, retained only for this transaction.
    pub flag: &'a SecretString,
    /// Retry key shared with the provisioning operation.
    pub idempotency_key: Uuid,
    /// Lease expiry.
    pub expires_at: DateTime<Utc>,
    /// Correlation ID shared with provisioning telemetry.
    pub correlation_id: Uuid,
    /// Authoritative timestamp.
    pub now: DateTime<Utc>,
}

/// Compare-and-swap flag rotation command.
pub struct RotateInstanceFlag<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Instance target.
    pub instance_id: InstanceId,
    /// Optional organizer actor; absent for scheduled rotation.
    pub actor: Option<UserId>,
    /// Generation observed before provider flag injection.
    pub expected_generation: u64,
    /// Newly injected high-entropy flag.
    pub flag: &'a SecretString,
    /// Correlation ID shared with the provider operation.
    pub correlation_id: Uuid,
    /// Authoritative timestamp.
    pub now: DateTime<Utc>,
}

/// Secret-free instance lease projection.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InstanceLeaseRecord {
    /// Kitsune instance identity.
    pub id: Uuid,
    /// Parent event.
    pub event_id: Uuid,
    /// Parent challenge.
    pub challenge_id: Uuid,
    /// Owner identity.
    pub competitor: CompetitorId,
    /// Adapter key.
    pub orchestrator: String,
    /// Provider-native resource identifier.
    pub provider_id: String,
    /// Logical template key.
    pub template: String,
    /// Stable lifecycle key.
    pub state: String,
    /// Player-safe connection metadata.
    pub connection: Value,
    /// Current flag generation, never the flag.
    pub flag_generation: u64,
    /// Lease expiry.
    pub expires_at: DateTime<Utc>,
    /// Last persistence update.
    pub updated_at: DateTime<Utc>,
}

/// Mutation result with fresh events for immediate publication.
pub struct InstanceMutation {
    /// Secret-free lease state.
    pub record: InstanceLeaseRecord,
    /// Empty for an idempotent issuance replay.
    pub events: Vec<EventEnvelope>,
    /// Whether issuance returned an earlier committed operation.
    pub replayed: bool,
}

/// PostgreSQL-backed instance lease repository.
#[derive(Debug, Clone)]
pub struct InstanceRepository {
    pool: PgPool,
}

impl InstanceRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Commits a ready lease and its digest-only initial flag atomically.
    pub async fn issue_ready(
        &self,
        command: IssueReadyInstance<'_>,
    ) -> DomainResult<InstanceMutation> {
        validate_issue(&command)?;
        let flag_digest = dynamic_flag_digest(command.flag)?;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;

        if let Some(record) = replayed_issuance(&mut tx, &command, &flag_digest).await? {
            tx.rollback().await.map_err(unavailable)?;
            return Ok(InstanceMutation {
                record,
                events: Vec::new(),
                replayed: true,
            });
        }

        validate_dynamic_challenge(&mut tx, &command).await?;
        validate_competitor(&mut tx, command.organization_id, command.competitor).await?;
        validate_actor(&mut tx, command.organization_id, command.actor).await?;
        let (user_id, team_id) = competitor_columns(command.competitor);
        sqlx::query!(
            r#"
            INSERT INTO instances (
                id,event_id,challenge_id,team_id,user_id,orchestrator,provider_id,
                template,state,connection,idempotency_key,expires_at,created_at,
                updated_at,flag_digest,flag_generation,flag_rotated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,1,$13)
            "#,
            command.instance_id.0,
            command.event_id.0,
            command.challenge_id.0,
            team_id,
            user_id,
            command.orchestrator,
            command.provider_id,
            command.template,
            InstanceState::Ready.as_str(),
            command.connection,
            command.idempotency_key,
            command.expires_at,
            command.now,
            flag_digest.as_slice(),
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;

        let envelope = EventEnvelope::new(
            command.organization_id,
            Some(command.event_id),
            command.actor,
            command.correlation_id,
            command.now,
            DomainEvent::InstanceChanged {
                instance_id: command.instance_id,
                state: InstanceState::Ready.as_str().into(),
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "instance.ready",
            "instance",
            &command.instance_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;

        Ok(InstanceMutation {
            record: InstanceLeaseRecord {
                id: command.instance_id.0,
                event_id: command.event_id.0,
                challenge_id: command.challenge_id.0,
                competitor: command.competitor,
                orchestrator: command.orchestrator.into(),
                provider_id: command.provider_id.into(),
                template: command.template.into(),
                state: InstanceState::Ready.as_str().into(),
                connection: command.connection.clone(),
                flag_generation: 1,
                expires_at: command.expires_at,
                updated_at: command.now,
            },
            events: vec![envelope],
            replayed: false,
        })
    }

    /// Rotates an active lease flag with generation-based compare-and-swap.
    pub async fn rotate_flag(
        &self,
        command: RotateInstanceFlag<'_>,
    ) -> DomainResult<InstanceMutation> {
        validate_actorless_timestamp(command.now)?;
        let flag_digest = dynamic_flag_digest(command.flag)?;
        let expected_generation = i64::try_from(command.expected_generation)
            .map_err(|_| DomainError::Validation("flag generation is too large".into()))?;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        validate_actor(&mut tx, command.organization_id, command.actor).await?;
        let row = sqlx::query!(
            r#"
            SELECT i.event_id,i.challenge_id,i.user_id,i.team_id,i.orchestrator,
                   i.provider_id,i.template,i.state,i.connection,i.flag_generation,
                   i.expires_at
            FROM instances i
            JOIN events e ON e.id = i.event_id
            WHERE i.id = $1 AND i.event_id = $2 AND e.organization_id = $3
            FOR UPDATE OF i
            "#,
            command.instance_id.0,
            command.event_id.0,
            command.organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;

        if !matches!(row.state.as_str(), "ready" | "unhealthy") || row.expires_at <= command.now {
            return Err(DomainError::Conflict(
                "only an unexpired ready or unhealthy instance can rotate its flag".into(),
            ));
        }
        if row.flag_generation != expected_generation {
            return Err(DomainError::Conflict(
                "instance flag generation changed during rotation".into(),
            ));
        }
        let next_generation = row
            .flag_generation
            .checked_add(1)
            .ok_or_else(|| DomainError::LimitExceeded("flag generation exhausted".into()))?;
        sqlx::query!(
            r#"
            UPDATE instances
            SET flag_digest = $2, flag_generation = $3, flag_rotated_at = $4,
                updated_at = $4
            WHERE id = $1
            "#,
            command.instance_id.0,
            flag_digest.as_slice(),
            next_generation,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;

        let public_generation = u64::try_from(next_generation)
            .map_err(|_| DomainError::Unavailable("stored flag generation is invalid".into()))?;
        let envelope = EventEnvelope::new(
            command.organization_id,
            Some(command.event_id),
            command.actor,
            command.correlation_id,
            command.now,
            DomainEvent::FlagRotated {
                instance_id: command.instance_id,
                tick: public_generation,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "instance.flag.rotate",
            "instance",
            &command.instance_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;

        Ok(InstanceMutation {
            record: InstanceLeaseRecord {
                id: command.instance_id.0,
                event_id: row.event_id,
                challenge_id: row.challenge_id.ok_or_else(|| {
                    DomainError::Unavailable("dynamic instance has no challenge".into())
                })?,
                competitor: competitor_from_columns(row.user_id, row.team_id)?,
                orchestrator: row.orchestrator,
                provider_id: row.provider_id.ok_or_else(|| {
                    DomainError::Unavailable("ready instance has no provider identifier".into())
                })?,
                template: row.template,
                state: row.state,
                connection: row.connection.ok_or_else(|| {
                    DomainError::Unavailable("ready instance has no connection document".into())
                })?,
                flag_generation: public_generation,
                expires_at: row.expires_at,
                updated_at: command.now,
            },
            events: vec![envelope],
            replayed: false,
        })
    }
}

async fn replayed_issuance(
    tx: &mut Transaction<'_, Postgres>,
    command: &IssueReadyInstance<'_>,
    flag_digest: &[u8; 32],
) -> DomainResult<Option<InstanceLeaseRecord>> {
    let row = sqlx::query!(
        r#"
        SELECT i.id,i.event_id,i.challenge_id,i.user_id,i.team_id,i.orchestrator,
               i.provider_id,i.template,i.state,i.connection,i.flag_digest,
               i.flag_generation,i.expires_at,i.updated_at,e.organization_id
        FROM instances i
        JOIN events e ON e.id = i.event_id
        WHERE i.idempotency_key = $1
        FOR UPDATE OF i
        "#,
        command.idempotency_key,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let stored_digest = row.flag_digest.as_deref().ok_or_else(|| {
        DomainError::Conflict("idempotency key belongs to an unready lease".into())
    })?;
    let matches = row.organization_id == command.organization_id.0
        && row.id == command.instance_id.0
        && row.event_id == command.event_id.0
        && row.challenge_id == Some(command.challenge_id.0)
        && competitor_from_columns(row.user_id, row.team_id)? == command.competitor
        && row.orchestrator == command.orchestrator
        && row.provider_id.as_deref() == Some(command.provider_id)
        && row.template == command.template
        && row.connection.as_ref() == Some(command.connection)
        && timestamp_micros(row.expires_at) == timestamp_micros(command.expires_at)
        && bool::from(stored_digest.ct_eq(flag_digest.as_slice()));
    if !matches {
        return Err(DomainError::Conflict(
            "idempotency key belongs to a different instance issuance".into(),
        ));
    }
    Ok(Some(InstanceLeaseRecord {
        id: row.id,
        event_id: row.event_id,
        challenge_id: row
            .challenge_id
            .ok_or_else(|| DomainError::Unavailable("dynamic instance has no challenge".into()))?,
        competitor: command.competitor,
        orchestrator: row.orchestrator,
        provider_id: row.provider_id.ok_or_else(|| {
            DomainError::Unavailable("ready instance has no provider identifier".into())
        })?,
        template: row.template,
        state: row.state,
        connection: row.connection.ok_or_else(|| {
            DomainError::Unavailable("ready instance has no connection document".into())
        })?,
        flag_generation: u64::try_from(row.flag_generation)
            .map_err(|_| DomainError::Unavailable("stored flag generation is invalid".into()))?,
        expires_at: row.expires_at,
        updated_at: row.updated_at,
    }))
}

async fn validate_dynamic_challenge(
    tx: &mut Transaction<'_, Postgres>,
    command: &IssueReadyInstance<'_>,
) -> DomainResult<()> {
    let kind = sqlx::query_scalar!(
        r#"
        SELECT c.kind
        FROM challenges c
        JOIN events e ON e.id = c.event_id
        WHERE c.id = $1 AND c.event_id = $2 AND e.organization_id = $3
        "#,
        command.challenge_id.0,
        command.event_id.0,
        command.organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    let kind = serde_json::from_value::<ChallengeKind>(kind)
        .map_err(|error| DomainError::Unavailable(format!("stored challenge type: {error}")))?;
    match kind {
        ChallengeKind::DynamicInstance { template } if template == command.template => Ok(()),
        ChallengeKind::DynamicInstance { .. } => Err(DomainError::Conflict(
            "instance template no longer matches the challenge".into(),
        )),
        _ => Err(DomainError::Validation(
            "instances can only be issued for dynamic challenges".into(),
        )),
    }
}

async fn validate_competitor(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    competitor: CompetitorId,
) -> DomainResult<()> {
    let exists = match competitor {
        CompetitorId::User(user_id) => sqlx::query_scalar!(
            r#"
                SELECT EXISTS(
                    SELECT 1 FROM users
                    WHERE id = $1 AND organization_id = $2 AND disabled = false
                ) AS "exists!"
                "#,
            user_id.0,
            organization_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?,
        CompetitorId::Team(team_id) => sqlx::query_scalar!(
            r#"
                SELECT EXISTS(
                    SELECT 1 FROM teams WHERE id = $1 AND organization_id = $2
                ) AS "exists!"
                "#,
            team_id.0,
            organization_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?,
    };
    if exists {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

async fn validate_actor(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    actor: Option<UserId>,
) -> DomainResult<()> {
    let Some(actor) = actor else {
        return Ok(());
    };
    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM users WHERE id = $1 AND organization_id = $2
        ) AS "exists!"
        "#,
        actor.0,
        organization_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if exists {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

fn validate_issue(command: &IssueReadyInstance<'_>) -> DomainResult<()> {
    validate_actorless_timestamp(command.now)?;
    validate_key(command.orchestrator, "orchestrator", 64)?;
    validate_key(command.template, "template", 160)?;
    if command.provider_id.trim().is_empty()
        || command.provider_id.len() > 240
        || command.provider_id.chars().any(char::is_control)
    {
        return Err(DomainError::Validation(
            "provider identifier must contain 1 to 240 printable characters".into(),
        ));
    }
    let ttl = command.expires_at - command.now;
    if !(MINIMUM_TTL..=MAXIMUM_TTL).contains(&ttl) {
        return Err(DomainError::Validation(
            "instance TTL must be between one minute and thirty days".into(),
        ));
    }
    validate_connection(command.connection)
}

fn validate_actorless_timestamp(now: DateTime<Utc>) -> DomainResult<()> {
    if now.timestamp() < 0 {
        Err(DomainError::Validation(
            "instance timestamp must be after the Unix epoch".into(),
        ))
    } else {
        Ok(())
    }
}

fn validate_key(value: &str, field: &str, maximum: usize) -> DomainResult<()> {
    let valid = !value.is_empty()
        && value.len() <= maximum
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:/@".contains(&byte));
    if valid {
        Ok(())
    } else {
        Err(DomainError::Validation(format!(
            "{field} contains unsupported characters or exceeds its bound"
        )))
    }
}

fn validate_connection(connection: &Value) -> DomainResult<()> {
    if !connection.is_object() {
        return Err(DomainError::Validation(
            "instance connection must be a JSON object".into(),
        ));
    }
    let encoded = serde_json::to_vec(connection)
        .map_err(|error| DomainError::Validation(format!("instance connection: {error}")))?;
    if encoded.len() > MAXIMUM_CONNECTION_BYTES {
        return Err(DomainError::LimitExceeded(
            "instance connection document is too large".into(),
        ));
    }
    if contains_sensitive_key(connection) {
        return Err(DomainError::Validation(
            "instance connection must not contain credentials or flags".into(),
        ));
    }
    Ok(())
}

fn contains_sensitive_key(value: &Value) -> bool {
    match value {
        Value::Object(values) => values.iter().any(|(key, child)| {
            let normalized = key.to_ascii_lowercase();
            matches!(
                normalized.as_str(),
                "authorization"
                    | "credential"
                    | "credentials"
                    | "flag"
                    | "password"
                    | "secret"
                    | "token"
            ) || contains_sensitive_key(child)
        }),
        Value::Array(values) => values.iter().any(contains_sensitive_key),
        _ => false,
    }
}

fn dynamic_flag_digest(flag: &SecretString) -> DomainResult<[u8; 32]> {
    let normalized = flag.expose_secret().trim();
    if !(16..=512).contains(&normalized.len()) || normalized.chars().any(char::is_control) {
        return Err(DomainError::Validation(
            "dynamic flags must contain 16 to 512 printable bytes".into(),
        ));
    }
    Ok(Sha256::digest(normalized.as_bytes()).into())
}

fn timestamp_micros(value: DateTime<Utc>) -> i64 {
    value.timestamp_micros()
}

const fn competitor_columns(competitor: CompetitorId) -> (Option<Uuid>, Option<Uuid>) {
    match competitor {
        CompetitorId::User(user_id) => (Some(user_id.0), None),
        CompetitorId::Team(team_id) => (None, Some(team_id.0)),
    }
}

fn competitor_from_columns(
    user_id: Option<Uuid>,
    team_id: Option<Uuid>,
) -> DomainResult<CompetitorId> {
    match (user_id, team_id) {
        (Some(user_id), None) => Ok(CompetitorId::User(UserId(user_id))),
        (None, Some(team_id)) => Ok(CompetitorId::Team(kitsune_core::identity::TeamId(team_id))),
        _ => Err(DomainError::Unavailable(
            "instance contains an invalid competitor binding".into(),
        )),
    }
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres instances: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("an active instance lease already exists".into())
    } else {
        unavailable(error)
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_core::{
        DomainError,
        challenge::ChallengeKind,
        identity::{ChallengeId, EventId, InstanceId, OrganizationId, UserId},
        scoring::CompetitorId,
    };
    use secrecy::{ExposeSecret, SecretString};
    use sha2::{Digest, Sha256};
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{InstanceRepository, IssueReadyInstance, RotateInstanceFlag};
    use crate::MIGRATOR;

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn issuance_and_rotation_are_digest_only_idempotent_and_audited(pool: PgPool) {
        let organization_id = OrganizationId::new();
        let event_id = EventId::new();
        let challenge_id = ChallengeId::new();
        let player_id = UserId::new();
        let now = Utc::now();
        seed_dynamic_challenge(
            &pool,
            organization_id,
            event_id,
            challenge_id,
            player_id,
            now,
        )
        .await;

        let repository = InstanceRepository::new(pool.clone());
        let instance_id = InstanceId::new();
        let idempotency_key = Uuid::now_v7();
        let expires_at = now + Duration::hours(2);
        let connection = serde_json::json!({
            "protocol": "https",
            "host": "player-7.instances.example.test",
            "port": 443
        });
        let first_flag = SecretString::from("kit{issued-foxfire-4f263a12}");
        let issued = repository
            .issue_ready(IssueReadyInstance {
                organization_id,
                event_id,
                challenge_id,
                instance_id,
                competitor: CompetitorId::User(player_id),
                actor: None,
                orchestrator: "kubernetes",
                provider_id: "kitsune-event/pwnbox-player-7",
                template: "pwnbox-v1",
                connection: &connection,
                flag: &first_flag,
                idempotency_key,
                expires_at,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("issue ready instance");
        assert!(!issued.replayed);
        assert_eq!(issued.record.flag_generation, 1);
        assert_eq!(issued.events.len(), 1);

        let replay = repository
            .issue_ready(IssueReadyInstance {
                organization_id,
                event_id,
                challenge_id,
                instance_id,
                competitor: CompetitorId::User(player_id),
                actor: None,
                orchestrator: "kubernetes",
                provider_id: "kitsune-event/pwnbox-player-7",
                template: "pwnbox-v1",
                connection: &connection,
                flag: &first_flag,
                idempotency_key,
                expires_at,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("replay issuance");
        assert!(replay.replayed);
        assert!(replay.events.is_empty());

        let duplicate = repository
            .issue_ready(IssueReadyInstance {
                organization_id,
                event_id,
                challenge_id,
                instance_id: InstanceId::new(),
                competitor: CompetitorId::User(player_id),
                actor: None,
                orchestrator: "kubernetes",
                provider_id: "kitsune-event/duplicate",
                template: "pwnbox-v1",
                connection: &connection,
                flag: &first_flag,
                idempotency_key: Uuid::now_v7(),
                expires_at,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await;
        assert!(matches!(duplicate, Err(DomainError::Conflict(_))));

        let stored = sqlx::query!(
            "SELECT flag_digest,connection::text AS connection FROM instances WHERE id = $1",
            instance_id.0,
        )
        .fetch_one(&pool)
        .await
        .expect("stored lease");
        let expected_first = Sha256::digest(first_flag.expose_secret().as_bytes());
        assert_eq!(
            stored.flag_digest.as_deref(),
            Some(expected_first.as_slice())
        );
        assert!(
            !stored
                .connection
                .expect("connection")
                .contains("issued-foxfire")
        );

        let second_flag = SecretString::from("kit{rotated-foxfire-a87b934e}");
        let rotated = repository
            .rotate_flag(RotateInstanceFlag {
                organization_id,
                event_id,
                instance_id,
                actor: None,
                expected_generation: 1,
                flag: &second_flag,
                correlation_id: Uuid::now_v7(),
                now: now + Duration::minutes(5),
            })
            .await
            .expect("rotate flag");
        assert_eq!(rotated.record.flag_generation, 2);
        assert_eq!(rotated.events.len(), 1);

        let stale_rotation = repository
            .rotate_flag(RotateInstanceFlag {
                organization_id,
                event_id,
                instance_id,
                actor: None,
                expected_generation: 1,
                flag: &first_flag,
                correlation_id: Uuid::now_v7(),
                now: now + Duration::minutes(6),
            })
            .await;
        assert!(matches!(stale_rotation, Err(DomainError::Conflict(_))));

        let row = sqlx::query!(
            "SELECT flag_digest,flag_generation FROM instances WHERE id = $1",
            instance_id.0,
        )
        .fetch_one(&pool)
        .await
        .expect("rotated lease");
        let expected_second = Sha256::digest(second_flag.expose_secret().as_bytes());
        assert_eq!(row.flag_digest.as_deref(), Some(expected_second.as_slice()));
        assert_eq!(row.flag_generation, 2);
        assert_eq!(
            sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM audit_log")
                .fetch_one(&pool)
                .await
                .expect("audit count"),
            2
        );
        assert_eq!(
            sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM event_outbox")
                .fetch_one(&pool)
                .await
                .expect("outbox count"),
            2
        );
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn issuance_rejects_secret_connections_and_mismatched_templates(pool: PgPool) {
        let organization_id = OrganizationId::new();
        let event_id = EventId::new();
        let challenge_id = ChallengeId::new();
        let player_id = UserId::new();
        let now = Utc::now();
        seed_dynamic_challenge(
            &pool,
            organization_id,
            event_id,
            challenge_id,
            player_id,
            now,
        )
        .await;
        let repository = InstanceRepository::new(pool);
        let flag = SecretString::from("kit{bounded-secret-a82d591f}");
        let secret_connection = serde_json::json!({
            "host": "instance.example.test",
            "token": "must-not-persist"
        });
        let rejected = repository
            .issue_ready(IssueReadyInstance {
                organization_id,
                event_id,
                challenge_id,
                instance_id: InstanceId::new(),
                competitor: CompetitorId::User(player_id),
                actor: None,
                orchestrator: "docker",
                provider_id: "container-1",
                template: "pwnbox-v1",
                connection: &secret_connection,
                flag: &flag,
                idempotency_key: Uuid::now_v7(),
                expires_at: now + Duration::hours(1),
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await;
        assert!(matches!(rejected, Err(DomainError::Validation(_))));

        let public_connection = serde_json::json!({"host": "instance.example.test"});
        let mismatched = repository
            .issue_ready(IssueReadyInstance {
                organization_id,
                event_id,
                challenge_id,
                instance_id: InstanceId::new(),
                competitor: CompetitorId::User(player_id),
                actor: None,
                orchestrator: "docker",
                provider_id: "container-1",
                template: "another-template",
                connection: &public_connection,
                flag: &flag,
                idempotency_key: Uuid::now_v7(),
                expires_at: now + Duration::hours(1),
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await;
        assert!(matches!(mismatched, Err(DomainError::Conflict(_))));
    }

    async fn seed_dynamic_challenge(
        pool: &PgPool,
        organization_id: OrganizationId,
        event_id: EventId,
        challenge_id: ChallengeId,
        player_id: UserId,
        now: chrono::DateTime<Utc>,
    ) {
        let modes = vec!["jeopardy".to_owned()];
        sqlx::query!(
            "INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,$2,$3,$4)",
            organization_id.0,
            "Instance Test",
            format!("instance-{organization_id}"),
            now,
        )
        .execute(pool)
        .await
        .expect("organization");
        sqlx::query!(
            r#"
            INSERT INTO users (
                id,organization_id,email,email_normalized,display_name,email_verified,
                disabled,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$3,$4,true,false,'{}',$5,$5)
            "#,
            player_id.0,
            organization_id.0,
            "player@example.test",
            "Player",
            now,
        )
        .execute(pool)
        .await
        .expect("player");
        sqlx::query!(
            r#"
            INSERT INTO events (
                id,organization_id,name,slug,state,participation,modes,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,'live','individual',$5,$6,$6)
            "#,
            event_id.0,
            organization_id.0,
            "Instance Event",
            format!("instance-{event_id}"),
            &modes,
            now,
        )
        .execute(pool)
        .await
        .expect("event");
        let kind = serde_json::to_value(ChallengeKind::DynamicInstance {
            template: "pwnbox-v1".into(),
        })
        .expect("challenge kind");
        sqlx::query!(
            r#"
            INSERT INTO challenges (
                id,event_id,name,category,description,kind,state,scoring,visibility,
                created_by,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,'published',$7,'{}',$8,$9,$9)
            "#,
            challenge_id.0,
            event_id.0,
            "Pwnbox",
            "Pwn",
            "Per-player instance",
            kind,
            serde_json::json!({"kind": "static", "points": 200}),
            player_id.0,
            now,
        )
        .execute(pool)
        .await
        .expect("challenge");
    }
}
