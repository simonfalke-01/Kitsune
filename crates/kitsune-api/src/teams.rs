//! Self-service team creation, joining, and captain controls.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError,
    identity::{BracketId, DivisionId, EventId, TeamId, UserId},
};
use kitsune_db::team_admin::{TeamAdminRepository, TransferMember};
use kitsune_db::teams::{EventRegistrationRecord, TeamMemberRecord, TeamRecord, TeamRepository};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

/// Team member projection.
#[derive(Serialize, ToSchema)]
pub struct TeamMemberResponse {
    /// User ID.
    pub user_id: Uuid,
    /// Public display name.
    pub display_name: String,
    /// Captain authority.
    pub captain: bool,
    /// Join instant.
    pub joined_at: DateTime<Utc>,
}

/// Team projection without invite secrets.
#[derive(Serialize, ToSchema)]
pub struct TeamResponse {
    /// Team ID.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Creation instant.
    pub created_at: DateTime<Utc>,
    /// Current members.
    pub members: Vec<TeamMemberResponse>,
}

/// New team input.
#[derive(Deserialize, ToSchema)]
pub struct CreateTeamRequest {
    /// Display name.
    pub name: String,
}

/// One-time team creation response. The invite code is never retrievable later.
#[derive(Serialize, ToSchema)]
pub struct CreateTeamResponse {
    /// Created team.
    pub team: TeamResponse,
    /// Opaque invite code shown once.
    pub invite_code: String,
}

/// Join-code input.
#[derive(Deserialize, ToSchema)]
pub struct JoinTeamRequest {
    /// Opaque code supplied by a captain.
    pub invite_code: String,
}

/// Captain transfer input.
#[derive(Deserialize, ToSchema)]
pub struct TransferCaptainRequest {
    /// Existing member receiving captain authority.
    pub user_id: Uuid,
}

/// One-time invite rotation response.
#[derive(Serialize, ToSchema)]
pub struct RotateInviteResponse {
    /// Replacement opaque invite shown once.
    pub invite_code: String,
}

/// Optional placement selected during event registration.
#[derive(Deserialize, ToSchema)]
pub struct EventRegistrationRequest {
    /// Event-owned division, when configured.
    pub division_id: Option<Uuid>,
    /// Event-owned tournament bracket, when configured.
    pub bracket_id: Option<Uuid>,
}

/// Safe registration projection.
#[derive(Serialize, ToSchema)]
pub struct EventRegistrationResponse {
    /// Event boundary.
    pub event_id: Uuid,
    /// `user` or `team` under the event participation policy.
    pub competitor_kind: &'static str,
    /// Resolved competitor identifier.
    pub competitor_id: Uuid,
    /// Selected division.
    pub division_id: Option<Uuid>,
    /// Selected bracket.
    pub bracket_id: Option<Uuid>,
    /// Original registration instant.
    pub registered_at: DateTime<Utc>,
}

/// Current authenticated competitor registration state.
#[derive(Serialize, ToSchema)]
pub struct EventRegistrationStatusResponse {
    /// Registration details, absent until the competitor registers.
    pub registration: Option<EventRegistrationResponse>,
}

/// Organizer request to move a member between teams.
#[derive(Deserialize, ToSchema)]
pub struct AdminMemberTransferRequest {
    /// Team receiving the member.
    pub target_team_id: Uuid,
    /// Required successor when the member currently captains the source team.
    pub replacement_captain_id: Option<Uuid>,
}

/// Both rosters after an organizer member transfer.
#[derive(Serialize, ToSchema)]
pub struct AdminMemberTransferResponse {
    /// Source roster after transfer.
    pub source: TeamResponse,
    /// Target roster after transfer.
    pub target: TeamResponse,
}

/// Organizer request to merge a source team into a surviving target.
#[derive(Deserialize, ToSchema)]
pub struct AdminTeamMergeRequest {
    /// Surviving team that receives the source roster and history.
    pub target_team_id: Uuid,
}

#[utoipa::path(
    get,
    path = "/api/v1/teams",
    tag = "teams",
    responses(
        (status = 200, body = [TeamResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_teams(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<TeamResponse>>> {
    actor.require("team_join")?;
    let teams = TeamRepository::new(state.db.pool().clone())
        .for_user(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(teams.into_iter().map(TeamResponse::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/teams",
    tag = "team administration",
    responses(
        (status = 200, body = [TeamResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_admin_teams(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<TeamResponse>>> {
    actor.require("team_manage")?;
    let teams = TeamRepository::new(state.db.pool().clone())
        .all(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(teams.into_iter().map(TeamResponse::from).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/teams/{source_team_id}/members/{user_id}/transfer",
    tag = "team administration",
    params(
        ("source_team_id" = Uuid, Path, description = "Source team ID"),
        ("user_id" = Uuid, Path, description = "Member user ID")
    ),
    request_body = AdminMemberTransferRequest,
    responses(
        (status = 200, body = AdminMemberTransferResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn transfer_member_admin(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((source_team_id, user_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<AdminMemberTransferRequest>,
) -> ApiResult<Json<AdminMemberTransferResponse>> {
    actor.require("team_manage")?;
    actor.require_csrf(&headers)?;
    let result = TeamAdminRepository::new(state.db.pool().clone())
        .transfer_member(TransferMember {
            organization_id: actor.session.account.organization_id,
            source_team_id: TeamId(source_team_id),
            target_team_id: TeamId(request.target_team_id),
            member_id: UserId(user_id),
            replacement_captain_id: request.replacement_captain_id.map(UserId),
            actor: actor.session.account.user_id,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(result.event)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(AdminMemberTransferResponse {
        source: result.source.into(),
        target: result.target.into(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/teams/{source_team_id}/merge",
    tag = "team administration",
    params(("source_team_id" = Uuid, Path, description = "Source team ID")),
    request_body = AdminTeamMergeRequest,
    responses(
        (status = 200, body = TeamResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn merge_team_admin(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(source_team_id): Path<Uuid>,
    Json(request): Json<AdminTeamMergeRequest>,
) -> ApiResult<Json<TeamResponse>> {
    actor.require("team_manage")?;
    actor.require_csrf(&headers)?;
    let result = TeamAdminRepository::new(state.db.pool().clone())
        .merge(
            actor.session.account.organization_id,
            TeamId(source_team_id),
            TeamId(request.target_team_id),
            actor.session.account.user_id,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(result.event)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(result.target.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/teams",
    tag = "teams",
    request_body = CreateTeamRequest,
    responses(
        (status = 201, body = CreateTeamResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_team(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateTeamRequest>,
) -> ApiResult<(StatusCode, Json<CreateTeamResponse>)> {
    actor.require("team_create")?;
    actor.require_csrf(&headers)?;
    let name = validate_name(&request.name)?;
    let invite_code = generate_invite_code();
    let digest = Sha256::digest(invite_code.as_bytes());
    let (team, envelope) = TeamRepository::new(state.db.pool().clone())
        .create(
            actor.session.account.organization_id,
            TeamId::new(),
            actor.session.account.user_id,
            name,
            digest.as_slice(),
            Utc::now(),
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
        Json(CreateTeamResponse {
            team: team.into(),
            invite_code,
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/teams/join",
    tag = "teams",
    request_body = JoinTeamRequest,
    responses(
        (status = 200, body = TeamResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn join_team(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<JoinTeamRequest>,
) -> ApiResult<Json<TeamResponse>> {
    actor.require("team_join")?;
    actor.require_csrf(&headers)?;
    if request.invite_code.len() < 20 || request.invite_code.len() > 128 {
        return Err(ApiError::from(DomainError::NotFound));
    }
    let digest = Sha256::digest(request.invite_code.as_bytes());
    let (team, envelope) = TeamRepository::new(state.db.pool().clone())
        .join(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            digest.as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(team.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/teams/{team_id}/captain",
    tag = "teams",
    params(("team_id" = Uuid, Path, description = "Team ID")),
    request_body = TransferCaptainRequest,
    responses(
        (status = 200, body = TeamResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn transfer_captain(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(team_id): Path<Uuid>,
    Json(request): Json<TransferCaptainRequest>,
) -> ApiResult<Json<TeamResponse>> {
    actor.require("team_captain")?;
    actor.require_csrf(&headers)?;
    let (team, envelope) = TeamRepository::new(state.db.pool().clone())
        .transfer_captain(
            actor.session.account.organization_id,
            TeamId(team_id),
            actor.session.account.user_id,
            kitsune_core::identity::UserId(request.user_id),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(team.into()))
}

#[utoipa::path(
    post,
    path = "/api/v1/teams/{team_id}/invite",
    tag = "teams",
    params(("team_id" = Uuid, Path, description = "Team ID")),
    responses(
        (status = 200, body = RotateInviteResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn rotate_invite(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(team_id): Path<Uuid>,
) -> ApiResult<Json<RotateInviteResponse>> {
    actor.require("team_captain")?;
    actor.require_csrf(&headers)?;
    let invite_code = generate_invite_code();
    let digest = Sha256::digest(invite_code.as_bytes());
    let envelope = TeamRepository::new(state.db.pool().clone())
        .rotate_invite(
            actor.session.account.organization_id,
            TeamId(team_id),
            actor.session.account.user_id,
            digest.as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(RotateInviteResponse { invite_code }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/teams/{team_id}/members/{user_id}",
    tag = "teams",
    params(
        ("team_id" = Uuid, Path, description = "Team ID"),
        ("user_id" = Uuid, Path, description = "Member user ID")
    ),
    responses(
        (status = 200, body = TeamResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn remove_member(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path((team_id, user_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<TeamResponse>> {
    actor.require("team_captain")?;
    actor.require_csrf(&headers)?;
    let (team, envelope) = TeamRepository::new(state.db.pool().clone())
        .remove_member(
            actor.session.account.organization_id,
            TeamId(team_id),
            actor.session.account.user_id,
            UserId(user_id),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(envelope)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(team.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/teams/{team_id}/membership",
    tag = "teams",
    params(("team_id" = Uuid, Path, description = "Team ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn leave_team(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(team_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("team_join")?;
    actor.require_csrf(&headers)?;
    let envelope = TeamRepository::new(state.db.pool().clone())
        .leave(
            actor.session.account.organization_id,
            TeamId(team_id),
            actor.session.account.user_id,
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
    put,
    path = "/api/v1/events/{event_id}/registration",
    tag = "teams",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = EventRegistrationRequest,
    responses(
        (status = 200, body = EventRegistrationResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn register_event(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<EventRegistrationRequest>,
) -> ApiResult<Json<EventRegistrationResponse>> {
    actor.require("event_read")?;
    actor.require_csrf(&headers)?;
    let (registration, envelope) = TeamRepository::new(state.db.pool().clone())
        .register_event(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
            request.division_id.map(DivisionId),
            request.bracket_id.map(BracketId),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    if let Some(envelope) = envelope {
        state
            .event_bus
            .publish(envelope)
            .await
            .map_err(ApiError::from)?;
    }
    Ok(Json(registration.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/registration",
    tag = "teams",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = EventRegistrationStatusResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn event_registration(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<EventRegistrationStatusResponse>> {
    actor.require("event_read")?;
    let registration = TeamRepository::new(state.db.pool().clone())
        .event_registration(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(EventRegistrationStatusResponse {
        registration: registration.map(EventRegistrationResponse::from),
    }))
}

#[utoipa::path(
    delete,
    path = "/api/v1/events/{event_id}/registration",
    tag = "teams",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn unregister_event(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("event_read")?;
    actor.require_csrf(&headers)?;
    let envelope = TeamRepository::new(state.db.pool().clone())
        .unregister_event(
            actor.session.account.organization_id,
            EventId(event_id),
            actor.session.account.user_id,
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

impl From<TeamRecord> for TeamResponse {
    fn from(team: TeamRecord) -> Self {
        Self {
            id: team.id,
            name: team.name,
            created_at: team.created_at,
            members: team
                .members
                .into_iter()
                .map(TeamMemberResponse::from)
                .collect(),
        }
    }
}

impl From<TeamMemberRecord> for TeamMemberResponse {
    fn from(member: TeamMemberRecord) -> Self {
        Self {
            user_id: member.user_id,
            display_name: member.display_name,
            captain: member.captain,
            joined_at: member.joined_at,
        }
    }
}

impl From<EventRegistrationRecord> for EventRegistrationResponse {
    fn from(registration: EventRegistrationRecord) -> Self {
        Self {
            event_id: registration.event_id,
            competitor_kind: registration.competitor_kind,
            competitor_id: registration.competitor_id,
            division_id: registration.division_id,
            bracket_id: registration.bracket_id,
            registered_at: registration.registered_at,
        }
    }
}

fn validate_name(name: &str) -> ApiResult<&str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        Err(ApiError::from(DomainError::Validation(
            "team name must contain 1 to 80 characters".into(),
        )))
    } else {
        Ok(name)
    }
}

fn generate_invite_code() -> String {
    let mut bytes = [0_u8; 24];
    rand::fill(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
