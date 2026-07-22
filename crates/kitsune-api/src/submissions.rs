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
    HintRecord, HintUnlockResult, ManualReviewRecord, NewHintUnlock, NewManualReview,
    NewSubmission, ScoreHistoryPointRecord, ScoreHistoryRecord, ScoreHistorySeriesRecord,
    ScoreboardRecord, ScoreboardRowRecord, SubmissionRepository, SubmissionResult,
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

/// Bounded historical-score projection options.
#[derive(Debug, Deserialize, IntoParams)]
pub struct ScoreHistoryQuery {
    /// Limit series to a division.
    pub division_id: Option<Uuid>,
    /// Number of leading competitors to return; defaults to 5 and caps at 20.
    pub limit: Option<u8>,
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

/// One running-total point in score history.
#[derive(Serialize, ToSchema)]
pub struct ScoreHistoryPointResponse {
    /// Global score-ledger sequence.
    pub sequence: i64,
    /// Running visible score.
    pub score: i64,
    /// Entry timestamp.
    pub occurred_at: DateTime<Utc>,
}

/// One competitor's historical score series.
#[derive(Serialize, ToSchema)]
pub struct ScoreHistorySeriesResponse {
    /// `user` or `team`.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Ordered running totals.
    pub points: Vec<ScoreHistoryPointResponse>,
}

/// Historical graph data under scoreboard concealment rules.
#[derive(Serialize, ToSchema)]
pub struct ScoreHistoryResponse {
    /// Organizer has hidden the public board.
    pub hidden: bool,
    /// Post-freeze entries are concealed from players.
    pub frozen: bool,
    /// Competitor histories.
    pub series: Vec<ScoreHistorySeriesResponse>,
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

/// Pending manual-verification evidence visible only to submission managers.
#[derive(Serialize, ToSchema)]
pub struct ManualReviewResponse {
    /// Submission identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// Challenge display name.
    pub challenge_name: String,
    /// `user` or `team`.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Competitor display name.
    pub competitor_name: String,
    /// Decrypted evidence, never persisted or logged as plaintext.
    pub answer: String,
    /// Submission timestamp.
    pub submitted_at: DateTime<Utc>,
}

/// Organizer manual-verification decision.
#[derive(Deserialize, ToSchema)]
pub struct ReviewManualSubmissionRequest {
    /// Accept and score the submission when true; otherwise discard it.
    pub accepted: bool,
    /// Optional reviewer note, up to 10,000 bytes.
    pub note: Option<String>,
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
    let sealed_answer = state
        .auth
        .seal(request.answer.as_bytes())
        .map_err(ApiError::from)?;
    let result = SubmissionRepository::new(state.db.pool().clone())
        .submit(NewSubmission {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            challenge_id: ChallengeId(challenge_id),
            actor: actor.session.account.user_id,
            session_id: actor.session.account.session_id,
            idempotency_key: request.idempotency_key,
            answer: &request.answer,
            sealed_answer: &sealed_answer,
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
    path = "/api/v1/events/{event_id}/manual-reviews",
    tag = "submissions",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = [ManualReviewResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn manual_review_queue(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<ManualReviewResponse>>> {
    actor.require("submission_manage")?;
    let records = SubmissionRepository::new(state.db.pool().clone())
        .manual_review_queue(actor.session.account.organization_id, EventId(event_id))
        .await
        .map_err(ApiError::from)?;
    let responses = records
        .into_iter()
        .map(|record| decrypt_manual_review(&state, record))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(responses))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/manual-reviews/{submission_id}",
    tag = "submissions",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("submission_id" = Uuid, Path, description = "Submission ID")
    ),
    request_body = ReviewManualSubmissionRequest,
    responses(
        (status = 200, body = SubmissionResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn review_manual_submission(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, submission_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<ReviewManualSubmissionRequest>,
) -> ApiResult<Json<SubmissionResponse>> {
    actor.require("submission_manage")?;
    actor.require_csrf(&headers)?;
    let result = SubmissionRepository::new(state.db.pool().clone())
        .review_manual_submission(NewManualReview {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            submission_id: kitsune_core::identity::SubmissionId(submission_id),
            reviewer: actor.session.account.user_id,
            accepted: request.accepted,
            note: request.note.as_deref(),
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
    path = "/api/v1/events/{event_id}/score-history",
    tag = "scoreboard",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ScoreHistoryQuery
    ),
    responses(
        (status = 200, body = ScoreHistoryResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn score_history(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
    Query(query): Query<ScoreHistoryQuery>,
) -> ApiResult<Json<ScoreHistoryResponse>> {
    actor.require("scoreboard_read")?;
    let series_limit = i64::from(query.limit.unwrap_or(5).clamp(1, 20));
    let history = SubmissionRepository::new(state.db.pool().clone())
        .score_history(
            actor.session.account.organization_id,
            EventId(event_id),
            query.division_id.map(DivisionId),
            actor.can("scoreboard_manage"),
            series_limit,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(history.into()))
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

impl From<ScoreHistoryRecord> for ScoreHistoryResponse {
    fn from(record: ScoreHistoryRecord) -> Self {
        Self {
            hidden: record.hidden,
            frozen: record.frozen,
            series: record
                .series
                .into_iter()
                .map(ScoreHistorySeriesResponse::from)
                .collect(),
        }
    }
}

impl From<ScoreHistorySeriesRecord> for ScoreHistorySeriesResponse {
    fn from(record: ScoreHistorySeriesRecord) -> Self {
        Self {
            competitor_kind: record.competitor_kind,
            competitor_id: record.competitor_id,
            name: record.name,
            points: record
                .points
                .into_iter()
                .map(ScoreHistoryPointResponse::from)
                .collect(),
        }
    }
}

impl From<ScoreHistoryPointRecord> for ScoreHistoryPointResponse {
    fn from(record: ScoreHistoryPointRecord) -> Self {
        Self {
            sequence: record.sequence,
            score: record.score,
            occurred_at: record.occurred_at,
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

fn decrypt_manual_review(
    state: &AppState,
    record: ManualReviewRecord,
) -> ApiResult<ManualReviewResponse> {
    let plaintext = state
        .auth
        .open(&record.answer_ciphertext)
        .map_err(ApiError::from)?;
    let answer = String::from_utf8(plaintext).map_err(|_| {
        ApiError::from(kitsune_core::DomainError::Unavailable(
            "manual submission evidence is not valid UTF-8".into(),
        ))
    })?;
    Ok(ManualReviewResponse {
        id: record.id,
        challenge_id: record.challenge_id,
        challenge_name: record.challenge_name,
        competitor_kind: record.competitor_kind,
        competitor_id: record.competitor_id,
        competitor_name: record.competitor_name,
        answer,
        submitted_at: record.submitted_at,
    })
}
