//! Post-solve writeup review and survey resources.

use std::{collections::BTreeMap, time::Duration};

use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use kitsune_core::{
    challenge::WriteupState,
    identity::{ChallengeId, EventId, WriteupId},
};
use kitsune_db::engagement::{
    EngagementRepository, ReviewWriteup, SaveWriteup, SubmitSurvey, SurveyQuestionSummaryRecord,
    SurveyResponseRecord, SurveySummaryRecord, WriteupRecord,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

/// Player writeup draft or submission input.
#[derive(Deserialize, ToSchema)]
pub struct SaveWriteupRequest {
    /// Markdown body, up to 100,000 bytes.
    pub body: String,
    /// Enter the organizer review queue after saving.
    pub submit: bool,
}

/// Organizer-selectable review outcome.
#[derive(Debug, Clone, Copy, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum WriteupReviewStateInput {
    /// Return the writeup to its author with feedback.
    ChangesRequested,
    /// Accept the writeup without publishing it.
    Approved,
    /// Publish an already approved writeup.
    Published,
}

/// Organizer writeup review input.
#[derive(Deserialize, ToSchema)]
pub struct ReviewWriteupRequest {
    /// Requested review state.
    pub state: WriteupReviewStateInput,
    /// Review feedback, required when requesting changes.
    pub feedback: Option<String>,
}

/// Optional review queue state filter.
#[derive(Debug, Deserialize, IntoParams)]
pub struct WriteupQueueQuery {
    /// Stable writeup lifecycle key.
    pub state: Option<String>,
}

/// Player and organizer writeup projection.
#[derive(Serialize, ToSchema)]
pub struct WriteupResponse {
    /// Writeup identifier.
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
    /// Markdown body.
    pub body: String,
    /// Stable lifecycle state.
    pub state: String,
    /// Last reviewer.
    pub reviewer_id: Option<Uuid>,
    /// Organizer feedback.
    pub feedback: Option<String>,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Last update timestamp.
    pub updated_at: DateTime<Utc>,
}

/// Validated post-solve survey submission.
#[derive(Deserialize, ToSchema)]
pub struct SubmitSurveyRequest {
    /// Integer answers keyed by authored question key.
    pub answers: BTreeMap<String, i32>,
}

/// Stable survey receipt.
#[derive(Serialize, ToSchema)]
pub struct SurveyResponse {
    /// Response identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// Validated answers.
    pub answers: BTreeMap<String, i32>,
    /// Last submission timestamp.
    pub submitted_at: DateTime<Utc>,
}

/// Aggregate statistics for one survey question.
#[derive(Serialize, ToSchema)]
pub struct SurveyQuestionSummaryResponse {
    /// Authored key.
    pub key: String,
    /// Authored prompt.
    pub prompt: String,
    /// Responses containing this key.
    pub responses: usize,
    /// Arithmetic mean.
    pub average: Option<f64>,
    /// Lowest response.
    pub minimum: Option<i32>,
    /// Highest response.
    pub maximum: Option<i32>,
}

/// Organizer-safe aggregate survey analytics.
#[derive(Serialize, ToSchema)]
pub struct SurveySummaryResponse {
    /// Total competitor responses.
    pub response_count: usize,
    /// Per-question statistics.
    pub questions: Vec<SurveyQuestionSummaryResponse>,
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/writeup",
    tag = "writeups",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    responses(
        (status = 200, body = WriteupResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn get_writeup(
    State(state): State<AppState>,
    actor: Actor,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<WriteupResponse>> {
    actor.require("challenge_read")?;
    let record = EngagementRepository::new(state.db.pool().clone())
        .writeup(
            actor.session.account.organization_id,
            EventId(event_id),
            ChallengeId(challenge_id),
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(record.into()))
}

#[utoipa::path(
    put,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/writeup",
    tag = "writeups",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    request_body = SaveWriteupRequest,
    responses(
        (status = 200, body = WriteupResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn save_writeup(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<SaveWriteupRequest>,
) -> ApiResult<Json<WriteupResponse>> {
    actor.require("submission_create")?;
    actor.require_csrf(&headers)?;
    enforce_engagement_rate_limit(&state, &actor, "writeup").await?;
    let result = EngagementRepository::new(state.db.pool().clone())
        .save_writeup(SaveWriteup {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            challenge_id: ChallengeId(challenge_id),
            actor: actor.session.account.user_id,
            body: &request.body,
            submit: request.submit,
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    publish_events(&state, result.events).await?;
    Ok(Json(result.record.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/writeups",
    tag = "writeups",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        WriteupQueueQuery
    ),
    responses(
        (status = 200, body = [WriteupResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn list_writeups(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
    Query(query): Query<WriteupQueueQuery>,
) -> ApiResult<Json<Vec<WriteupResponse>>> {
    actor.require("submission_manage")?;
    let state_filter = query
        .state
        .as_deref()
        .map(parse_writeup_state)
        .transpose()
        .map_err(ApiError::from)?;
    let records = EngagementRepository::new(state.db.pool().clone())
        .writeup_queue(
            actor.session.account.organization_id,
            EventId(event_id),
            state_filter,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        records.into_iter().map(WriteupResponse::from).collect(),
    ))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/writeups/{writeup_id}",
    tag = "writeups",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("writeup_id" = Uuid, Path, description = "Writeup ID")
    ),
    request_body = ReviewWriteupRequest,
    responses(
        (status = 200, body = WriteupResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn review_writeup(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, writeup_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<ReviewWriteupRequest>,
) -> ApiResult<Json<WriteupResponse>> {
    actor.require("submission_manage")?;
    actor.require_csrf(&headers)?;
    let result = EngagementRepository::new(state.db.pool().clone())
        .review_writeup(ReviewWriteup {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            writeup_id: WriteupId(writeup_id),
            reviewer: actor.session.account.user_id,
            state: request.state.into(),
            feedback: request.feedback.as_deref(),
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    publish_events(&state, result.events).await?;
    Ok(Json(result.record.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/survey",
    tag = "surveys",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    request_body = SubmitSurveyRequest,
    responses(
        (status = 200, body = SurveyResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn submit_survey(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<SubmitSurveyRequest>,
) -> ApiResult<Json<SurveyResponse>> {
    actor.require("submission_create")?;
    actor.require_csrf(&headers)?;
    enforce_engagement_rate_limit(&state, &actor, "survey").await?;
    let result = EngagementRepository::new(state.db.pool().clone())
        .submit_survey(SubmitSurvey {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            challenge_id: ChallengeId(challenge_id),
            actor: actor.session.account.user_id,
            answers: request.answers,
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    publish_events(&state, result.events).await?;
    Ok(Json(result.record.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/challenges/{challenge_id}/survey-summary",
    tag = "surveys",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("challenge_id" = Uuid, Path, description = "Challenge ID")
    ),
    responses(
        (status = 200, body = SurveySummaryResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn survey_summary(
    State(state): State<AppState>,
    actor: Actor,
    Path((event_id, challenge_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<SurveySummaryResponse>> {
    actor.require("submission_manage")?;
    let record = EngagementRepository::new(state.db.pool().clone())
        .survey_summary(
            actor.session.account.organization_id,
            EventId(event_id),
            ChallengeId(challenge_id),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(record.into()))
}

async fn publish_events(
    state: &AppState,
    events: Vec<kitsune_core::EventEnvelope>,
) -> ApiResult<()> {
    for event in events {
        state
            .event_bus
            .publish(event)
            .await
            .map_err(ApiError::from)?;
    }
    Ok(())
}

async fn enforce_engagement_rate_limit(
    state: &AppState,
    actor: &Actor,
    kind: &str,
) -> ApiResult<()> {
    let key = format!(
        "engagement:{kind}:{}:{}",
        actor.session.account.organization_id, actor.session.account.user_id
    );
    let attempts = state
        .cache
        .increment(&key, Duration::from_secs(60))
        .await
        .map_err(ApiError::from)?;
    if attempts > 20 {
        Err(ApiError::rate_limited())
    } else {
        Ok(())
    }
}

fn parse_writeup_state(value: &str) -> Result<WriteupState, kitsune_core::DomainError> {
    match value {
        "draft" => Ok(WriteupState::Draft),
        "submitted" => Ok(WriteupState::Submitted),
        "changes_requested" => Ok(WriteupState::ChangesRequested),
        "approved" => Ok(WriteupState::Approved),
        "published" => Ok(WriteupState::Published),
        _ => Err(kitsune_core::DomainError::Validation(
            "unknown writeup state filter".into(),
        )),
    }
}

impl From<WriteupReviewStateInput> for WriteupState {
    fn from(state: WriteupReviewStateInput) -> Self {
        match state {
            WriteupReviewStateInput::ChangesRequested => Self::ChangesRequested,
            WriteupReviewStateInput::Approved => Self::Approved,
            WriteupReviewStateInput::Published => Self::Published,
        }
    }
}

impl From<WriteupRecord> for WriteupResponse {
    fn from(record: WriteupRecord) -> Self {
        Self {
            id: record.id,
            challenge_id: record.challenge_id,
            challenge_name: record.challenge_name,
            competitor_kind: record.competitor_kind,
            competitor_id: record.competitor_id,
            competitor_name: record.competitor_name,
            body: record.body,
            state: record.state,
            reviewer_id: record.reviewer_id,
            feedback: record.feedback,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

impl From<SurveyResponseRecord> for SurveyResponse {
    fn from(record: SurveyResponseRecord) -> Self {
        Self {
            id: record.id,
            challenge_id: record.challenge_id,
            answers: record.answers,
            submitted_at: record.submitted_at,
        }
    }
}

impl From<SurveyQuestionSummaryRecord> for SurveyQuestionSummaryResponse {
    fn from(record: SurveyQuestionSummaryRecord) -> Self {
        Self {
            key: record.key,
            prompt: record.prompt,
            responses: record.responses,
            average: record.average,
            minimum: record.minimum,
            maximum: record.maximum,
        }
    }
}

impl From<SurveySummaryRecord> for SurveySummaryResponse {
    fn from(record: SurveySummaryRecord) -> Self {
        Self {
            response_count: record.response_count,
            questions: record
                .questions
                .into_iter()
                .map(SurveyQuestionSummaryResponse::from)
                .collect(),
        }
    }
}
