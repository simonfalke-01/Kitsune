//! PostgreSQL persistence for Kitsune.
//!
//! Migrations are embedded into the binary. All write-side operations run in a
//! transaction with their audit record and outbox events.

use std::time::Duration;

pub mod auth;
pub mod engagement;
pub mod oauth;
pub mod oidc;
pub mod resources;
pub mod submissions;
pub mod teams;
pub mod tokens;

use async_trait::async_trait;
use chrono::Utc;
use kitsune_core::{
    DomainError, DomainResult,
    events::AuditEntry,
    ports::{CommandResult, DataStore, PersistedCommand},
};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, postgres::PgPoolOptions};
use uuid::Uuid;

/// Embedded, forward-only schema migrations.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Production PostgreSQL store.
#[derive(Debug, Clone)]
pub struct PostgresStore {
    pool: PgPool,
}

impl PostgresStore {
    /// Connects a bounded pool without running migrations.
    ///
    /// # Errors
    ///
    /// Returns `Unavailable` when PostgreSQL cannot be reached.
    pub async fn connect(database_url: &str, max_connections: u32) -> DomainResult<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(5))
            .idle_timeout(Duration::from_mins(5))
            .connect(database_url)
            .await
            .map_err(unavailable)?;
        Ok(Self { pool })
    }

    /// Wraps an existing pool, useful for tests and dependency composition.
    pub const fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns the pool for typed feature repositories.
    pub const fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Applies every embedded migration exactly once.
    ///
    /// # Errors
    ///
    /// Returns `Unavailable` when a migration cannot be applied.
    pub async fn migrate(&self) -> DomainResult<()> {
        MIGRATOR.run(&self.pool).await.map_err(unavailable)
    }

    /// Checks the primary database connection for readiness.
    ///
    /// # Errors
    ///
    /// Returns `Unavailable` when the check fails.
    pub async fn ready(&self) -> DomainResult<()> {
        sqlx::query_scalar!("SELECT 1 AS \"value!\"")
            .fetch_one(&self.pool)
            .await
            .map(|_| ())
            .map_err(unavailable)
    }
}

#[async_trait]
impl DataStore for PostgresStore {
    async fn transact(&self, command: PersistedCommand) -> DomainResult<CommandResult> {
        let payload = serde_json::to_vec(&command.payload)
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        let payload_sha256 = Sha256::digest(payload).to_vec();
        let mut tx = self.pool.begin().await.map_err(unavailable)?;

        if let Some(receipt) = sqlx::query!(
            r#"
            SELECT kind, payload_sha256, aggregate_version, response
            FROM command_receipts
            WHERE idempotency_key = $1
            FOR UPDATE
            "#,
            command.idempotency_key
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        {
            if receipt.kind != command.kind || receipt.payload_sha256 != payload_sha256 {
                return Err(DomainError::Conflict(
                    "idempotency key was used for a different command".into(),
                ));
            }
            tx.commit().await.map_err(unavailable)?;
            return Ok(CommandResult {
                version: u64::try_from(receipt.aggregate_version)
                    .map_err(|_| DomainError::Conflict("invalid stored version".into()))?,
                response: receipt.response,
                replayed: true,
            });
        }

        let version = command.expected_version.unwrap_or(0).saturating_add(1);
        let stored_version = i64::try_from(version)
            .map_err(|_| DomainError::Validation("aggregate version is too large".into()))?;

        sqlx::query!(
            r#"
            INSERT INTO audit_log (
                id, organization_id, event_id, actor_id, action, resource_type,
                resource_id, metadata, correlation_id, occurred_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            "#,
            command.audit.id,
            command.audit.organization_id.0,
            command.audit.event_id.map(|id| id.0),
            command.audit.actor_id.map(|id| id.0),
            command.audit.action,
            command.audit.resource_type,
            command.audit.resource_id,
            command.audit.metadata,
            command.audit.correlation_id,
            command.audit.occurred_at,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;

        for event in &command.events {
            let envelope = serde_json::to_value(event)
                .map_err(|error| DomainError::Validation(error.to_string()))?;
            sqlx::query!(
                r#"
                INSERT INTO event_outbox (
                    id, organization_id, event_id, kind, envelope, occurred_at, created_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7)
                "#,
                event.id,
                event.organization_id.map(|id| id.0),
                event.event_id.map(|id| id.0),
                event.kind(),
                envelope,
                event.occurred_at,
                Utc::now(),
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }

        let response = command.payload;
        sqlx::query!(
            r#"
            INSERT INTO command_receipts (
                idempotency_key, kind, payload_sha256, aggregate_version, response, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            "#,
            command.idempotency_key,
            command.kind,
            payload_sha256,
            stored_version,
            response,
            Utc::now(),
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;

        tx.commit().await.map_err(unavailable)?;
        Ok(CommandResult {
            version,
            response,
            replayed: false,
        })
    }

    async fn audit_page(
        &self,
        organization: Uuid,
        after: Option<Uuid>,
        limit: u32,
    ) -> DomainResult<Vec<AuditEntry>> {
        let limit = i64::from(limit.clamp(1, 250));
        let rows = sqlx::query!(
            r#"
            SELECT id, organization_id, event_id, actor_id, action, resource_type,
                   resource_id, metadata, correlation_id, occurred_at
            FROM audit_log
            WHERE organization_id = $1
              AND ($2::uuid IS NULL OR id < $2)
            ORDER BY id DESC
            LIMIT $3
            "#,
            organization,
            after,
            limit,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;

        Ok(rows
            .into_iter()
            .map(|row| AuditEntry {
                id: row.id,
                organization_id: kitsune_core::identity::OrganizationId(row.organization_id),
                event_id: row.event_id.map(kitsune_core::identity::EventId),
                actor_id: row.actor_id.map(kitsune_core::identity::UserId),
                action: row.action,
                resource_type: row.resource_type,
                resource_id: row.resource_id,
                metadata: row.metadata,
                correlation_id: row.correlation_id,
                occurred_at: row.occurred_at,
            })
            .collect())
    }

    async fn acknowledge_event(&self, event_id: Uuid, consumer: &str) -> DomainResult<()> {
        if consumer.trim().is_empty() || consumer.len() > 120 {
            return Err(DomainError::Validation(
                "consumer key must contain 1 to 120 characters".into(),
            ));
        }
        sqlx::query!(
            r#"
            INSERT INTO event_deliveries (event_id, consumer, delivered_at)
            VALUES ($1,$2,$3)
            ON CONFLICT (event_id, consumer) DO NOTHING
            "#,
            event_id,
            consumer,
            Utc::now(),
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(unavailable)
    }
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres: {error}"))
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use kitsune_core::{
        events::{AuditEntry, DomainEvent, EventEnvelope},
        identity::{OrganizationId, UserId},
        ports::{DataStore, PersistedCommand},
    };
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{MIGRATOR, PostgresStore};

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn transaction_is_audited_outboxed_and_idempotent(pool: PgPool) {
        let store = PostgresStore::from_pool(pool);
        let organization = OrganizationId::new();
        let actor = UserId::new();
        let now = Utc::now();
        sqlx::query!(
            "INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,$2,$3,$4)",
            organization.0,
            "Kitsune Test",
            format!("test-{organization}"),
            now,
        )
        .execute(store.pool())
        .await
        .expect("organization");
        sqlx::query!(
            r#"
            INSERT INTO users (
                id,organization_id,email,email_normalized,display_name,email_verified,
                disabled,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,false,false,'{}',$6,$6)
            "#,
            actor.0,
            organization.0,
            "actor@example.test",
            "actor@example.test",
            "Actor",
            now,
        )
        .execute(store.pool())
        .await
        .expect("actor");

        let correlation = Uuid::now_v7();
        let event = EventEnvelope::new(
            organization,
            None,
            Some(actor),
            correlation,
            now,
            DomainEvent::UserCreated { user_id: actor },
        );
        let command = PersistedCommand {
            idempotency_key: Uuid::now_v7(),
            expected_version: Some(4),
            kind: "identity.user.create".into(),
            payload: serde_json::json!({"user_id": actor}),
            events: vec![event.clone()],
            audit: AuditEntry {
                id: Uuid::now_v7(),
                organization_id: organization,
                event_id: None,
                actor_id: Some(actor),
                action: "identity.user.create".into(),
                resource_type: "user".into(),
                resource_id: actor.to_string(),
                metadata: serde_json::json!({}),
                correlation_id: correlation,
                occurred_at: now,
            },
        };

        let first = store
            .transact(command.clone())
            .await
            .expect("first command");
        let replay = store.transact(command).await.expect("replay command");
        assert_eq!(first.version, 5);
        assert!(!first.replayed);
        assert!(replay.replayed);

        let audit = store
            .audit_page(organization.0, None, 50)
            .await
            .expect("audit page");
        assert_eq!(audit.len(), 1);
        store
            .acknowledge_event(event.id, "test-consumer")
            .await
            .expect("acknowledge");
        store
            .acknowledge_event(event.id, "test-consumer")
            .await
            .expect("idempotent acknowledge");
    }
}
