//! Searchable, cursor-paginated organizer audit history.

use axum::{
    Json,
    extract::{Query, State},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use kitsune_core::{DomainError, events::AuditEntry, identity::EventId};
use kitsune_db::audit::{AuditCursor, AuditFilter, AuditRepository};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

const DEFAULT_PAGE_SIZE: u16 = 50;
const MAX_PAGE_SIZE: u16 = 250;
const MAX_CURSOR_BYTES: usize = 512;

/// Audit-history query filters.
#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AuditQuery {
    /// Opaque cursor returned by the preceding page.
    pub cursor: Option<String>,
    /// Page size from 1 through 250.
    pub limit: Option<u16>,
    /// Exact event scope.
    pub event_id: Option<Uuid>,
    /// Exact actor scope.
    pub actor_id: Option<Uuid>,
    /// Exact stable action key.
    pub action: Option<String>,
    /// Exact resource type.
    pub resource_type: Option<String>,
    /// Inclusive earliest occurrence.
    pub occurred_after: Option<DateTime<Utc>>,
    /// Inclusive latest occurrence.
    pub occurred_before: Option<DateTime<Utc>>,
}

/// Safe immutable audit entry.
#[derive(Debug, Serialize, ToSchema)]
pub struct AuditEntryResponse {
    /// Audit entry ID.
    pub id: Uuid,
    /// Owning organization.
    pub organization_id: Uuid,
    /// Optional event scope.
    pub event_id: Option<Uuid>,
    /// Optional initiating user.
    pub actor_id: Option<Uuid>,
    /// Stable action key.
    pub action: String,
    /// Resource classification.
    pub resource_type: String,
    /// Resource identifier or safe key.
    pub resource_id: String,
    /// Safe structured context.
    pub metadata: Value,
    /// Correlation ID spanning the command and its effects.
    pub correlation_id: Uuid,
    /// Authoritative occurrence time.
    pub occurred_at: DateTime<Utc>,
}

/// One descending audit-history page.
#[derive(Debug, Serialize, ToSchema)]
pub struct AuditPageResponse {
    /// Immutable entries in descending chronology.
    pub entries: Vec<AuditEntryResponse>,
    /// Opaque cursor for the next page, when one exists.
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WireCursor {
    occurred_at: DateTime<Utc>,
    id: Uuid,
}

#[utoipa::path(
    get,
    path = "/api/v1/audit",
    tag = "audit",
    params(AuditQuery),
    responses(
        (status = 200, body = AuditPageResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn list_audit(
    State(state): State<AppState>,
    actor: Actor,
    Query(query): Query<AuditQuery>,
) -> ApiResult<Json<AuditPageResponse>> {
    actor.require("audit_read")?;
    let limit = query.limit.unwrap_or(DEFAULT_PAGE_SIZE);
    if limit == 0 || limit > MAX_PAGE_SIZE {
        return Err(ApiError::from(DomainError::Validation(
            "audit page limit must be between 1 and 250".into(),
        )));
    }
    let cursor = query.cursor.as_deref().map(decode_cursor).transpose()?;
    let action = query.action.map(validate_filter_key).transpose()?;
    let resource_type = query.resource_type.map(validate_filter_key).transpose()?;
    let filter = AuditFilter {
        event_id: query.event_id.map(EventId),
        actor_id: query.actor_id.map(kitsune_core::identity::UserId),
        action,
        resource_type,
        occurred_after: query.occurred_after,
        occurred_before: query.occurred_before,
    };
    let page = AuditRepository::new(state.db.pool().clone())
        .page(
            actor.session.account.organization_id,
            cursor,
            &filter,
            limit,
        )
        .await
        .map_err(ApiError::from)?;
    let next_cursor = page.next_cursor.map(encode_cursor).transpose()?;
    Ok(Json(AuditPageResponse {
        entries: page.entries.into_iter().map(Into::into).collect(),
        next_cursor,
    }))
}

impl From<AuditEntry> for AuditEntryResponse {
    fn from(entry: AuditEntry) -> Self {
        Self {
            id: entry.id,
            organization_id: entry.organization_id.0,
            event_id: entry.event_id.map(|id| id.0),
            actor_id: entry.actor_id.map(|id| id.0),
            action: entry.action,
            resource_type: entry.resource_type,
            resource_id: entry.resource_id,
            metadata: entry.metadata,
            correlation_id: entry.correlation_id,
            occurred_at: entry.occurred_at,
        }
    }
}

fn validate_filter_key(value: String) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 100
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':'))
    {
        return Err(ApiError::from(DomainError::Validation(
            "audit filter keys must contain 1 to 100 safe ASCII characters".into(),
        )));
    }
    Ok(value.to_owned())
}

fn encode_cursor(cursor: AuditCursor) -> ApiResult<String> {
    let serialized = serde_json::to_vec(&WireCursor {
        occurred_at: cursor.occurred_at,
        id: cursor.id,
    })
    .map_err(|error| ApiError::from(DomainError::Unavailable(error.to_string())))?;
    Ok(URL_SAFE_NO_PAD.encode(serialized))
}

fn decode_cursor(encoded: &str) -> ApiResult<AuditCursor> {
    if encoded.is_empty() || encoded.len() > MAX_CURSOR_BYTES {
        return Err(ApiError::from(DomainError::Validation(
            "audit cursor is invalid".into(),
        )));
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| ApiError::from(DomainError::Validation("audit cursor is invalid".into())))?;
    let cursor = serde_json::from_slice::<WireCursor>(&decoded)
        .map_err(|_| ApiError::from(DomainError::Validation("audit cursor is invalid".into())))?;
    Ok(AuditCursor {
        occurred_at: cursor.occurred_at,
        id: cursor.id,
    })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use kitsune_db::audit::AuditCursor;
    use uuid::Uuid;

    use super::{decode_cursor, encode_cursor, validate_filter_key};

    #[test]
    fn cursors_round_trip_and_filter_keys_are_bounded() {
        let cursor = AuditCursor {
            occurred_at: Utc::now(),
            id: Uuid::now_v7(),
        };
        let encoded = encode_cursor(cursor).expect("encode cursor");
        assert_eq!(decode_cursor(&encoded).expect("decode cursor"), cursor);
        assert!(decode_cursor("not+base64").is_err());
        assert_eq!(
            validate_filter_key("challenge.create".into()).expect("filter key"),
            "challenge.create"
        );
        assert!(validate_filter_key("unsafe filter".into()).is_err());
    }
}
