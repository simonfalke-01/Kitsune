//! Typed, tenant-scoped event and challenge resources.

use std::collections::BTreeSet;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{DateTime, Utc};
use kitsune_core::{
    Challenge, DomainError, Event,
    challenge::{
        AnswerRule, ChallengeKind, ChallengeState, Hint, SurveyQuestion, VisibilityRule,
        validate_answer_contract,
    },
    identity::{BracketId, ChallengeId, DivisionId, EventId, EventState, ParticipationMode},
    scoring::ScoringRule,
};
use kitsune_db::resources::{
    BracketMutation, BracketRecord, ChallengeRecord, DivisionMutation, DivisionRecord, EventRecord,
    NewChallenge, NewEvent, ResourceRepository,
};
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody, auth::validate_slug};

/// Event lifecycle input.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum EventStateInput {
    /// Organizer-only.
    Draft,
    /// Announced, not started.
    Scheduled,
    /// Accepting gameplay.
    Live,
    /// Temporarily stopped.
    Paused,
    /// Completed.
    Ended,
    /// Retained but hidden.
    Archived,
}

/// Event scoring identity policy.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ParticipationInput {
    /// Users score independently.
    Individual,
    /// Teams score collectively.
    Team,
    /// Both supported where a mode permits.
    Hybrid,
}

/// First-party game mode key.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ModeInput {
    /// Jeopardy challenges.
    Jeopardy,
    /// King of the Hill objectives.
    Koth,
    /// Attack/Defense rounds.
    AttackDefense,
    /// Non-competitive lessons.
    Workshop,
}

/// New event document.
#[derive(Deserialize, ToSchema)]
pub struct CreateEventRequest {
    /// Display name.
    pub name: String,
    /// URL-safe key.
    pub slug: String,
    /// Markdown overview.
    pub description: String,
    /// Initial lifecycle.
    pub state: EventStateInput,
    /// Scoring identity policy.
    pub participation: ParticipationInput,
    /// At least one enabled mode.
    pub modes: Vec<ModeInput>,
    /// Optional opening instant.
    pub starts_at: Option<DateTime<Utc>>,
    /// Optional closing instant.
    pub ends_at: Option<DateTime<Utc>>,
    /// Optional team size limit.
    pub team_size_limit: Option<u16>,
}

/// Safe event response.
#[derive(Serialize, ToSchema)]
pub struct EventResponse {
    /// ID.
    pub id: Uuid,
    /// Name.
    pub name: String,
    /// Slug.
    pub slug: String,
    /// Description.
    pub description: String,
    /// Lifecycle.
    pub state: String,
    /// Participation.
    pub participation: String,
    /// Modes.
    pub modes: Vec<String>,
    /// Start.
    pub starts_at: Option<DateTime<Utc>>,
    /// End.
    pub ends_at: Option<DateTime<Utc>>,
    /// Team limit.
    pub team_size_limit: Option<i16>,
    /// Freeze state.
    pub scoreboard_frozen: bool,
    /// Hidden state.
    pub scoreboard_hidden: bool,
}

/// Event division document.
#[derive(Debug, Serialize, ToSchema)]
pub struct DivisionResponse {
    /// Division ID.
    pub id: Uuid,
    /// Parent event ID.
    pub event_id: Uuid,
    /// Display name.
    pub name: String,
    /// Stable scoreboard order.
    pub position: i32,
}

/// Organizer division create/update document.
#[derive(Debug, Deserialize, ToSchema)]
pub struct DivisionMutationRequest {
    /// Unique display name inside the event.
    pub name: String,
    /// Stable scoreboard order from 0 through 100,000.
    pub position: i32,
}

/// Tournament bracket document.
#[derive(Debug, Serialize, ToSchema)]
pub struct BracketResponse {
    /// Bracket ID.
    pub id: Uuid,
    /// Parent event ID.
    pub event_id: Uuid,
    /// Display name.
    pub name: String,
    /// Number of entrants advanced from this bracket.
    pub advancement_slots: i16,
}

/// Organizer bracket create/update document.
#[derive(Debug, Deserialize, ToSchema)]
pub struct BracketMutationRequest {
    /// Unique display name inside the event.
    pub name: String,
    /// Number of entrants advanced from this bracket.
    pub advancement_slots: u16,
}

/// Organizer event lifecycle mutation.
#[derive(Deserialize, ToSchema)]
pub struct UpdateEventStateRequest {
    /// Requested lifecycle state.
    pub state: EventStateInput,
}

/// Organizer scoreboard control mutation.
#[derive(Deserialize, ToSchema)]
pub struct UpdateScoreboardControlsRequest {
    /// Conceal new score entries while preserving the last public snapshot.
    pub frozen: bool,
    /// Conceal the entire public scoreboard.
    pub hidden: bool,
}

/// Challenge behavior input.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChallengeKindInput {
    /// One or more text/regex answers.
    StaticFlag,
    /// Declared choices.
    MultipleChoice { choices: Vec<String> },
    /// Orchestrated identity-specific service.
    DynamicInstance { template: String },
    /// Downloadable artifact.
    FileBacked,
    /// TCP or HTTP service.
    RemoteService { connection: String },
    /// Organizer review.
    ManualVerification,
    /// Capability-bound plugin type.
    Plugin {
        plugin: String,
        kind: String,
        #[serde(default)]
        config: Value,
    },
}

/// Challenge lifecycle input.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChallengeStateInput {
    /// Author-only.
    Draft,
    /// Tester-visible.
    Testing,
    /// Time-controlled.
    Scheduled,
    /// Player-visible.
    Published,
    /// Explicitly hidden.
    Hidden,
    /// Historical.
    Archived,
}

/// Scoring configuration.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScoringInput {
    /// Fixed value.
    Static { points: i64 },
    /// Solve-count decay.
    Dynamic {
        initial: i64,
        minimum: i64,
        decay: u64,
    },
    /// Plugin implementation.
    Plugin { plugin: String, strategy: String },
}

/// Visibility window, division targeting, and unlock graph.
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
pub struct VisibilityInput {
    /// Earliest visibility.
    pub visible_from: Option<DateTime<Utc>>,
    /// Exclusive hide instant.
    pub visible_until: Option<DateTime<Utc>>,
    /// Empty means every division.
    pub division_ids: Vec<Uuid>,
    /// All must be solved.
    pub prerequisites: Vec<Uuid>,
}

/// Author-submitted answer rule. Exact plaintext is digested before storage.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnswerInput {
    /// Exact flag.
    Exact {
        value: String,
        case_insensitive: bool,
    },
    /// Bounded regex.
    Regex {
        pattern: String,
        case_insensitive: bool,
    },
    /// Multiple-choice value.
    Choice { value: String },
    /// Per-identity verifier.
    Dynamic,
    /// Organizer review.
    Manual,
    /// Capability-bound Component Model verifier.
    Plugin,
}

/// Hint authoring input.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HintInput {
    /// Stable positive key.
    pub id: u32,
    /// Markdown content.
    pub content: String,
    /// Point cost.
    pub cost: i64,
}

/// Post-solve survey item.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SurveyInput {
    /// Stable key.
    pub key: String,
    /// Prompt.
    pub prompt: String,
    /// Optional inclusive integer bounds.
    pub range: Option<(i32, i32)>,
    /// Required answer.
    pub required: bool,
}

/// New challenge aggregate.
#[derive(Deserialize, ToSchema)]
pub struct CreateChallengeRequest {
    /// Name.
    pub name: String,
    /// Board category.
    pub category: String,
    /// Markdown body.
    pub description: String,
    /// Behavior.
    pub kind: ChallengeKindInput,
    /// Lifecycle.
    pub state: ChallengeStateInput,
    /// Score policy.
    pub scoring: ScoringInput,
    /// Visibility rules.
    pub visibility: VisibilityInput,
    /// Search and grouping tags.
    pub tags: Vec<String>,
    /// Optional failure ceiling.
    pub max_attempts: Option<u32>,
    /// Permit writeup submission.
    pub writeups_enabled: bool,
    /// Board order.
    pub position: i32,
    /// Accepted rules.
    pub answers: Vec<AnswerInput>,
    /// Hints.
    pub hints: Vec<HintInput>,
    /// Survey schema.
    pub survey: Vec<SurveyInput>,
}

/// Player-safe challenge response. Answer rules never appear here.
#[derive(Serialize, ToSchema)]
pub struct ChallengeResponse {
    /// ID.
    pub id: Uuid,
    /// Event ID.
    pub event_id: Uuid,
    /// Name.
    pub name: String,
    /// Category.
    pub category: String,
    /// Markdown description.
    pub description: String,
    /// Behavior schema.
    #[schema(value_type = ChallengeKindInput)]
    pub kind: Value,
    /// Lifecycle.
    pub state: String,
    /// Scoring schema.
    #[schema(value_type = ScoringInput)]
    pub scoring: Value,
    /// Visibility schema.
    #[schema(value_type = VisibilityInput)]
    pub visibility: Value,
    /// Tags.
    pub tags: Vec<String>,
    /// Attempt limit.
    pub max_attempts: Option<i32>,
    /// Writeups enabled.
    pub writeups_enabled: bool,
    /// Board position.
    pub position: i32,
    /// Survey schema.
    #[schema(value_type = Vec<SurveyInput>)]
    pub survey: Value,
    /// Whether the authenticated competitor has already solved it.
    pub solved: bool,
}

#[utoipa::path(
    get,
    path = "/api/v1/events",
    tag = "events",
    responses(
        (status = 200, body = [EventResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_events(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<EventResponse>>> {
    actor.require("event_read")?;
    let rows = ResourceRepository::new(state.db.pool().clone())
        .events(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(rows.into_iter().map(EventResponse::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/events",
    tag = "events",
    request_body = CreateEventRequest,
    responses(
        (status = 201, body = EventResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_event(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateEventRequest>,
) -> ApiResult<(StatusCode, Json<EventResponse>)> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    validate_slug(&request.slug)?;
    if request.description.len() > 100_000 {
        return Err(ApiError::from(DomainError::LimitExceeded(
            "event description".into(),
        )));
    }
    let modes = request
        .modes
        .iter()
        .map(|mode| mode_key(*mode).to_owned())
        .collect::<Vec<_>>();
    let domain = Event {
        id: EventId::new(),
        organization_id: actor.session.account.organization_id,
        name: request.name.trim().to_owned(),
        slug: request.slug.trim().to_owned(),
        state: event_state(request.state),
        participation: participation(request.participation),
        starts_at: request.starts_at,
        ends_at: request.ends_at,
        team_size_limit: request.team_size_limit,
        modes: modes.iter().cloned().collect(),
    };
    domain.validate().map_err(ApiError::from)?;
    let team_size_limit = request
        .team_size_limit
        .map(i16::try_from)
        .transpose()
        .map_err(|_| {
            ApiError::from(DomainError::Validation(
                "team size limit is too large".into(),
            ))
        })?;
    let (row, envelope) = ResourceRepository::new(state.db.pool().clone())
        .create_event(NewEvent {
            id: domain.id,
            organization_id: domain.organization_id,
            actor: actor.session.account.user_id,
            name: &domain.name,
            slug: &domain.slug,
            description: request.description.trim(),
            state: event_state_key(request.state),
            participation: participation_key(request.participation),
            modes: &modes,
            starts_at: domain.starts_at,
            ends_at: domain.ends_at,
            team_size_limit,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(row.into())))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/state",
    tag = "events",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = UpdateEventStateRequest,
    responses(
        (status = 200, body = EventResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn update_event_state(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<UpdateEventStateRequest>,
) -> ApiResult<Json<EventResponse>> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let (row, envelope) = ResourceRepository::new(state.db.pool().clone())
        .set_event_state(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
            event_state(request.state),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(row.into()))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/scoreboard-controls",
    tag = "scoreboard",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = UpdateScoreboardControlsRequest,
    responses(
        (status = 200, body = EventResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn update_scoreboard_controls(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<UpdateScoreboardControlsRequest>,
) -> ApiResult<Json<EventResponse>> {
    actor.require("scoreboard_manage")?;
    actor.require_csrf(&headers)?;
    let (row, envelope) = ResourceRepository::new(state.db.pool().clone())
        .set_scoreboard_controls(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
            request.frozen,
            request.hidden,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(row.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/divisions",
    tag = "divisions",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = [DivisionResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn list_divisions(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<DivisionResponse>>> {
    actor.require("event_read")?;
    let repository = ResourceRepository::new(state.db.pool().clone());
    let event_id = EventId(event_id);
    if !repository
        .owns_event(actor.session.account.organization_id, event_id)
        .await
        .map_err(ApiError::from)?
    {
        return Err(ApiError::from(DomainError::NotFound));
    }
    let divisions = repository
        .divisions(actor.session.account.organization_id, event_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(divisions.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/divisions",
    tag = "divisions",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = DivisionMutationRequest,
    responses(
        (status = 201, body = DivisionResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_division(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<DivisionMutationRequest>,
) -> ApiResult<(StatusCode, Json<DivisionResponse>)> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let name = validate_classification_name(&request.name)?;
    validate_division_position(request.position)?;
    let (division, envelope) = ResourceRepository::new(state.db.pool().clone())
        .create_division(DivisionMutation {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            actor: actor.session.account.user_id,
            division_id: DivisionId::new(),
            name: &name,
            position: request.position,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(division.into())))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/divisions/{division_id}",
    tag = "divisions",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("division_id" = Uuid, Path, description = "Division ID")
    ),
    request_body = DivisionMutationRequest,
    responses(
        (status = 200, body = DivisionResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_division(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, division_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<DivisionMutationRequest>,
) -> ApiResult<Json<DivisionResponse>> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let name = validate_classification_name(&request.name)?;
    validate_division_position(request.position)?;
    let (division, envelope) = ResourceRepository::new(state.db.pool().clone())
        .update_division(DivisionMutation {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            actor: actor.session.account.user_id,
            division_id: DivisionId(division_id),
            name: &name,
            position: request.position,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(division.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/events/{event_id}/divisions/{division_id}",
    tag = "divisions",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("division_id" = Uuid, Path, description = "Division ID")
    ),
    responses(
        (status = 204, description = "Division deleted"),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn delete_division(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, division_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let envelope = ResourceRepository::new(state.db.pool().clone())
        .delete_division(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
            DivisionId(division_id),
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

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/brackets",
    tag = "brackets",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = [BracketResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn list_brackets(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<BracketResponse>>> {
    actor.require("event_read")?;
    let repository = ResourceRepository::new(state.db.pool().clone());
    let event_id = EventId(event_id);
    if !repository
        .owns_event(actor.session.account.organization_id, event_id)
        .await
        .map_err(ApiError::from)?
    {
        return Err(ApiError::from(DomainError::NotFound));
    }
    let brackets = repository
        .brackets(actor.session.account.organization_id, event_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(brackets.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/brackets",
    tag = "brackets",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = BracketMutationRequest,
    responses(
        (status = 201, body = BracketResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_bracket(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<BracketMutationRequest>,
) -> ApiResult<(StatusCode, Json<BracketResponse>)> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let name = validate_classification_name(&request.name)?;
    let advancement_slots = validate_advancement_slots(request.advancement_slots)?;
    let (bracket, envelope) = ResourceRepository::new(state.db.pool().clone())
        .create_bracket(BracketMutation {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            actor: actor.session.account.user_id,
            bracket_id: BracketId::new(),
            name: &name,
            advancement_slots,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(bracket.into())))
}

#[utoipa::path(
    patch,
    path = "/api/v1/events/{event_id}/brackets/{bracket_id}",
    tag = "brackets",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("bracket_id" = Uuid, Path, description = "Bracket ID")
    ),
    request_body = BracketMutationRequest,
    responses(
        (status = 200, body = BracketResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_bracket(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, bracket_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<BracketMutationRequest>,
) -> ApiResult<Json<BracketResponse>> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let name = validate_classification_name(&request.name)?;
    let advancement_slots = validate_advancement_slots(request.advancement_slots)?;
    let (bracket, envelope) = ResourceRepository::new(state.db.pool().clone())
        .update_bracket(BracketMutation {
            organization_id: actor.session.account.organization_id,
            event_id: EventId(event_id),
            actor: actor.session.account.user_id,
            bracket_id: BracketId(bracket_id),
            name: &name,
            advancement_slots,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(bracket.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/events/{event_id}/brackets/{bracket_id}",
    tag = "brackets",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("bracket_id" = Uuid, Path, description = "Bracket ID")
    ),
    responses(
        (status = 204, description = "Bracket deleted"),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn delete_bracket(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((event_id, bracket_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<StatusCode> {
    actor.require("event_manage")?;
    actor.require_csrf(&headers)?;
    let envelope = ResourceRepository::new(state.db.pool().clone())
        .delete_bracket(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
            BracketId(bracket_id),
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

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/challenges",
    tag = "challenges",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = [ChallengeResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn list_challenges(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<Vec<ChallengeResponse>>> {
    actor.require("challenge_read")?;
    let repository = ResourceRepository::new(state.db.pool().clone());
    let event_id = EventId(event_id);
    let manager = actor.can("challenge_manage");
    let mut rows = repository
        .challenges(
            actor.session.account.organization_id,
            event_id,
            manager,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    let context = repository
        .challenge_access_context(
            actor.session.account.organization_id,
            event_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    let division = context.division_id.map(DivisionId);
    let solves = context
        .solves
        .into_iter()
        .map(ChallengeId)
        .collect::<BTreeSet<_>>();
    if !manager {
        rows.retain(|row| {
            serde_json::from_value::<VisibilityRule>(row.visibility.clone())
                .is_ok_and(|visibility| visibility.allows(Utc::now(), division, &solves))
        });
    }
    Ok(Json(
        rows.into_iter()
            .map(|row| {
                let completed_by_actor = solves.contains(&ChallengeId(row.id));
                ChallengeResponse::from_record(row, completed_by_actor)
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/events/{event_id}/challenges",
    tag = "challenges",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = CreateChallengeRequest,
    responses(
        (status = 201, body = ChallengeResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_challenge(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<CreateChallengeRequest>,
) -> ApiResult<(StatusCode, Json<ChallengeResponse>)> {
    actor.require("challenge_manage")?;
    actor.require_csrf(&headers)?;
    if request.description.len() > 200_000 || request.answers.len() > 32 || request.hints.len() > 64
    {
        return Err(ApiError::from(DomainError::LimitExceeded(
            "challenge authoring bounds".into(),
        )));
    }
    let id = ChallengeId::new();
    let kind = challenge_kind(request.kind.clone());
    let state_key = challenge_state(request.state);
    let scoring = scoring(request.scoring.clone());
    let visibility = visibility(request.visibility.clone());
    let hints = request
        .hints
        .iter()
        .map(|hint| Hint {
            id: hint.id,
            content: hint.content.trim().to_owned(),
            cost: hint.cost,
        })
        .collect::<Vec<_>>();
    let survey = request
        .survey
        .iter()
        .map(|item| SurveyQuestion {
            key: item.key.clone(),
            prompt: item.prompt.clone(),
            range: item.range,
            required: item.required,
        })
        .collect::<Vec<_>>();
    let challenge = Challenge {
        id,
        event_id: EventId(event_id),
        name: request.name.trim().to_owned(),
        category: request.category.trim().to_owned(),
        description: request.description.trim().to_owned(),
        kind,
        state: state_key,
        scoring,
        visibility,
        tags: request
            .tags
            .iter()
            .map(|tag| tag.trim().to_owned())
            .filter(|tag| !tag.is_empty())
            .collect(),
        hints,
        max_attempts: request.max_attempts,
        writeups_enabled: request.writeups_enabled,
        survey,
    };
    challenge.validate().map_err(ApiError::from)?;
    let answer_rules = request
        .answers
        .into_iter()
        .map(answer_rule)
        .collect::<Vec<_>>();
    validate_answer_contract(&challenge.kind, &answer_rules).map_err(ApiError::from)?;
    for rule in &answer_rules {
        rule.validate().map_err(ApiError::from)?;
    }
    let kind_json = serde_json::to_value(&challenge.kind).map_err(serialization_error)?;
    let scoring_json = serde_json::to_value(&challenge.scoring).map_err(serialization_error)?;
    let visibility_json =
        serde_json::to_value(&challenge.visibility).map_err(serialization_error)?;
    let survey_json = serde_json::to_value(&challenge.survey).map_err(serialization_error)?;
    let answers_json = answer_rules
        .iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(serialization_error)?;
    let hint_rows = challenge
        .hints
        .iter()
        .map(|hint| {
            (
                i32::try_from(hint.id).unwrap_or(i32::MAX),
                hint.content.clone(),
                hint.cost,
            )
        })
        .collect::<Vec<_>>();
    let tags = challenge.tags.iter().cloned().collect::<Vec<_>>();
    let max_attempts = challenge
        .max_attempts
        .map(i32::try_from)
        .transpose()
        .map_err(|_| ApiError::from(DomainError::Validation("max attempts is too large".into())))?;
    let (row, envelope) = ResourceRepository::new(state.db.pool().clone())
        .create_challenge(
            actor.session.account.organization_id,
            NewChallenge {
                id: challenge.id,
                event_id: challenge.event_id,
                created_by: actor.session.account.user_id,
                name: &challenge.name,
                category: &challenge.category,
                description: &challenge.description,
                kind: &kind_json,
                state: challenge_state_key(request.state),
                scoring: &scoring_json,
                visibility: &visibility_json,
                tags: &tags,
                max_attempts,
                writeups_enabled: challenge.writeups_enabled,
                position: request.position,
                survey: &survey_json,
                answers: &answers_json,
                hints: &hint_rows,
                now: Utc::now(),
            },
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok((
        StatusCode::CREATED,
        Json(ChallengeResponse::from_record(row, false)),
    ))
}

impl From<EventRecord> for EventResponse {
    fn from(row: EventRecord) -> Self {
        Self {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            state: row.state,
            participation: row.participation,
            modes: row.modes,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            team_size_limit: row.team_size_limit,
            scoreboard_frozen: row.scoreboard_frozen,
            scoreboard_hidden: row.scoreboard_hidden,
        }
    }
}

impl From<DivisionRecord> for DivisionResponse {
    fn from(record: DivisionRecord) -> Self {
        Self {
            id: record.id,
            event_id: record.event_id,
            name: record.name,
            position: record.position,
        }
    }
}

impl From<BracketRecord> for BracketResponse {
    fn from(record: BracketRecord) -> Self {
        Self {
            id: record.id,
            event_id: record.event_id,
            name: record.name,
            advancement_slots: record.advancement_slots,
        }
    }
}

fn validate_classification_name(value: &str) -> ApiResult<String> {
    let name = value.trim();
    if name.is_empty() || name.chars().count() > 100 || name.chars().any(char::is_control) {
        return Err(ApiError::from(DomainError::Validation(
            "classification name must contain 1 to 100 printable characters".into(),
        )));
    }
    Ok(name.to_owned())
}

fn validate_division_position(position: i32) -> ApiResult<()> {
    if !(0..=100_000).contains(&position) {
        return Err(ApiError::from(DomainError::Validation(
            "division position must be between 0 and 100000".into(),
        )));
    }
    Ok(())
}

fn validate_advancement_slots(value: u16) -> ApiResult<i16> {
    i16::try_from(value).map_err(|_| {
        ApiError::from(DomainError::Validation(
            "advancement slots cannot exceed 32767".into(),
        ))
    })
}

impl ChallengeResponse {
    fn from_record(row: ChallengeRecord, solved: bool) -> Self {
        Self {
            id: row.id,
            event_id: row.event_id,
            name: row.name,
            category: row.category,
            description: row.description,
            kind: row.kind,
            state: row.state,
            scoring: row.scoring,
            visibility: row.visibility,
            tags: row.tags,
            max_attempts: row.max_attempts,
            writeups_enabled: row.writeups_enabled,
            position: row.position,
            survey: row.survey,
            solved,
        }
    }
}

fn event_state(value: EventStateInput) -> EventState {
    match value {
        EventStateInput::Draft => EventState::Draft,
        EventStateInput::Scheduled => EventState::Scheduled,
        EventStateInput::Live => EventState::Live,
        EventStateInput::Paused => EventState::Paused,
        EventStateInput::Ended => EventState::Ended,
        EventStateInput::Archived => EventState::Archived,
    }
}

fn event_state_key(value: EventStateInput) -> &'static str {
    match value {
        EventStateInput::Draft => "draft",
        EventStateInput::Scheduled => "scheduled",
        EventStateInput::Live => "live",
        EventStateInput::Paused => "paused",
        EventStateInput::Ended => "ended",
        EventStateInput::Archived => "archived",
    }
}

fn participation(value: ParticipationInput) -> ParticipationMode {
    match value {
        ParticipationInput::Individual => ParticipationMode::Individual,
        ParticipationInput::Team => ParticipationMode::Team,
        ParticipationInput::Hybrid => ParticipationMode::Hybrid,
    }
}

fn participation_key(value: ParticipationInput) -> &'static str {
    match value {
        ParticipationInput::Individual => "individual",
        ParticipationInput::Team => "team",
        ParticipationInput::Hybrid => "hybrid",
    }
}

fn mode_key(value: ModeInput) -> &'static str {
    match value {
        ModeInput::Jeopardy => "jeopardy",
        ModeInput::Koth => "koth",
        ModeInput::AttackDefense => "attack_defense",
        ModeInput::Workshop => "workshop",
    }
}

fn challenge_state(value: ChallengeStateInput) -> ChallengeState {
    match value {
        ChallengeStateInput::Draft => ChallengeState::Draft,
        ChallengeStateInput::Testing => ChallengeState::Testing,
        ChallengeStateInput::Scheduled => ChallengeState::Scheduled,
        ChallengeStateInput::Published => ChallengeState::Published,
        ChallengeStateInput::Hidden => ChallengeState::Hidden,
        ChallengeStateInput::Archived => ChallengeState::Archived,
    }
}

fn challenge_state_key(value: ChallengeStateInput) -> &'static str {
    match value {
        ChallengeStateInput::Draft => "draft",
        ChallengeStateInput::Testing => "testing",
        ChallengeStateInput::Scheduled => "scheduled",
        ChallengeStateInput::Published => "published",
        ChallengeStateInput::Hidden => "hidden",
        ChallengeStateInput::Archived => "archived",
    }
}

fn challenge_kind(value: ChallengeKindInput) -> ChallengeKind {
    match value {
        ChallengeKindInput::StaticFlag => ChallengeKind::StaticFlag,
        ChallengeKindInput::MultipleChoice { choices } => ChallengeKind::MultipleChoice { choices },
        ChallengeKindInput::DynamicInstance { template } => {
            ChallengeKind::DynamicInstance { template }
        }
        ChallengeKindInput::FileBacked => ChallengeKind::FileBacked,
        ChallengeKindInput::RemoteService { connection } => {
            ChallengeKind::RemoteService { connection }
        }
        ChallengeKindInput::ManualVerification => ChallengeKind::ManualVerification,
        ChallengeKindInput::Plugin {
            plugin,
            kind,
            config,
        } => ChallengeKind::Plugin {
            plugin,
            kind,
            config,
        },
    }
}

fn scoring(value: ScoringInput) -> ScoringRule {
    match value {
        ScoringInput::Static { points } => ScoringRule::Static { points },
        ScoringInput::Dynamic {
            initial,
            minimum,
            decay,
        } => ScoringRule::Dynamic {
            initial,
            minimum,
            decay,
        },
        ScoringInput::Plugin { plugin, strategy } => ScoringRule::Plugin { plugin, strategy },
    }
}

fn visibility(value: VisibilityInput) -> VisibilityRule {
    VisibilityRule {
        visible_from: value.visible_from,
        visible_until: value.visible_until,
        division_ids: value.division_ids.into_iter().map(DivisionId).collect(),
        prerequisites: value.prerequisites.into_iter().map(ChallengeId).collect(),
    }
}

fn answer_rule(value: AnswerInput) -> AnswerRule {
    match value {
        AnswerInput::Exact {
            value,
            case_insensitive,
        } => AnswerRule::exact(SecretString::from(value), case_insensitive),
        AnswerInput::Regex {
            pattern,
            case_insensitive,
        } => AnswerRule::Regex {
            pattern,
            case_insensitive,
        },
        AnswerInput::Choice { value } => AnswerRule::Choice { value },
        AnswerInput::Dynamic => AnswerRule::Dynamic,
        AnswerInput::Manual => AnswerRule::Manual,
        AnswerInput::Plugin => AnswerRule::Plugin,
    }
}

fn serialization_error(error: serde_json::Error) -> ApiError {
    ApiError::from(DomainError::Validation(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{
        validate_advancement_slots, validate_classification_name, validate_division_position,
    };

    #[test]
    fn classification_inputs_are_bounded_and_normalized() {
        assert_eq!(
            validate_classification_name("  University  ").expect("valid name"),
            "University"
        );
        assert!(validate_classification_name("\n").is_err());
        assert!(validate_classification_name(&"x".repeat(101)).is_err());
        assert!(validate_division_position(0).is_ok());
        assert!(validate_division_position(100_000).is_ok());
        assert!(validate_division_position(-1).is_err());
        assert!(validate_division_position(100_001).is_err());
        let maximum_slots = u16::try_from(i16::MAX).expect("positive i16 maximum");
        assert_eq!(
            validate_advancement_slots(maximum_slots).expect("maximum slots"),
            i16::MAX
        );
        assert!(validate_advancement_slots(maximum_slots + 1).is_err());
    }
}
