//! OAuth2 confidential-client persistence and revocation.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    events::{DomainEvent, EventEnvelope},
    identity::{OrganizationId, UserId},
};
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

/// Safe OAuth2 client metadata returned to its owner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthClientRecord {
    /// Internal client identifier.
    pub id: Uuid,
    /// Public OAuth client identifier.
    pub client_id: String,
    /// Human-readable client name.
    pub name: String,
    /// Maximum permitted scopes.
    pub scopes: Vec<String>,
    /// Optional event allow-list.
    pub event_ids: Vec<Uuid>,
    /// Coarsely updated last token-exchange time.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

/// Active confidential client and its owning service principal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OAuthClientPrincipal {
    /// Internal client identifier.
    pub id: Uuid,
    /// Owning user.
    pub user_id: UserId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Account display name.
    pub display_name: String,
    /// Account email.
    pub email: String,
    /// Account verification state.
    pub email_verified: bool,
    /// Current client scope ceiling.
    pub scopes: Vec<String>,
    /// Current event allow-list.
    pub event_ids: Vec<Uuid>,
}

struct OAuthPrincipalRow {
    id: Uuid,
    user_id: Option<Uuid>,
    organization_id: Uuid,
    display_name: String,
    email: String,
    email_verified: bool,
    scopes: Vec<String>,
    event_ids: Vec<Uuid>,
    client_secret_digest: Vec<u8>,
}

/// New digest-only OAuth2 confidential client.
pub struct NewOAuthClient<'a> {
    /// Internal server-generated ID.
    pub id: Uuid,
    /// Owning user.
    pub user_id: UserId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Human-readable name.
    pub name: &'a str,
    /// Public OAuth client identifier.
    pub client_id: &'a str,
    /// SHA-256 digest of the complete client secret.
    pub client_secret_digest: &'a [u8],
    /// Maximum permitted scopes.
    pub scopes: &'a [String],
    /// Optional event allow-list.
    pub event_ids: &'a [Uuid],
    /// Correlation ID for audit and outbox records.
    pub correlation_id: Uuid,
    /// Authoritative creation time.
    pub now: DateTime<Utc>,
}

/// Client mutation paired with its durable domain event.
pub struct OAuthClientMutation {
    /// Safe persisted metadata.
    pub record: OAuthClientRecord,
    /// Event committed in the same transaction.
    pub event: EventEnvelope,
}

/// PostgreSQL OAuth2 client repository.
#[derive(Debug, Clone)]
pub struct OAuthClientRepository {
    pool: PgPool,
}

impl OAuthClientRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Creates an owned confidential client with audit and outbox state.
    pub async fn create(&self, command: NewOAuthClient<'_>) -> DomainResult<OAuthClientMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        validate_event_scope(&mut tx, command.organization_id, command.event_ids).await?;
        let row = sqlx::query_as!(
            OAuthClientRecord,
            r#"
            INSERT INTO oauth_clients (
                id,organization_id,user_id,name,client_id,client_secret_digest,
                scopes,event_ids,disabled,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9)
            RETURNING id,client_id,name AS "name!",scopes,event_ids,last_used_at,
                      revoked_at,created_at
            "#,
            command.id,
            command.organization_id.0,
            command.user_id.0,
            command.name,
            command.client_id,
            command.client_secret_digest,
            command.scopes,
            command.event_ids,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let event = client_event(
            command.organization_id,
            command.user_id,
            command.id,
            "active",
            command.correlation_id,
            command.now,
        );
        persist_change(
            &mut tx,
            &event,
            "auth.oauth_client.create",
            command.id,
            json!({
                "name": command.name,
                "client_id": command.client_id,
                "scopes": command.scopes,
                "event_ids": command.event_ids,
            }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(OAuthClientMutation { record: row, event })
    }

    /// Lists safe client metadata for one account.
    pub async fn list(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<Vec<OAuthClientRecord>> {
        sqlx::query_as!(
            OAuthClientRecord,
            r#"
            SELECT id,client_id,name AS "name!",scopes,event_ids,last_used_at,
                   revoked_at,created_at
            FROM oauth_clients
            WHERE organization_id = $1 AND user_id = $2
            ORDER BY created_at DESC,id DESC
            "#,
            organization_id.0,
            user_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Revokes an owned client and all of its outstanding access tokens.
    pub async fn revoke(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        id: Uuid,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<OAuthClientMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            OAuthClientRecord,
            r#"
            UPDATE oauth_clients SET disabled = true,revoked_at = $4
            WHERE id = $1 AND organization_id = $2 AND user_id = $3
              AND disabled = false AND revoked_at IS NULL
            RETURNING id,client_id,name AS "name!",scopes,event_ids,last_used_at,
                      revoked_at,created_at
            "#,
            id,
            organization_id.0,
            user_id.0,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let event = client_event(organization_id, user_id, id, "revoked", correlation_id, now);
        persist_change(
            &mut tx,
            &event,
            "auth.oauth_client.revoke",
            id,
            json!({ "name": row.name.clone(), "client_id": row.client_id.clone() }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(OAuthClientMutation { record: row, event })
    }

    /// Authenticates one secret exchange and resolves its owning principal.
    pub async fn authenticate(
        &self,
        client_id: &str,
        secret_digest: &[u8],
    ) -> DomainResult<Option<OAuthClientPrincipal>> {
        let row = sqlx::query_as!(
            OAuthPrincipalRow,
            r#"
            SELECT
                c.id,c.user_id,c.organization_id,u.display_name,
                u.email_normalized AS email,u.email_verified,c.scopes,c.event_ids,
                c.client_secret_digest
            FROM oauth_clients c
            JOIN users u ON u.id = c.user_id AND u.organization_id = c.organization_id
            WHERE c.client_id = $1 AND c.disabled = false AND c.revoked_at IS NULL
              AND u.disabled = false
            "#,
            client_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        let dummy_digest = [0_u8; 32];
        let expected_digest = row.as_ref().map_or(dummy_digest.as_slice(), |candidate| {
            candidate.client_secret_digest.as_slice()
        });
        let secret_matches: bool = expected_digest.ct_eq(secret_digest).into();
        let Some(row) = row else {
            return Ok(None);
        };
        if !secret_matches {
            return Ok(None);
        }
        principal_from_row(row).map(Some)
    }

    /// Durably records a successful exchange after the access token is issued.
    pub async fn record_exchange(
        &self,
        id: Uuid,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let owner = sqlx::query!(
            r#"
            SELECT c.user_id,c.organization_id
            FROM oauth_clients c
            JOIN users u ON u.id = c.user_id AND u.organization_id = c.organization_id
            WHERE c.id = $1 AND c.disabled = false AND c.revoked_at IS NULL
              AND u.disabled = false
            FOR UPDATE OF c
            "#,
            id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let user_id = owner.user_id.ok_or_else(|| {
            DomainError::Unavailable("OAuth client owner integrity check failed".into())
        })?;
        update_last_used(&mut tx, id, now).await?;
        let event = EventEnvelope::new(
            OrganizationId(owner.organization_id),
            None,
            Some(UserId(user_id)),
            correlation_id,
            now,
            DomainEvent::AuthenticationSucceeded {
                user_id: UserId(user_id),
                method: "oauth2_client_credentials".into(),
            },
        );
        persist_change(
            &mut tx,
            &event,
            "auth.oauth_client.exchange",
            id,
            json!({ "grant_type": "client_credentials" }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(event)
    }

    /// Resolves an active client referenced by a decrypted access token.
    pub async fn principal(&self, id: Uuid) -> DomainResult<Option<OAuthClientPrincipal>> {
        let row = sqlx::query_as!(
            OAuthPrincipalRow,
            r#"
            SELECT
                c.id,c.user_id,c.organization_id,u.display_name,
                u.email_normalized AS email,u.email_verified,c.scopes,c.event_ids,
                c.client_secret_digest
            FROM oauth_clients c
            JOIN users u ON u.id = c.user_id AND u.organization_id = c.organization_id
            WHERE c.id = $1 AND c.disabled = false AND c.revoked_at IS NULL
              AND u.disabled = false
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        row.map(principal_from_row).transpose()
    }
}

fn principal_from_row(row: OAuthPrincipalRow) -> DomainResult<OAuthClientPrincipal> {
    let user_id = row.user_id.ok_or_else(|| {
        DomainError::Unavailable("OAuth client owner integrity check failed".into())
    })?;
    Ok(OAuthClientPrincipal {
        id: row.id,
        user_id: UserId(user_id),
        organization_id: OrganizationId(row.organization_id),
        display_name: row.display_name,
        email: row.email,
        email_verified: row.email_verified,
        scopes: row.scopes,
        event_ids: row.event_ids,
    })
}

async fn update_last_used(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        UPDATE oauth_clients SET last_used_at = $2::timestamptz
        WHERE id = $1
          AND (
              last_used_at IS NULL
              OR last_used_at < $2::timestamptz - interval '5 minutes'
          )
        "#,
        id,
        now,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn validate_event_scope(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    event_ids: &[Uuid],
) -> DomainResult<()> {
    if event_ids.is_empty() {
        return Ok(());
    }
    let count = sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!"
        FROM events
        WHERE organization_id = $1 AND id = ANY($2)
        "#,
        organization_id.0,
        event_ids,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if usize::try_from(count).ok() == Some(event_ids.len()) {
        Ok(())
    } else {
        Err(DomainError::Validation(
            "OAuth client event scope contains an unknown event".into(),
        ))
    }
}

fn client_event(
    organization_id: OrganizationId,
    user_id: UserId,
    client_id: Uuid,
    state: &str,
    correlation_id: Uuid,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        None,
        Some(user_id),
        correlation_id,
        now,
        DomainEvent::OAuthClientChanged {
            client_id,
            state: state.to_owned(),
        },
    )
}

async fn persist_change(
    tx: &mut Transaction<'_, Postgres>,
    event: &EventEnvelope,
    action: &str,
    client_id: Uuid,
    metadata: serde_json::Value,
) -> DomainResult<()> {
    let organization_id = event
        .organization_id
        .ok_or_else(|| DomainError::Validation("OAuth event must be tenant-scoped".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,$4,'oauth_client',$5,$6,$7,$8)
        "#,
        Uuid::now_v7(),
        organization_id.0,
        event.actor_id.map(|id| id.0),
        action,
        client_id.to_string(),
        metadata,
        event.correlation_id,
        event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        INSERT INTO event_outbox (
            id,organization_id,event_id,kind,envelope,occurred_at,created_at
        ) VALUES ($1,$2,NULL,$3,$4,$5,$5)
        "#,
        event.id,
        organization_id.0,
        event.kind(),
        serde_json::to_value(event).map_err(|error| DomainError::Validation(error.to_string()))?,
        event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres OAuth client: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("OAuth client already exists".into())
    } else {
        unavailable(error)
    }
}
