//! Event-scoped public competitor profiles.

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError,
    identity::{EventId, TeamId, UserId},
    scoring::CompetitorId,
};
use kitsune_db::profiles::{
    CompetitorProfileRecord, ProfileMemberRecord, ProfileRegistrationRecord, ProfileRepository,
    ProfileSolveRecord, ProfileTeamRecord,
};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody, submissions};

/// Visible ranked standing for a competitor.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileStandingResponse {
    /// One-based event rank.
    pub rank: usize,
    /// Visible score total.
    pub score: i64,
    /// Visible solve count.
    pub solves: i64,
    /// Earliest-to-reach tie-break timestamp.
    pub reached_at: DateTime<Utc>,
}

/// Event registration context.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileRegistrationResponse {
    /// Registration time.
    pub registered_at: DateTime<Utc>,
    /// Optional division identifier.
    pub division_id: Option<Uuid>,
    /// Optional division name.
    pub division_name: Option<String>,
    /// Optional bracket identifier.
    pub bracket_id: Option<Uuid>,
    /// Optional bracket name.
    pub bracket_name: Option<String>,
}

/// Public team roster member.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileMemberResponse {
    /// User identifier.
    pub user_id: Uuid,
    /// Public display name.
    pub display_name: String,
    /// Captain marker.
    pub captain: bool,
    /// Membership start.
    pub joined_at: DateTime<Utc>,
}

/// Public team association on a user profile.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileTeamResponse {
    /// Team identifier.
    pub team_id: Uuid,
    /// Team name.
    pub team_name: String,
    /// Captain marker.
    pub captain: bool,
    /// Membership start.
    pub joined_at: DateTime<Utc>,
}

/// Recent visible solve.
#[derive(Debug, Serialize, ToSchema)]
pub struct ProfileSolveResponse {
    /// Solved challenge identifier.
    pub challenge_id: Uuid,
    /// Challenge name.
    pub challenge_name: String,
    /// Challenge category.
    pub category: String,
    /// Total solve and first-blood points awarded.
    pub awarded_points: i64,
    /// Whether this was the first accepted solve.
    pub first_blood: bool,
    /// Solve time.
    pub solved_at: DateTime<Utc>,
}

/// Player-safe identity, standing, roster, and recent event activity.
#[derive(Debug, Serialize, ToSchema)]
pub struct CompetitorProfileResponse {
    /// `user` or `team`.
    pub competitor_kind: String,
    /// User or team identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Identity creation time.
    pub created_at: DateTime<Utc>,
    /// Public scoreboard concealment state.
    pub scoreboard_hidden: bool,
    /// Post-freeze concealment state.
    pub scoreboard_frozen: bool,
    /// Exact event registration, when present.
    pub registration: Option<ProfileRegistrationResponse>,
    /// Current visible overall standing, absent when hidden or unranked.
    pub standing: Option<ProfileStandingResponse>,
    /// Team roster for a team profile.
    pub members: Vec<ProfileMemberResponse>,
    /// Team associations for a user profile.
    pub teams: Vec<ProfileTeamResponse>,
    /// Recent activity under the same concealment rules as the scoreboard.
    pub recent_solves: Vec<ProfileSolveResponse>,
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}",
    tag = "profiles",
    params(
        ("event_id" = Uuid, Path, description = "Event ID"),
        ("competitor_kind" = String, Path, description = "Competitor kind: user or team"),
        ("competitor_id" = Uuid, Path, description = "User or team ID")
    ),
    responses(
        (status = 200, body = CompetitorProfileResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn competitor_profile(
    State(state): State<AppState>,
    actor: Actor,
    Path((event_id, competitor_kind, competitor_id)): Path<(Uuid, String, Uuid)>,
) -> ApiResult<Json<CompetitorProfileResponse>> {
    actor.require("scoreboard_read")?;
    let competitor = parse_competitor(&competitor_kind, competitor_id)?;
    let organization_id = actor.session.account.organization_id;
    let event_id = EventId(event_id);
    let organizer = actor.can("scoreboard_manage");
    let profile = ProfileRepository::new(state.db.pool().clone())
        .competitor(organization_id, event_id, competitor, organizer)
        .await
        .map_err(ApiError::from)?;
    let scoreboard =
        submissions::scoreboard_projection(&state, organization_id, event_id, None, organizer)
            .await?;
    let standing = scoreboard
        .rows
        .into_iter()
        .find(|row| row.competitor_id == competitor_id && row.competitor_kind == competitor_kind)
        .map(|row| ProfileStandingResponse {
            rank: row.rank,
            score: row.score,
            solves: row.solves,
            reached_at: row.reached_at,
        });
    Ok(Json(CompetitorProfileResponse::from_record(
        profile, standing,
    )))
}

fn parse_competitor(kind: &str, id: Uuid) -> ApiResult<CompetitorId> {
    match kind {
        "user" => Ok(CompetitorId::User(UserId(id))),
        "team" => Ok(CompetitorId::Team(TeamId(id))),
        _ => Err(ApiError::from(DomainError::Validation(
            "competitor kind must be user or team".into(),
        ))),
    }
}

impl CompetitorProfileResponse {
    fn from_record(
        record: CompetitorProfileRecord,
        standing: Option<ProfileStandingResponse>,
    ) -> Self {
        Self {
            competitor_kind: record.competitor_kind,
            competitor_id: record.competitor_id,
            name: record.name,
            created_at: record.created_at,
            scoreboard_hidden: record.scoreboard_hidden,
            scoreboard_frozen: record.scoreboard_frozen,
            registration: record.registration.map(ProfileRegistrationResponse::from),
            standing,
            members: record
                .members
                .into_iter()
                .map(ProfileMemberResponse::from)
                .collect(),
            teams: record
                .teams
                .into_iter()
                .map(ProfileTeamResponse::from)
                .collect(),
            recent_solves: record
                .recent_solves
                .into_iter()
                .map(ProfileSolveResponse::from)
                .collect(),
        }
    }
}

impl From<ProfileRegistrationRecord> for ProfileRegistrationResponse {
    fn from(record: ProfileRegistrationRecord) -> Self {
        Self {
            registered_at: record.registered_at,
            division_id: record.division_id,
            division_name: record.division_name,
            bracket_id: record.bracket_id,
            bracket_name: record.bracket_name,
        }
    }
}

impl From<ProfileMemberRecord> for ProfileMemberResponse {
    fn from(record: ProfileMemberRecord) -> Self {
        Self {
            user_id: record.user_id,
            display_name: record.display_name,
            captain: record.captain,
            joined_at: record.joined_at,
        }
    }
}

impl From<ProfileTeamRecord> for ProfileTeamResponse {
    fn from(record: ProfileTeamRecord) -> Self {
        Self {
            team_id: record.team_id,
            team_name: record.team_name,
            captain: record.captain,
            joined_at: record.joined_at,
        }
    }
}

impl From<ProfileSolveRecord> for ProfileSolveResponse {
    fn from(record: ProfileSolveRecord) -> Self {
        Self {
            challenge_id: record.challenge_id,
            challenge_name: record.challenge_name,
            category: record.category,
            awarded_points: record.awarded_points,
            first_blood: record.first_blood,
            solved_at: record.solved_at,
        }
    }
}
