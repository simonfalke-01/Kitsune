//! Tenant-scoped team membership persistence.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{OrganizationId, TeamId, UserId},
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
