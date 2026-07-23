//! Immutable, tenant-scoped audit history projections.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    events::AuditEntry,
    identity::{EventId, OrganizationId, UserId},
};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Stable keyset cursor for descending audit chronology.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuditCursor {
    /// Event occurrence time.
    pub occurred_at: DateTime<Utc>,
    /// Tie-break identifier.
    pub id: Uuid,
}

/// Bounded exact-match audit filters.
#[derive(Debug, Clone, Default)]
pub struct AuditFilter {
    /// Optional event scope.
    pub event_id: Option<EventId>,
    /// Optional actor scope.
    pub actor_id: Option<UserId>,
    /// Optional exact action key.
    pub action: Option<String>,
    /// Optional exact resource type.
    pub resource_type: Option<String>,
    /// Inclusive earliest occurrence.
    pub occurred_after: Option<DateTime<Utc>>,
    /// Inclusive latest occurrence.
    pub occurred_before: Option<DateTime<Utc>>,
}

/// One immutable audit page and the cursor for its successor.
#[derive(Debug, Clone, PartialEq)]
pub struct AuditPage {
    /// Descending chronological entries.
    pub entries: Vec<AuditEntry>,
    /// Present only when another page exists.
    pub next_cursor: Option<AuditCursor>,
}

#[derive(Debug)]
struct AuditRecord {
    id: Uuid,
    organization_id: Uuid,
    event_id: Option<Uuid>,
    actor_id: Option<Uuid>,
    action: String,
    resource_type: String,
    resource_id: String,
    metadata: Value,
    correlation_id: Uuid,
    occurred_at: DateTime<Utc>,
}

/// PostgreSQL audit-history reader.
#[derive(Debug, Clone)]
pub struct AuditRepository {
    pool: PgPool,
}

impl AuditRepository {
    /// Wraps an existing pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns a keyset-paginated tenant audit page.
    pub async fn page(
        &self,
        organization_id: OrganizationId,
        cursor: Option<AuditCursor>,
        filter: &AuditFilter,
        limit: u16,
    ) -> DomainResult<AuditPage> {
        if limit == 0 || limit > 250 {
            return Err(DomainError::Validation(
                "audit page limit must be between 1 and 250".into(),
            ));
        }
        if filter
            .occurred_after
            .zip(filter.occurred_before)
            .is_some_and(|(after, before)| after > before)
        {
            return Err(DomainError::Validation(
                "audit occurrence range is inverted".into(),
            ));
        }

        let cursor_time = cursor.map(|value| value.occurred_at);
        let cursor_id = cursor.map(|value| value.id);
        let row_limit = i64::from(limit) + 1;
        let mut rows = sqlx::query_as!(
            AuditRecord,
            r#"
            SELECT id,organization_id,event_id,actor_id,action,resource_type,
                   resource_id,metadata,correlation_id,occurred_at
            FROM audit_log
            WHERE organization_id = $1
              AND ($2::timestamptz IS NULL OR (occurred_at,id) < ($2,$3))
              AND ($4::uuid IS NULL OR event_id = $4)
              AND ($5::uuid IS NULL OR actor_id = $5)
              AND ($6::text IS NULL OR action = $6)
              AND ($7::text IS NULL OR resource_type = $7)
              AND ($8::timestamptz IS NULL OR occurred_at >= $8)
              AND ($9::timestamptz IS NULL OR occurred_at <= $9)
            ORDER BY occurred_at DESC,id DESC
            LIMIT $10
            "#,
            organization_id.0,
            cursor_time,
            cursor_id,
            filter.event_id.map(|id| id.0),
            filter.actor_id.map(|id| id.0),
            filter.action.as_deref(),
            filter.resource_type.as_deref(),
            filter.occurred_after,
            filter.occurred_before,
            row_limit,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        let has_more = rows.len() > usize::from(limit);
        rows.truncate(usize::from(limit));
        let next_cursor = has_more.then(|| {
            let last = rows.last().expect("a page with a successor is non-empty");
            AuditCursor {
                occurred_at: last.occurred_at,
                id: last.id,
            }
        });
        let entries = rows
            .into_iter()
            .map(|row| AuditEntry {
                id: row.id,
                organization_id: OrganizationId(row.organization_id),
                event_id: row.event_id.map(EventId),
                actor_id: row.actor_id.map(UserId),
                action: row.action,
                resource_type: row.resource_type,
                resource_id: row.resource_id,
                metadata: row.metadata,
                correlation_id: row.correlation_id,
                occurred_at: row.occurred_at,
            })
            .collect();
        Ok(AuditPage {
            entries,
            next_cursor,
        })
    }
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres audit: {error}"))
}
