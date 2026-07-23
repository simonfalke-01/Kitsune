//! Player-safe competitor identity and event-activity projections.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    identity::{EventId, OrganizationId, TeamId, UserId},
    scoring::CompetitorId,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

const RECENT_SOLVE_LIMIT: i64 = 12;

/// Event registration labels attached to a competitor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileRegistrationRecord {
    /// Registration time.
    pub registered_at: DateTime<Utc>,
    /// Optional division identifier.
    pub division_id: Option<Uuid>,
    /// Optional division label.
    pub division_name: Option<String>,
    /// Optional bracket identifier.
    pub bracket_id: Option<Uuid>,
    /// Optional bracket label.
    pub bracket_name: Option<String>,
}

/// Public member of a team profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileMemberRecord {
    /// User identifier.
    pub user_id: Uuid,
    /// Public display name.
    pub display_name: String,
    /// Captain marker.
    pub captain: bool,
    /// Membership start.
    pub joined_at: DateTime<Utc>,
}

/// Public team association for a user profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileTeamRecord {
    /// Team identifier.
    pub team_id: Uuid,
    /// Team name.
    pub team_name: String,
    /// Captain marker.
    pub captain: bool,
    /// Membership start.
    pub joined_at: DateTime<Utc>,
}

/// Recent solve that remains visible under event concealment controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSolveRecord {
    /// Solved challenge identifier.
    pub challenge_id: Uuid,
    /// Challenge name.
    pub challenge_name: String,
    /// Challenge category.
    pub category: String,
    /// Total points awarded by the accepted submission.
    pub awarded_points: i64,
    /// Whether this was the challenge's first accepted solve.
    pub first_blood: bool,
    /// Solve time.
    pub solved_at: DateTime<Utc>,
}

/// Identity and safe event context used to assemble an API profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompetitorProfileRecord {
    /// `user` or `team`.
    pub competitor_kind: String,
    /// User or team identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Identity creation time.
    pub created_at: DateTime<Utc>,
    /// Whether the public scoreboard is hidden.
    pub scoreboard_hidden: bool,
    /// Whether post-freeze activity is concealed.
    pub scoreboard_frozen: bool,
    /// Exact event registration, when present.
    pub registration: Option<ProfileRegistrationRecord>,
    /// Team roster for a team profile.
    pub members: Vec<ProfileMemberRecord>,
    /// Team associations for a user profile.
    pub teams: Vec<ProfileTeamRecord>,
    /// Recent solves visible to the requesting audience.
    pub recent_solves: Vec<ProfileSolveRecord>,
}

#[derive(Debug)]
struct ProfileIdentity {
    name: String,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ProfileRepository {
    pool: PgPool,
}

impl ProfileRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns one tenant-scoped profile under scoreboard visibility controls.
    pub async fn competitor(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        competitor: CompetitorId,
        organizer: bool,
    ) -> DomainResult<CompetitorProfileRecord> {
        let controls = sqlx::query!(
            r#"
            SELECT scoreboard_hidden,scoreboard_frozen
            FROM events
            WHERE id = $1 AND organization_id = $2
            "#,
            event_id.0,
            organization_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;

        let identity = self.identity(organization_id, competitor).await?;
        let registration = self.registration(event_id, competitor).await?;
        let members = self.members(organization_id, competitor).await?;
        let teams = self.teams(organization_id, competitor).await?;
        let recent_solves = if controls.scoreboard_hidden && !organizer {
            Vec::new()
        } else {
            self.recent_solves(event_id, competitor, organizer, controls.scoreboard_frozen)
                .await?
        };
        let (competitor_kind, competitor_id) = competitor_identity(competitor);

        Ok(CompetitorProfileRecord {
            competitor_kind: competitor_kind.to_owned(),
            competitor_id,
            name: identity.name,
            created_at: identity.created_at,
            scoreboard_hidden: controls.scoreboard_hidden,
            scoreboard_frozen: controls.scoreboard_frozen,
            registration,
            members,
            teams,
            recent_solves,
        })
    }

    async fn identity(
        &self,
        organization_id: OrganizationId,
        competitor: CompetitorId,
    ) -> DomainResult<ProfileIdentity> {
        let identity = match competitor {
            CompetitorId::User(user_id) => sqlx::query_as!(
                ProfileIdentity,
                r#"
                    SELECT display_name AS name,created_at
                    FROM users
                    WHERE id = $1 AND organization_id = $2
                    "#,
                user_id.0,
                organization_id.0,
            )
            .fetch_optional(&self.pool)
            .await
            .map_err(unavailable)?,
            CompetitorId::Team(team_id) => sqlx::query_as!(
                ProfileIdentity,
                r#"
                    SELECT name,created_at
                    FROM teams
                    WHERE id = $1 AND organization_id = $2
                    "#,
                team_id.0,
                organization_id.0,
            )
            .fetch_optional(&self.pool)
            .await
            .map_err(unavailable)?,
        };
        identity.ok_or(DomainError::NotFound)
    }

    async fn registration(
        &self,
        event_id: EventId,
        competitor: CompetitorId,
    ) -> DomainResult<Option<ProfileRegistrationRecord>> {
        let (user_id, team_id) = competitor_columns(competitor);
        sqlx::query_as!(
            ProfileRegistrationRecord,
            r#"
            SELECT ep.registered_at,
                   d.id AS "division_id?",d.name AS "division_name?",
                   b.id AS "bracket_id?",b.name AS "bracket_name?"
            FROM event_participants ep
            LEFT JOIN divisions d ON d.id = ep.division_id
            LEFT JOIN brackets b ON b.id = ep.bracket_id
            WHERE ep.event_id = $1
              AND ep.user_id IS NOT DISTINCT FROM $2::uuid
              AND ep.team_id IS NOT DISTINCT FROM $3::uuid
            "#,
            event_id.0,
            user_id,
            team_id,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)
    }

    async fn members(
        &self,
        organization_id: OrganizationId,
        competitor: CompetitorId,
    ) -> DomainResult<Vec<ProfileMemberRecord>> {
        let CompetitorId::Team(team_id) = competitor else {
            return Ok(Vec::new());
        };
        sqlx::query_as!(
            ProfileMemberRecord,
            r#"
            SELECT u.id AS user_id,u.display_name,tm.captain,tm.joined_at
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            JOIN users u ON u.id = tm.user_id
            WHERE tm.team_id = $1 AND t.organization_id = $2
            ORDER BY tm.captain DESC,tm.joined_at,u.id
            "#,
            team_id.0,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    async fn teams(
        &self,
        organization_id: OrganizationId,
        competitor: CompetitorId,
    ) -> DomainResult<Vec<ProfileTeamRecord>> {
        let CompetitorId::User(user_id) = competitor else {
            return Ok(Vec::new());
        };
        sqlx::query_as!(
            ProfileTeamRecord,
            r#"
            SELECT t.id AS team_id,t.name AS team_name,tm.captain,tm.joined_at
            FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.user_id = $1 AND t.organization_id = $2
            ORDER BY t.name,t.id
            "#,
            user_id.0,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    async fn recent_solves(
        &self,
        event_id: EventId,
        competitor: CompetitorId,
        organizer: bool,
        scoreboard_frozen: bool,
    ) -> DomainResult<Vec<ProfileSolveRecord>> {
        let (user_id, team_id) = competitor_columns(competitor);
        sqlx::query_as!(
            ProfileSolveRecord,
            r#"
            SELECT c.id AS challenge_id,c.name AS challenge_name,c.category,
                   s.awarded_points,COALESCE(s.first_blood,false) AS "first_blood!",
                   cs.solved_at
            FROM challenge_solves cs
            JOIN challenges c ON c.id = cs.challenge_id
            JOIN submissions s ON s.id = cs.submission_id
            JOIN score_entries se
              ON se.event_id = c.event_id
             AND se.user_id IS NOT DISTINCT FROM cs.user_id
             AND se.team_id IS NOT DISTINCT FROM cs.team_id
             AND se.reason->'solve'->>'challenge_id' = c.id::text
            WHERE c.event_id = $1
              AND ($2 OR c.state IN ('published','archived'))
              AND ($2 OR NOT $3 OR NOT se.hidden_by_freeze)
              AND cs.user_id IS NOT DISTINCT FROM $4::uuid
              AND cs.team_id IS NOT DISTINCT FROM $5::uuid
            ORDER BY cs.solved_at DESC,c.id
            LIMIT $6
            "#,
            event_id.0,
            organizer,
            scoreboard_frozen,
            user_id,
            team_id,
            RECENT_SOLVE_LIMIT,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }
}

const fn competitor_columns(competitor: CompetitorId) -> (Option<Uuid>, Option<Uuid>) {
    match competitor {
        CompetitorId::User(UserId(id)) => (Some(id), None),
        CompetitorId::Team(TeamId(id)) => (None, Some(id)),
    }
}

const fn competitor_identity(competitor: CompetitorId) -> (&'static str, Uuid) {
    match competitor {
        CompetitorId::User(UserId(id)) => ("user", id),
        CompetitorId::Team(TeamId(id)) => ("team", id),
    }
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres profiles: {error}"))
}
