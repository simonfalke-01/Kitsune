use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError,
    identity::{EventId, NotificationId},
};
use kitsune_db::notifications::{
    AnnouncementRecord, CreateAnnouncement, NotificationCursor, NotificationFeedItem,
    NotificationRepository,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

const DEFAULT_FEED_LIMIT: u16 = 50;
const MAX_FEED_LIMIT: u16 = 100;
const DEFAULT_HISTORY_LIMIT: u16 = 50;
const MAX_HISTORY_LIMIT: u16 = 250;
const MAX_CURSOR_BYTES: usize = 512;
const MAX_ANNOUNCEMENT_BYTES: usize = 64 * 1024;

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct NotificationQuery {
    /// Opaque cursor returned by the preceding page.
    pub cursor: Option<String>,
    /// Page size from 1 through 100.
    pub limit: Option<u16>,
}

#[derive(Debug, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct AnnouncementQuery {
    /// History size from 1 through 250.
    pub limit: Option<u16>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationResponse {
    pub id: Uuid,
    pub event_id: Option<Uuid>,
    pub template: String,
    pub data: Value,
    pub priority: i16,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub read_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct NotificationPageResponse {
    pub items: Vec<NotificationResponse>,
    pub unread_count: i64,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AnnouncementResponse {
    pub id: Uuid,
    pub event_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub data: Value,
    pub priority: i16,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub retracted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateAnnouncementRequest {
    pub event_id: Option<Uuid>,
    pub data: Value,
    pub priority: i16,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WireCursor {
    created_at: DateTime<Utc>,
    id: Uuid,
}

#[utoipa::path(
    get,
    path = "/api/v1/notifications",
    tag = "notifications",
    params(NotificationQuery),
    responses(
        (status = 200, body = NotificationPageResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn list_notifications(
    State(state): State<AppState>,
    actor: Actor,
    Query(query): Query<NotificationQuery>,
) -> ApiResult<Json<NotificationPageResponse>> {
    actor.require("event_read")?;
    let limit = validate_limit(
        query.limit.unwrap_or(DEFAULT_FEED_LIMIT),
        MAX_FEED_LIMIT,
        "notification page",
    )?;
    let cursor = query.cursor.as_deref().map(decode_cursor).transpose()?;
    let page = NotificationRepository::new(state.db.pool().clone())
        .feed(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            cursor,
            limit,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(NotificationPageResponse {
        items: page.items.into_iter().map(Into::into).collect(),
        unread_count: page.unread_count,
        next_cursor: page.next_cursor.map(encode_cursor).transpose()?,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/notifications/{notification_id}/read",
    tag = "notifications",
    params(("notification_id" = Uuid, Path, description = "Notification ID")),
    responses(
        (status = 204, description = "Notification marked read"),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn mark_notification_read(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(notification_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("event_read")?;
    actor.require_csrf(&headers)?;
    if let Some(envelope) = NotificationRepository::new(state.db.pool().clone())
        .mark_read(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            NotificationId(notification_id),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?
    {
        state
            .event_bus
            .publish(envelope)
            .await
            .map_err(ApiError::from)?;
    }
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/announcements",
    tag = "announcements",
    params(AnnouncementQuery),
    responses(
        (status = 200, body = [AnnouncementResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn list_announcements(
    State(state): State<AppState>,
    actor: Actor,
    Query(query): Query<AnnouncementQuery>,
) -> ApiResult<Json<Vec<AnnouncementResponse>>> {
    actor.require("event_manage")?;
    let limit = validate_limit(
        query.limit.unwrap_or(DEFAULT_HISTORY_LIMIT),
        MAX_HISTORY_LIMIT,
        "announcement history",
    )?;
    let announcements = NotificationRepository::new(state.db.pool().clone())
        .announcements(actor.session.account.organization_id, limit)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(announcements.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/announcements",
    tag = "announcements",
    request_body = CreateAnnouncementRequest,
    responses(
        (status = 201, body = AnnouncementResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_announcement(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateAnnouncementRequest>,
) -> ApiResult<(StatusCode, Json<AnnouncementResponse>)> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let now = Utc::now();
    validate_announcement(&request, now)?;
    let (announcement, envelope) = NotificationRepository::new(state.db.pool().clone())
        .create_announcement(CreateAnnouncement {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            announcement_id: NotificationId::new(),
            event_id: request.event_id.map(EventId),
            data: &request.data,
            priority: request.priority,
            expires_at: request.expires_at,
            now,
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok((
        StatusCode::CREATED,
        Json(AnnouncementResponse::from(announcement)),
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/announcements/{notification_id}",
    tag = "announcements",
    params(("notification_id" = Uuid, Path, description = "Notification ID")),
    responses(
        (status = 204, description = "Announcement retracted"),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn retract_announcement(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(notification_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let envelope = NotificationRepository::new(state.db.pool().clone())
        .retract_announcement(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            NotificationId(notification_id),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

impl From<NotificationFeedItem> for NotificationResponse {
    fn from(item: NotificationFeedItem) -> Self {
        Self {
            id: item.id,
            event_id: item.event_id,
            template: item.template,
            data: item.data,
            priority: item.priority,
            created_at: item.created_at,
            expires_at: item.expires_at,
            read_at: item.read_at,
        }
    }
}

impl From<AnnouncementRecord> for AnnouncementResponse {
    fn from(record: AnnouncementRecord) -> Self {
        Self {
            id: record.id,
            event_id: record.event_id,
            created_by: record.created_by,
            data: record.data,
            priority: record.priority,
            created_at: record.created_at,
            expires_at: record.expires_at,
            retracted_at: record.retracted_at,
        }
    }
}

fn validate_limit(limit: u16, maximum: u16, label: &str) -> ApiResult<u16> {
    if limit == 0 || limit > maximum {
        return Err(ApiError::from(DomainError::Validation(format!(
            "{label} limit must be between 1 and {maximum}"
        ))));
    }
    Ok(limit)
}

fn validate_announcement(request: &CreateAnnouncementRequest, now: DateTime<Utc>) -> ApiResult<()> {
    if !(0..=2).contains(&request.priority) {
        return Err(ApiError::from(DomainError::Validation(
            "announcement priority must be between 0 and 2".into(),
        )));
    }
    if !request.data.is_object()
        || serde_json::to_vec(&request.data)
            .map_err(|error| ApiError::from(DomainError::Validation(error.to_string())))?
            .len()
            > MAX_ANNOUNCEMENT_BYTES
    {
        return Err(ApiError::from(DomainError::Validation(
            "announcement data must be a JSON object no larger than 64 KiB".into(),
        )));
    }
    if request
        .expires_at
        .is_some_and(|expires_at| expires_at <= now)
    {
        return Err(ApiError::from(DomainError::Validation(
            "announcement expiry must be in the future".into(),
        )));
    }
    Ok(())
}

fn encode_cursor(cursor: NotificationCursor) -> ApiResult<String> {
    let serialized = serde_json::to_vec(&WireCursor {
        created_at: cursor.created_at,
        id: cursor.id,
    })
    .map_err(|error| ApiError::from(DomainError::Unavailable(error.to_string())))?;
    Ok(URL_SAFE_NO_PAD.encode(serialized))
}

fn decode_cursor(encoded: &str) -> ApiResult<NotificationCursor> {
    if encoded.is_empty() || encoded.len() > MAX_CURSOR_BYTES {
        return Err(ApiError::from(DomainError::Validation(
            "notification cursor is invalid".into(),
        )));
    }
    let decoded = URL_SAFE_NO_PAD.decode(encoded).map_err(|_| {
        ApiError::from(DomainError::Validation(
            "notification cursor is invalid".into(),
        ))
    })?;
    let cursor = serde_json::from_slice::<WireCursor>(&decoded).map_err(|_| {
        ApiError::from(DomainError::Validation(
            "notification cursor is invalid".into(),
        ))
    })?;
    Ok(NotificationCursor {
        created_at: cursor.created_at,
        id: cursor.id,
    })
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_db::notifications::NotificationCursor;
    use serde_json::json;
    use uuid::Uuid;

    use super::{
        CreateAnnouncementRequest, decode_cursor, encode_cursor, validate_announcement,
        validate_limit,
    };

    #[test]
    fn notification_inputs_are_bounded() {
        let cursor = NotificationCursor {
            created_at: Utc::now(),
            id: Uuid::now_v7(),
        };
        let encoded = encode_cursor(cursor).expect("encode cursor");
        assert_eq!(decode_cursor(&encoded).expect("decode cursor"), cursor);
        assert!(decode_cursor("not+base64").is_err());
        assert!(validate_limit(1, 100, "notification page").is_ok());
        assert!(validate_limit(0, 100, "notification page").is_err());
        assert!(
            validate_announcement(
                &CreateAnnouncementRequest {
                    event_id: None,
                    data: json!({"title": "Notice"}),
                    priority: 2,
                    expires_at: Some(Utc::now() + Duration::hours(1)),
                },
                Utc::now(),
            )
            .is_ok()
        );
        assert!(
            validate_announcement(
                &CreateAnnouncementRequest {
                    event_id: None,
                    data: json!("not an object"),
                    priority: 3,
                    expires_at: None,
                },
                Utc::now(),
            )
            .is_err()
        );
    }
}
