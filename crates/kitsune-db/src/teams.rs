//! Tenant-scoped team membership persistence.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{BracketId, DivisionId, EventId, OrganizationId, TeamId, UserId},
    scoring::CompetitorId,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::resources::persist_audit_event;

/// Safe team member projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMemberRecord {
    /// User ID.
    pub user_id: Uuid,
    /// Public display name.
    pub display_name: String,
    /// Captain authority.
    pub captain: bool,
    /// Join instant.
    pub joined_at: DateTime<Utc>,
}

/// Safe team projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamRecord {
    /// Team ID.
    pub id: Uuid,
    /// Team name.
    pub name: String,
    /// Creation instant.
    pub created_at: DateTime<Utc>,
    /// Current members.
    pub members: Vec<TeamMemberRecord>,
}

/// Player-safe event registration projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRegistrationRecord {
    /// Event boundary.
    pub event_id: Uuid,
    /// Resolved event competitor kind.
    pub competitor_kind: &'static str,
    /// Resolved user or team identifier.
    pub competitor_id: Uuid,
    /// Optional event division.
    pub division_id: Option<Uuid>,
    /// Optional tournament bracket.
    pub bracket_id: Option<Uuid>,
    /// Registration instant.
    pub registered_at: DateTime<Utc>,
}

/// PostgreSQL team repository.
#[derive(Debug, Clone)]
pub struct TeamRepository {
    pool: PgPool,
}

impl TeamRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Lists only teams containing the authenticated user.
    pub async fn for_user(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<Vec<TeamRecord>> {
        let teams = sqlx::query!(
            r#"
            SELECT t.id,t.name,t.created_at
            FROM teams t
            JOIN team_members mine ON mine.team_id = t.id
            WHERE t.organization_id = $1 AND mine.user_id = $2
            ORDER BY t.name,t.id
            "#,
            organization_id.0,
            user_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        let mut records = Vec::with_capacity(teams.len());
        for team in teams {
            records.push(TeamRecord {
                id: team.id,
                name: team.name,
                created_at: team.created_at,
                members: self.members(organization_id, TeamId(team.id)).await?,
            });
        }
        Ok(records)
    }

    /// Creates a team with the creator as its sole captain.
    pub async fn create(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
        creator: UserId,
        name: &str,
        invite_code_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<(TeamRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_no_team(&mut tx, organization_id, creator).await?;
        sqlx::query!(
            r#"
            INSERT INTO teams (
                id,organization_id,name,invite_code_digest,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,'{}',$5,$5)
            "#,
            team_id.0,
            organization_id.0,
            name,
            invite_code_digest,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        sqlx::query!(
            "INSERT INTO team_members (team_id,user_id,captain,joined_at,organization_id) VALUES ($1,$2,true,$3,$4)",
            team_id.0,
            creator.0,
            now,
            organization_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        let envelope = EventEnvelope::new(
            organization_id,
            None,
            Some(creator),
            Uuid::now_v7(),
            now,
            DomainEvent::TeamCreated { team_id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.create",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        let record = self.one(organization_id, team_id).await?;
        Ok((record, envelope))
    }

    /// Joins the team addressed by an opaque invite-code digest.
    pub async fn join(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        invite_code_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<(TeamRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_no_team(&mut tx, organization_id, user_id).await?;
        let team_id = sqlx::query_scalar!(
            r#"
            SELECT id FROM teams
            WHERE organization_id = $1 AND invite_code_digest = $2
            FOR UPDATE
            "#,
            organization_id.0,
            invite_code_digest,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        enforce_registered_event_size(&mut tx, TeamId(team_id), 1).await?;
        sqlx::query!(
            "INSERT INTO team_members (team_id,user_id,captain,joined_at,organization_id) VALUES ($1,$2,false,$3,$4)",
            team_id,
            user_id.0,
            now,
            organization_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let team_id = TeamId(team_id);
        let envelope = membership_event(organization_id, team_id, user_id, user_id, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.member.join",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        let record = self.one(organization_id, team_id).await?;
        Ok((record, envelope))
    }

    /// Rotates the one-time invite digest under captain authority.
    pub async fn rotate_invite(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
        actor: UserId,
        invite_code_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_captain(&mut tx, organization_id, team_id, actor).await?;
        sqlx::query!(
            "UPDATE teams SET invite_code_digest = $1,updated_at = $2 WHERE id = $3 AND organization_id = $4",
            invite_code_digest,
            now,
            team_id.0,
            organization_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = team_changed_event(organization_id, team_id, actor, "invite_rotated", now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.invite.rotate",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Removes a non-captain member under captain authority.
    pub async fn remove_member(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
        actor: UserId,
        target: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<(TeamRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_captain(&mut tx, organization_id, team_id, actor).await?;
        delete_non_captain_member(&mut tx, team_id, target).await?;
        let envelope = membership_event(organization_id, team_id, actor, target, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.member.remove",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        let record = self.one(organization_id, team_id).await?;
        Ok((record, envelope))
    }

    /// Lets a non-captain member leave their current team.
    pub async fn leave(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
        actor: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_member(&mut tx, organization_id, team_id, actor).await?;
        delete_non_captain_member(&mut tx, team_id, actor).await?;
        let envelope = membership_event(organization_id, team_id, actor, actor, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.member.leave",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Creates or updates the authenticated competitor's event registration.
    pub async fn register_event(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        division_id: Option<DivisionId>,
        bracket_id: Option<BracketId>,
        now: DateTime<Utc>,
    ) -> DomainResult<(EventRegistrationRecord, Option<EventEnvelope>)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let event = sqlx::query!(
            r#"
            SELECT participation,state,team_size_limit
            FROM events
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE
            "#,
            event_id.0,
            organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        if matches!(event.state.as_str(), "ended" | "archived") {
            return Err(DomainError::Conflict("event registration is closed".into()));
        }
        validate_registration_groups(&mut tx, event_id, division_id, bracket_id).await?;
        let competitor =
            resolve_event_competitor(&mut tx, organization_id, actor, &event.participation).await?;
        if let (CompetitorId::Team(team_id), Some(limit)) = (competitor, event.team_size_limit) {
            lock_team(&mut tx, organization_id, team_id).await?;
            let members = team_member_count(&mut tx, team_id).await?;
            if members > i64::from(limit) {
                return Err(DomainError::Validation(
                    "team exceeds this event's size limit".into(),
                ));
            }
        }
        let (user_id, team_id) = competitor_columns(competitor);
        let existing = sqlx::query!(
            r#"
            SELECT division_id,bracket_id,registered_at
            FROM event_participants
            WHERE event_id = $1
              AND user_id IS NOT DISTINCT FROM $2
              AND team_id IS NOT DISTINCT FROM $3
            "#,
            event_id.0,
            user_id,
            team_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?;
        if let Some(existing) = existing
            && existing.division_id == division_id.map(|id| id.0)
            && existing.bracket_id == bracket_id.map(|id| id.0)
        {
            tx.rollback().await.map_err(unavailable)?;
            let (competitor_kind, competitor_id) = competitor_identity(competitor);
            return Ok((
                EventRegistrationRecord {
                    event_id: event_id.0,
                    competitor_kind,
                    competitor_id,
                    division_id: existing.division_id,
                    bracket_id: existing.bracket_id,
                    registered_at: existing.registered_at,
                },
                None,
            ));
        }
        let row = sqlx::query!(
            r#"
            INSERT INTO event_participants (
                event_id,user_id,team_id,division_id,bracket_id,registered_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (event_id,user_id,team_id)
            DO UPDATE SET division_id = EXCLUDED.division_id,
                          bracket_id = EXCLUDED.bracket_id
            RETURNING division_id,bracket_id,registered_at
            "#,
            event_id.0,
            user_id,
            team_id,
            division_id.map(|id| id.0),
            bracket_id.map(|id| id.0),
            now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = registration_event(organization_id, event_id, actor, competitor, true, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "event.registration.upsert",
            "event",
            &event_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        let (competitor_kind, competitor_id) = competitor_identity(competitor);
        Ok((
            EventRegistrationRecord {
                event_id: event_id.0,
                competitor_kind,
                competitor_id,
                division_id: row.division_id,
                bracket_id: row.bracket_id,
                registered_at: row.registered_at,
            },
            Some(envelope),
        ))
    }

    /// Returns the authenticated competitor's registration, when present.
    pub async fn event_registration(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
    ) -> DomainResult<Option<EventRegistrationRecord>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let participation = sqlx::query_scalar!(
            "SELECT participation FROM events WHERE id = $1 AND organization_id = $2",
            event_id.0,
            organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let competitor =
            match resolve_event_competitor(&mut tx, organization_id, actor, &participation).await {
                Ok(competitor) => competitor,
                Err(DomainError::Validation(_)) if participation == "team" => {
                    tx.rollback().await.map_err(unavailable)?;
                    return Ok(None);
                }
                Err(error) => return Err(error),
            };
        let (user_id, team_id) = competitor_columns(competitor);
        let row = sqlx::query!(
            r#"
            SELECT division_id,bracket_id,registered_at
            FROM event_participants
            WHERE event_id = $1
              AND user_id IS NOT DISTINCT FROM $2
              AND team_id IS NOT DISTINCT FROM $3
            "#,
            event_id.0,
            user_id,
            team_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.rollback().await.map_err(unavailable)?;
        let (competitor_kind, competitor_id) = competitor_identity(competitor);
        Ok(row.map(|row| EventRegistrationRecord {
            event_id: event_id.0,
            competitor_kind,
            competitor_id,
            division_id: row.division_id,
            bracket_id: row.bracket_id,
            registered_at: row.registered_at,
        }))
    }

    /// Removes a registration only before gameplay begins.
    pub async fn unregister_event(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let participation = sqlx::query!(
            "SELECT participation,state FROM events WHERE id = $1 AND organization_id = $2 FOR UPDATE",
            event_id.0,
            organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        if !matches!(participation.state.as_str(), "draft" | "scheduled") {
            return Err(DomainError::Conflict(
                "registration cannot be removed after gameplay begins".into(),
            ));
        }
        let competitor = resolve_event_competitor(
            &mut tx,
            organization_id,
            actor,
            &participation.participation,
        )
        .await?;
        let (user_id, team_id) = competitor_columns(competitor);
        let deleted = sqlx::query!(
            r#"
            DELETE FROM event_participants
            WHERE event_id = $1
              AND user_id IS NOT DISTINCT FROM $2
              AND team_id IS NOT DISTINCT FROM $3
            "#,
            event_id.0,
            user_id,
            team_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        if deleted.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        let envelope = registration_event(organization_id, event_id, actor, competitor, false, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "event.registration.remove",
            "event",
            &event_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Transfers captaincy to another existing member.
    pub async fn transfer_captain(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
        actor: UserId,
        target: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<(TeamRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        require_captain(&mut tx, organization_id, team_id, actor).await?;
        let target_exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2) AS \"exists!\"",
            team_id.0,
            target.0,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if !target_exists {
            return Err(DomainError::NotFound);
        }
        sqlx::query!(
            "UPDATE team_members SET captain = false WHERE team_id = $1 AND captain",
            team_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!(
            "UPDATE team_members SET captain = true WHERE team_id = $1 AND user_id = $2",
            team_id.0,
            target.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        let envelope = membership_event(organization_id, team_id, actor, target, now);
        persist_audit_event(
            &mut tx,
            &envelope,
            "team.captain.transfer",
            "team",
            &team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        let record = self.one(organization_id, team_id).await?;
        Ok((record, envelope))
    }

    async fn one(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
    ) -> DomainResult<TeamRecord> {
        let row = sqlx::query!(
            "SELECT id,name,created_at FROM teams WHERE id = $1 AND organization_id = $2",
            team_id.0,
            organization_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        Ok(TeamRecord {
            id: row.id,
            name: row.name,
            created_at: row.created_at,
            members: self.members(organization_id, team_id).await?,
        })
    }

    async fn members(
        &self,
        organization_id: OrganizationId,
        team_id: TeamId,
    ) -> DomainResult<Vec<TeamMemberRecord>> {
        sqlx::query_as!(
            TeamMemberRecord,
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
}

async fn require_no_team(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    user_id: UserId,
) -> DomainResult<()> {
    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE t.organization_id = $1 AND tm.user_id = $2
        ) AS "exists!"
        "#,
        organization_id.0,
        user_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if exists {
        Err(DomainError::Conflict(
            "user already belongs to a team".into(),
        ))
    } else {
        Ok(())
    }
}

async fn require_captain(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    team_id: TeamId,
    user_id: UserId,
) -> DomainResult<()> {
    let captain = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.team_id = $1 AND t.organization_id = $2
              AND tm.user_id = $3 AND tm.captain
        ) AS "exists!"
        "#,
        team_id.0,
        organization_id.0,
        user_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if captain {
        Ok(())
    } else {
        Err(DomainError::Forbidden)
    }
}

async fn require_member(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    team_id: TeamId,
    user_id: UserId,
) -> DomainResult<()> {
    let member = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM team_members tm
            JOIN teams t ON t.id = tm.team_id
            WHERE tm.team_id = $1 AND t.organization_id = $2 AND tm.user_id = $3
        ) AS "exists!"
        "#,
        team_id.0,
        organization_id.0,
        user_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if member {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

async fn delete_non_captain_member(
    tx: &mut Transaction<'_, Postgres>,
    team_id: TeamId,
    target: UserId,
) -> DomainResult<()> {
    let row = sqlx::query_scalar!(
        "SELECT captain FROM team_members WHERE team_id = $1 AND user_id = $2 FOR UPDATE",
        team_id.0,
        target.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    if row {
        return Err(DomainError::Conflict(
            "transfer captaincy before this member leaves".into(),
        ));
    }
    sqlx::query!(
        "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2",
        team_id.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn enforce_registered_event_size(
    tx: &mut Transaction<'_, Postgres>,
    team_id: TeamId,
    additional_members: i64,
) -> DomainResult<()> {
    let members = team_member_count(tx, team_id).await?;
    let blocked = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM event_participants ep
            JOIN events e ON e.id = ep.event_id
            WHERE ep.team_id = $1
              AND e.state NOT IN ('ended','archived')
              AND e.team_size_limit IS NOT NULL
              AND $2::bigint + $3::bigint > e.team_size_limit
        ) AS "exists!"
        "#,
        team_id.0,
        members,
        additional_members,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if blocked {
        Err(DomainError::Validation(
            "joining would exceed a registered event's team size limit".into(),
        ))
    } else {
        Ok(())
    }
}

async fn lock_team(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    team_id: TeamId,
) -> DomainResult<()> {
    sqlx::query_scalar!(
        "SELECT id FROM teams WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        team_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(())
}

async fn team_member_count(
    tx: &mut Transaction<'_, Postgres>,
    team_id: TeamId,
) -> DomainResult<i64> {
    sqlx::query_scalar!(
        "SELECT count(*) AS \"count!\" FROM team_members WHERE team_id = $1",
        team_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

async fn validate_registration_groups(
    tx: &mut Transaction<'_, Postgres>,
    event_id: EventId,
    division_id: Option<DivisionId>,
    bracket_id: Option<BracketId>,
) -> DomainResult<()> {
    if let Some(division_id) = division_id {
        let valid = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1 AND event_id = $2) AS \"exists!\"",
            division_id.0,
            event_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
        if !valid {
            return Err(DomainError::Validation(
                "division does not belong to this event".into(),
            ));
        }
    }
    if let Some(bracket_id) = bracket_id {
        let valid = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM brackets WHERE id = $1 AND event_id = $2) AS \"exists!\"",
            bracket_id.0,
            event_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
        if !valid {
            return Err(DomainError::Validation(
                "bracket does not belong to this event".into(),
            ));
        }
    }
    Ok(())
}

async fn resolve_event_competitor(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    actor: UserId,
    participation: &str,
) -> DomainResult<CompetitorId> {
    let team_id = sqlx::query_scalar!(
        r#"
        SELECT tm.team_id
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.organization_id = $1 AND tm.user_id = $2
        "#,
        organization_id.0,
        actor.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    match participation {
        "individual" => Ok(CompetitorId::User(actor)),
        "team" => team_id
            .map(|id| CompetitorId::Team(TeamId(id)))
            .ok_or_else(|| DomainError::Validation("join a team before registering".into())),
        "hybrid" => Ok(team_id.map_or(CompetitorId::User(actor), |id| {
            CompetitorId::Team(TeamId(id))
        })),
        _ => Err(DomainError::Unavailable(
            "event contains an invalid participation mode".into(),
        )),
    }
}

const fn competitor_columns(competitor: CompetitorId) -> (Option<Uuid>, Option<Uuid>) {
    match competitor {
        CompetitorId::User(user_id) => (Some(user_id.0), None),
        CompetitorId::Team(team_id) => (None, Some(team_id.0)),
    }
}

const fn competitor_identity(competitor: CompetitorId) -> (&'static str, Uuid) {
    match competitor {
        CompetitorId::User(user_id) => ("user", user_id.0),
        CompetitorId::Team(team_id) => ("team", team_id.0),
    }
}

fn membership_event(
    organization_id: OrganizationId,
    team_id: TeamId,
    actor: UserId,
    user_id: UserId,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        None,
        Some(actor),
        Uuid::now_v7(),
        now,
        DomainEvent::TeamMembershipChanged { team_id, user_id },
    )
}

fn team_changed_event(
    organization_id: OrganizationId,
    team_id: TeamId,
    actor: UserId,
    change: &str,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        None,
        Some(actor),
        Uuid::now_v7(),
        now,
        DomainEvent::TeamChanged {
            team_id,
            change: change.to_owned(),
        },
    )
}

fn registration_event(
    organization_id: OrganizationId,
    event_id: EventId,
    actor: UserId,
    competitor: CompetitorId,
    registered: bool,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        Some(event_id),
        Some(actor),
        Uuid::now_v7(),
        now,
        DomainEvent::EventRegistrationChanged {
            competitor,
            registered,
        },
    )
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres teams: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("team or membership already exists".into())
    } else {
        unavailable(error)
    }
}
