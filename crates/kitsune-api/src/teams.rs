//! Self-service team creation, joining, and captain controls.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use kitsune_core::{DomainError, identity::TeamId};
use kitsune_db::teams::{TeamMemberRecord, TeamRecord, TeamRepository};
use rand::Rng as _;
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
    rand::rng().fill(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
