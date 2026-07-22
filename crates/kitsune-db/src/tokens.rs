//! Revocable, scoped programmatic credential persistence.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    events::{DomainEvent, EventEnvelope},
    identity::{OrganizationId, UserId},
};
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

/// Safe API-token metadata returned to its owner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiTokenRecord {
    /// Token identifier.
    pub id: Uuid,
    /// Human-readable name.
    pub name: String,
    /// Permission scopes intersected with live RBAC on every request.
    pub scopes: Vec<String>,
    /// Optional event allow-list. Empty means organization-wide.
    pub event_ids: Vec<Uuid>,
    /// Mandatory credential expiry.
    pub expires_at: DateTime<Utc>,
    /// Last observed use, coarsely updated to avoid write amplification.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

/// Authenticated bearer-token principal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiTokenPrincipal {
    /// Token identifier.
    pub token_id: Uuid,
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
    /// Token permission scopes.
    pub scopes: Vec<String>,
    /// Optional event allow-list.
    pub event_ids: Vec<Uuid>,
    /// Token expiry.
    pub expires_at: DateTime<Utc>,
}

/// New digest-only API credential.
pub struct NewApiToken<'a> {
    /// Server-generated token ID.
    pub id: Uuid,
    /// Owning user.
    pub user_id: UserId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Human-readable name.
    pub name: &'a str,
    /// SHA-256 digest of the complete PASETO value.
    pub token_digest: &'a [u8],
    /// Requested permission scopes.
    pub scopes: &'a [String],
    /// Optional event allow-list.
    pub event_ids: &'a [Uuid],
    /// Mandatory expiry.
    pub expires_at: DateTime<Utc>,
    /// Correlation ID for audit and outbox.
    pub correlation_id: Uuid,
    /// Authoritative creation time.
    pub now: DateTime<Utc>,
}

/// Token mutation paired with its durable domain event.
pub struct ApiTokenMutation {
    /// Safe token metadata.
    pub record: ApiTokenRecord,
    /// Event committed to the outbox in the same transaction.
    pub event: EventEnvelope,
}

/// PostgreSQL API-token repository.
#[derive(Debug, Clone)]
pub struct ApiTokenRepository {
    pool: PgPool,
}

impl ApiTokenRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Creates a digest-only credential with audit and outbox state atomically.
    pub async fn create(&self, command: NewApiToken<'_>) -> DomainResult<ApiTokenMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        validate_event_scope(&mut tx, command.organization_id, command.event_ids).await?;
        let row = sqlx::query_as!(
            ApiTokenRecord,
            r#"
            INSERT INTO api_tokens (
                id,user_id,organization_id,name,token_digest,scopes,event_ids,
                expires_at,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id,name,scopes,event_ids,expires_at AS "expires_at!",
                      last_used_at,revoked_at,created_at
            "#,
            command.id,
            command.user_id.0,
            command.organization_id.0,
            command.name,
            command.token_digest,
            command.scopes,
            command.event_ids,
            command.expires_at,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let event = token_event(
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
            "auth.api_token.create",
            command.id,
            json!({
                "name": command.name,
                "scopes": command.scopes,
                "event_ids": command.event_ids,
                "expires_at": command.expires_at,
            }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(ApiTokenMutation { record: row, event })
    }

    /// Lists safe credential metadata for one account.
    pub async fn list(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<Vec<ApiTokenRecord>> {
        sqlx::query_as!(
            ApiTokenRecord,
            r#"
            SELECT id,name,scopes,event_ids,expires_at AS "expires_at!",
                   last_used_at,revoked_at,created_at
            FROM api_tokens
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

    /// Revokes an owned token and commits its audit/outbox records atomically.
    pub async fn revoke(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        token_id: Uuid,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<ApiTokenMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            ApiTokenRecord,
            r#"
            UPDATE api_tokens SET revoked_at = $4
            WHERE id = $1 AND organization_id = $2 AND user_id = $3
              AND revoked_at IS NULL
            RETURNING id,name,scopes,event_ids,expires_at AS "expires_at!",
                      last_used_at,revoked_at,created_at
            "#,
            token_id,
            organization_id.0,
            user_id.0,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let event = token_event(
            organization_id,
            user_id,
            token_id,
            "revoked",
            correlation_id,
            now,
        );
        persist_change(
            &mut tx,
            &event,
            "auth.api_token.revoke",
            token_id,
            json!({ "name": row.name.clone() }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(ApiTokenMutation { record: row, event })
    }

    /// Resolves an unexpired digest and updates coarse last-use telemetry.
    pub async fn authenticate(
        &self,
        token_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<Option<ApiTokenPrincipal>> {
        let row = sqlx::query!(
            r#"
            SELECT
                a.id AS token_id,a.user_id,a.organization_id,u.display_name,
                u.email_normalized AS email,u.email_verified,a.scopes,a.event_ids,
                a.expires_at AS "expires_at!"
            FROM api_tokens a
            JOIN users u ON u.id = a.user_id AND u.organization_id = a.organization_id
            WHERE a.token_digest = $1 AND a.revoked_at IS NULL
              AND a.expires_at > $2 AND u.disabled = false
            "#,
            token_digest,
            now,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        let Some(row) = row else {
            return Ok(None);
        };
        sqlx::query!(
            r#"
            UPDATE api_tokens SET last_used_at = $2::timestamptz
            WHERE id = $1
              AND (
                  last_used_at IS NULL
                  OR last_used_at < $2::timestamptz - interval '5 minutes'
              )
            "#,
            row.token_id,
            now,
        )
        .execute(&self.pool)
        .await
        .map_err(unavailable)?;
        let user_id = row.user_id.ok_or_else(|| {
            DomainError::Unavailable("API token owner integrity check failed".into())
        })?;
        Ok(Some(ApiTokenPrincipal {
            token_id: row.token_id,
            user_id: UserId(user_id),
            organization_id: OrganizationId(row.organization_id),
            display_name: row.display_name,
            email: row.email,
            email_verified: row.email_verified,
            scopes: row.scopes,
            event_ids: row.event_ids,
            expires_at: row.expires_at,
        }))
    }
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
            "token event scope contains an unknown event".into(),
        ))
    }
}

fn token_event(
    organization_id: OrganizationId,
    user_id: UserId,
    token_id: Uuid,
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
        DomainEvent::ApiTokenChanged {
            token_id,
            state: state.to_owned(),
        },
    )
}

async fn persist_change(
    tx: &mut Transaction<'_, Postgres>,
    event: &EventEnvelope,
    action: &str,
    token_id: Uuid,
    metadata: serde_json::Value,
) -> DomainResult<()> {
    let organization_id = event
        .organization_id
        .ok_or_else(|| DomainError::Validation("token event must be tenant-scoped".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,$4,'api_token',$5,$6,$7,$8)
        "#,
        Uuid::now_v7(),
        organization_id.0,
        event.actor_id.map(|id| id.0),
        action,
        token_id.to_string(),
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
    DomainError::Unavailable(format!("postgres API token: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("API token already exists".into())
    } else {
        unavailable(error)
    }
}
