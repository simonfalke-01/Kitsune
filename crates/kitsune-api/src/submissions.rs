//! Challenge submission and scoreboard HTTP resources.

use std::time::Duration;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use kitsune_core::identity::{ChallengeId, DivisionId, EventId};
use kitsune_db::submissions::{
    HintRecord, HintUnlockResult, NewHintUnlock, NewSubmission, ScoreboardRecord,
    ScoreboardRowRecord, SubmissionRepository, SubmissionResult,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

const CHALLENGE_ATTEMPTS_PER_MINUTE: u64 = 20;
const GLOBAL_ATTEMPTS_PER_MINUTE: u64 = 60;

/// Idempotent answer submission.
#[derive(Deserialize, ToSchema)]
pub struct SubmitAnswerRequest {
    /// Client-generated UUID reused for safe retries.
    pub idempotency_key: Uuid,
    /// Flag, regular-expression candidate, or selected choice.
    pub answer: String,
}

/// Safe immutable submission receipt.
#[derive(Serialize, ToSchema)]
pub struct SubmissionResponse {
    /// Submission identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// `correct`, `incorrect`, or `pending`.
    pub outcome: String,
    /// Total solve and bonus points awarded.
    pub awarded_points: i64,
    /// First accepted solve marker.
    pub first_blood: bool,
    /// Remaining incorrect attempts when bounded.
    pub attempts_remaining: Option<i32>,
    /// Server receipt time.
    pub submitted_at: DateTime<Utc>,
    /// True when an earlier response was replayed by idempotency key.
    pub replayed: bool,
}

/// Optional scoreboard division filter.
#[derive(Debug, Deserialize, IntoParams)]
pub struct ScoreboardQuery {
    /// Limit rows to a division.
    pub division_id: Option<Uuid>,
}

/// Ranked scoreboard row.
#[derive(Serialize, ToSchema)]
pub struct ScoreboardRowResponse {
    /// One-based public rank.
    pub rank: usize,
    /// `user` or `team`.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Visible score total.
    pub score: i64,
    /// Accepted challenge solve count.
    pub solves: i64,
    /// Earliest-to-reach tie-break timestamp.
    pub reached_at: DateTime<Utc>,
}

/// Scoreboard controls and ordered standings.
#[derive(Serialize, ToSchema)]
pub struct ScoreboardResponse {
    /// Organizer has hidden the public board.
    pub hidden: bool,
    /// Post-freeze entries are concealed from players.
    pub frozen: bool,
    /// Ranked rows.
    pub rows: Vec<ScoreboardRowResponse>,
}

/// Player-safe hint state.
#[derive(Serialize, ToSchema)]
pub struct HintResponse {
    /// Challenge-local identifier.
    pub id: u32,
    /// One-time score cost.
    pub cost: i64,
    /// Content, present only after unlock.
    pub content: Option<String>,
    /// Current competitor unlock state.
    pub unlocked: bool,
}

/// Idempotent hint unlock receipt.
#[derive(Serialize, ToSchema)]
pub struct HintUnlockResponse {
    /// Revealed hint.
    pub hint: HintResponse,
    /// Score points charged by this request.
    pub charged: i64,
    /// True when no second charge was applied.
    pub replayed: bool,
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/submissions",
    tag = "submissions",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    request_body = SubmitAnswerRequest,
    responses(
        (status = 200, body = SubmissionResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn submit_answer(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<SubmitAnswerRequest>,
) -> ApiResult<Json<SubmissionResponse>> {
    actor.require("submission_create")?;
    actor.require_csrf(&headers)?;
    if request.answer.is_empty() || request.answer.len() > 4_096 {
        return Err(ApiError::from(kitsune_core::DomainError::Validation(
            "answer must contain 1 to 4096 bytes".into(),
        )));
    }
    enforce_rate_limit(&state, &actor, event_id, challenge_id).await?;
    let result = SubmissionRepository::new(state.db.pool().clone())
        .submit(NewSubmission {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            challenge_id: ChallengeId(challenge_id),
            actor: actor.session.account.user_id,
            session_id: actor.session.account.session_id,
            idempotency_key: request.idempotency_key,
            answer: &request.answer,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    for envelope in &result.events {
        state
            .event_bus
            .publish(envelope.clone())
            .await
            .map_err(ApiError::from)?;
    }
    Ok(Json(result.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/scoreboard",
    tag = "scoreboard",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ScoreboardQuery
    ),
    responses(
        (status = 200, body = ScoreboardResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn scoreboard(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
    Query(query): Query<ScoreboardQuery>,
) -> ApiResult<Json<ScoreboardResponse>> {
    actor.require("scoreboard_read")?;
    let board = SubmissionRepository::new(state.db.pool().clone())
        .scoreboard(
            actor.session.account.organization_id,
            EventId(event_id),
            query.division_id.map(DivisionId),
            actor.can("scoreboard_manage"),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(board.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/hints",
    tag = "challenges",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    responses(
        (status = 200, body = [HintResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn list_hints(
    State(state): State<AppState>,
    actor: Actor,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Vec<HintResponse>>> {
    actor.require("challenge_read")?;
    let rows = SubmissionRepository::new(state.db.pool().clone())
        .hints(
            actor.session.account.organization_id,
            EventId(event_id),
            ChallengeId(challenge_id),
            actor.session.account.user_id,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(rows.into_iter().map(HintResponse::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/hints/{hint_id}/unlock",
    tag = "challenges",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID"),
        ("hint_id" = u32, Path, description = "Hint ID")
    ),
    responses(
        (status = 200, body = HintUnlockResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn unlock_hint(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, challenge_id, hint_id)): Path<(Uuid, Uuid, u32)>,
) -> ApiResult<Json<HintUnlockResponse>> {
    actor.require("submission_create")?;
    actor.require_csrf(&headers)?;
    enforce_hint_rate_limit(&state, &actor, challenge_id).await?;
    let result = SubmissionRepository::new(state.db.pool().clone())
        .unlock_hint(NewHintUnlock {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            challenge_id: ChallengeId(challenge_id),
            actor: actor.session.account.user_id,
            hint_id,
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    for envelope in &result.events {
        state
            .event_bus
            .publish(envelope.clone())
            .await
            .map_err(ApiError::from)?;
    }
    Ok(Json(result.into()))
}

async fn enforce_rate_limit(
    state: &AppState,
    actor: &Actor,
    event_id: Uuid,
    challenge_id: Uuid,
) -> ApiResult<()> {
    let organization_id = actor.session.account.organization_id;
    let user_id = actor.session.account.user_id;
    let global_key = format!("submission:global:{organization_id}:{event_id}:{user_id}");
    let challenge_key = format!("submission:challenge:{organization_id}:{challenge_id}:{user_id}");
    let ttl = Duration::from_secs(60);
    let global = state
        .cache
        .increment(&global_key, ttl)
        .await
        .map_err(ApiError::from)?;
    let challenge = state
        .cache
        .increment(&challenge_key, ttl)
        .await
        .map_err(ApiError::from)?;
    if global > GLOBAL_ATTEMPTS_PER_MINUTE || challenge > CHALLENGE_ATTEMPTS_PER_MINUTE {
        Err(ApiError::rate_limited())
    } else {
        Ok(())
    }
}

async fn enforce_hint_rate_limit(
    state: &AppState,
    actor: &Actor,
    challenge_id: Uuid,
) -> ApiResult<()> {
    let key = format!(
        "hint:unlock:{}:{challenge_id}:{}",
        actor.session.account.organization_id, actor.session.account.user_id
    );
    let attempts = state
        .cache
        .increment(&key, Duration::from_secs(60))
        .await
        .map_err(ApiError::from)?;
    if attempts > 10 {
        Err(ApiError::rate_limited())
    } else {
        Ok(())
    }
}

impl From<SubmissionResult> for SubmissionResponse {
    fn from(result: SubmissionResult) -> Self {
        Self {
            id: result.record.id,
            challenge_id: result.record.challenge_id,
            outcome: result.record.outcome,
            awarded_points: result.record.awarded_points,
            first_blood: result.record.first_blood,
            attempts_remaining: result.record.attempts_remaining,
            submitted_at: result.record.submitted_at,
            replayed: result.replayed,
        }
    }
}

impl From<ScoreboardRecord> for ScoreboardResponse {
    fn from(board: ScoreboardRecord) -> Self {
        Self {
            hidden: board.hidden,
            frozen: board.frozen,
            rows: board
                .rows
                .into_iter()
                .enumerate()
                .map(|(index, row)| ScoreboardRowResponse::from_record(index + 1, row))
                .collect(),
        }
    }
}

impl ScoreboardRowResponse {
    fn from_record(rank: usize, row: ScoreboardRowRecord) -> Self {
        Self {
            rank,
            competitor_kind: row.competitor_kind,
            competitor_id: row.competitor_id,
            name: row.name,
            score: row.score,
            solves: row.solves,
            reached_at: row.reached_at,
        }
    }
}

impl From<HintRecord> for HintResponse {
    fn from(hint: HintRecord) -> Self {
        Self {
            id: hint.id,
            cost: hint.cost,
            content: hint.content,
            unlocked: hint.unlocked,
        }
    }
}

impl From<HintUnlockResult> for HintUnlockResponse {
    fn from(result: HintUnlockResult) -> Self {
        Self {
            hint: result.hint.into(),
            charged: result.charged,
            replayed: result.replayed,
        }
    }
}
