//! Ephemeral, team-scoped challenge presence.

use std::{collections::BTreeSet, time::Duration};

use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError,
    identity::{ChallengeId, EventId, TeamId},
};
use kitsune_db::teams::{TeamRecord, TeamRepository};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody, resources};

const PRESENCE_TTL: Duration = Duration::from_secs(45);

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateChallengePresenceRequest {
    /// Currently selected challenge. Null clears this browser's presence.
    pub challenge_id: Option<Uuid>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChallengePresenceMemberResponse {
    /// Selected challenge visible to the caller.
    pub challenge_id: Uuid,
    /// Public teammate display name.
    pub display_name: String,
    /// Last heartbeat accepted by the presence service.
    pub updated_at: DateTime<Utc>,
    /// Teammate user identity.
    pub user_id: Uuid,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChallengePresenceResponse {
    /// Active teammates. The authenticated user is omitted.
    pub members: Vec<ChallengePresenceMemberResponse>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PresenceEntry {
    challenge_id: Uuid,
    updated_at: DateTime<Utc>,
}

#[utoipa::path(
    get,
    path = "/api/v1/events/{event_id}/challenge-presence",
    tag = "challenges",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    responses(
        (status = 200, body = ChallengePresenceResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn challenge_presence(
    State(state): State<AppState>,
    actor: Actor,
    Path(event_id): Path<Uuid>,
) -> ApiResult<Json<ChallengePresenceResponse>> {
    authorize(&actor)?;
    let response = presence_response(&state, &actor, EventId(event_id)).await?;
    Ok(Json(response))
}

#[utoipa::path(
    put,
    path = "/api/v1/events/{event_id}/challenge-presence",
    tag = "challenges",
    params(("event_id" = Uuid, Path, description = "Event ID")),
    request_body = UpdateChallengePresenceRequest,
    responses(
        (status = 200, body = ChallengePresenceResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_challenge_presence(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(request): Json<UpdateChallengePresenceRequest>,
) -> ApiResult<Json<ChallengePresenceResponse>> {
    authorize(&actor)?;
    actor.require_csrf(&headers)?;
    let event_id = EventId(event_id);
    let context = team_context(&state, &actor, event_id).await?;

    if let Some((team, team_id)) = context {
        let key = presence_key(
            actor.session.account.organization_id.0,
            event_id.0,
            team_id.0,
            actor.session.account.user_id.0,
        );

        if let Some(challenge_id) = request.challenge_id {
            let visible = resources::visible_challenge_ids(&state, &actor, event_id).await?;

            if !visible.contains(&ChallengeId(challenge_id)) {
                return Err(ApiError::from(DomainError::NotFound));
            }

            let entry = PresenceEntry {
                challenge_id,
                updated_at: Utc::now(),
            };
            let body = serde_json::to_vec(&entry).map_err(|error| {
                ApiError::from(DomainError::Unavailable(format!(
                    "presence serialization failed: {error}"
                )))
            })?;
            state
                .cache
                .put(&key, body, PRESENCE_TTL)
                .await
                .map_err(ApiError::from)?;
        } else {
            state.cache.remove(&key).await.map_err(ApiError::from)?;
        }

        return Ok(Json(
            presence_for_team(&state, &actor, event_id, &team, team_id).await?,
        ));
    }

    Ok(Json(ChallengePresenceResponse {
        members: Vec::new(),
    }))
}

fn authorize(actor: &Actor) -> ApiResult<()> {
    actor.require("event_read")?;
    actor.require("challenge_read")?;
    actor.require("team_join")
}

async fn presence_response(
    state: &AppState,
    actor: &Actor,
    event_id: EventId,
) -> ApiResult<ChallengePresenceResponse> {
    let Some((team, team_id)) = team_context(state, actor, event_id).await? else {
        return Ok(ChallengePresenceResponse {
            members: Vec::new(),
        });
    };

    presence_for_team(state, actor, event_id, &team, team_id).await
}

async fn team_context(
    state: &AppState,
    actor: &Actor,
    event_id: EventId,
) -> ApiResult<Option<(TeamRecord, TeamId)>> {
    let repository = TeamRepository::new(state.db.pool().clone());
    let registration = repository
        .event_registration(
            actor.session.account.organization_id,
            event_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    let Some(registration) = registration.filter(|entry| entry.competitor_kind == "team") else {
        return Ok(None);
    };
    let team_id = TeamId(registration.competitor_id);
    let team = repository
        .for_user(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?
        .into_iter()
        .find(|team| team.id == team_id.0);

    Ok(team.map(|team| (team, team_id)))
}

async fn presence_for_team(
    state: &AppState,
    actor: &Actor,
    event_id: EventId,
    team: &TeamRecord,
    team_id: TeamId,
) -> ApiResult<ChallengePresenceResponse> {
    let visible: BTreeSet<ChallengeId> =
        resources::visible_challenge_ids(state, actor, event_id).await?;
    let mut members = Vec::new();

    for member in &team.members {
        if member.user_id == actor.session.account.user_id.0 {
            continue;
        }

        let key = presence_key(
            actor.session.account.organization_id.0,
            event_id.0,
            team_id.0,
            member.user_id,
        );
        let Some(body) = state.cache.get(&key).await.map_err(ApiError::from)? else {
            continue;
        };
        let Ok(entry) = serde_json::from_slice::<PresenceEntry>(&body) else {
            state.cache.remove(&key).await.map_err(ApiError::from)?;
            continue;
        };

        if !visible.contains(&ChallengeId(entry.challenge_id)) {
            continue;
        }

        members.push(ChallengePresenceMemberResponse {
            challenge_id: entry.challenge_id,
            display_name: member.display_name.clone(),
            updated_at: entry.updated_at,
            user_id: member.user_id,
        });
    }

    Ok(ChallengePresenceResponse { members })
}

fn presence_key(organization_id: Uuid, event_id: Uuid, team_id: Uuid, user_id: Uuid) -> String {
    format!("challenge-presence:{organization_id}:{event_id}:{team_id}:{user_id}")
}

#[cfg(test)]
mod tests {
    use super::presence_key;
    use uuid::Uuid;

    #[test]
    fn presence_keys_are_fully_scoped() {
        let organization = Uuid::now_v7();
        let event = Uuid::now_v7();
        let team = Uuid::now_v7();
        let user = Uuid::now_v7();

        assert_eq!(
            presence_key(organization, event, team, user),
            format!("challenge-presence:{organization}:{event}:{team}:{user}")
        );
    }
}
