//! Integrity-safe organizer operations across team boundaries.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{OrganizationId, TeamId, UserId},
};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    resources::persist_audit_event,
    teams::{TeamRecord, TeamRepository},
};

/// Result of an administrator member transfer.
#[derive(Debug, Clone)]
pub struct MemberTransferResult {
    /// Source team after the member leaves.
    pub source: TeamRecord,
    /// Target team after the member arrives.
    pub target: TeamRecord,
    /// Durable domain event to publish after commit.
    pub event: EventEnvelope,
}

/// Result of an administrator team merge.
#[derive(Debug, Clone)]
pub struct TeamMergeResult {
    /// Surviving target team.
    pub target: TeamRecord,
    /// Durable domain event to publish after commit.
    pub event: EventEnvelope,
}

/// Authorized member-transfer command.
pub struct TransferMember {
    /// Tenant boundary.
    pub organization_id: OrganizationId,
    /// Team the member currently belongs to.
    pub source_team_id: TeamId,
    /// Team receiving the member.
    pub target_team_id: TeamId,
    /// Member moving between rosters.
    pub member_id: UserId,
    /// Source successor, required only when moving its captain.
    pub replacement_captain_id: Option<UserId>,
    /// Organizer responsible for the mutation.
    pub actor: UserId,
    /// Trusted command timestamp.
    pub now: DateTime<Utc>,
}

/// PostgreSQL repository for privileged team mutations.
#[derive(Debug, Clone)]
pub struct TeamAdminRepository {
    pool: PgPool,
}

impl TeamAdminRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Transfers one member without rewriting either team's historical scores.
    pub async fn transfer_member(
        &self,
        command: TransferMember,
    ) -> DomainResult<MemberTransferResult> {
        let TransferMember {
            organization_id,
            source_team_id,
            target_team_id,
            member_id,
            replacement_captain_id,
            actor,
            now,
        } = command;
        require_distinct_teams(source_team_id, target_team_id)?;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_teams(&mut tx, organization_id, source_team_id, target_team_id).await?;
        ensure_mutation_safe(&mut tx, source_team_id, target_team_id).await?;
        enforce_target_event_sizes(&mut tx, target_team_id, 1).await?;

        let member = sqlx::query!(
            r#"
            SELECT captain
            FROM team_members
            WHERE team_id = $1 AND user_id = $2
            FOR UPDATE
            "#,
            source_team_id.0,
            member_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;

        if member.captain {
            transfer_source_captain(&mut tx, source_team_id, member_id, replacement_captain_id)
                .await?;
        } else if replacement_captain_id.is_some() {
            return Err(DomainError::Validation(
                "replacement captain is only valid when transferring the captain".into(),
            ));
        }

        sqlx::query!(
            r#"
            UPDATE team_members
            SET team_id = $1, captain = false
            WHERE team_id = $2 AND user_id = $3
            "#,
            target_team_id.0,
            source_team_id.0,
            member_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        sqlx::query!(
            "UPDATE teams SET updated_at = $1 WHERE id = ANY($2)",
            now,
            &[source_team_id.0, target_team_id.0],
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;

        let event = EventEnvelope::new(
            organization_id,
            None,
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::TeamMemberTransferred {
                user_id: member_id,
                source_team_id,
                target_team_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &event,
            "team.member.admin_transfer",
            "team",
            &source_team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;

        let teams = TeamRepository::new(self.pool.clone());
        Ok(MemberTransferResult {
            source: teams.one(organization_id, source_team_id).await?,
            target: teams.one(organization_id, target_team_id).await?,
            event,
        })
    }

    /// Merges a source team into a target and reassigns all historical ownership.
    pub async fn merge(
        &self,
        organization_id: OrganizationId,
        source_team_id: TeamId,
        target_team_id: TeamId,
        actor: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<TeamMergeResult> {
        require_distinct_teams(source_team_id, target_team_id)?;
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_teams(&mut tx, organization_id, source_team_id, target_team_id).await?;
        ensure_mutation_safe(&mut tx, source_team_id, target_team_id).await?;
        enforce_merged_event_sizes(&mut tx, source_team_id, target_team_id).await?;

        merge_event_participants(&mut tx, source_team_id, target_team_id).await?;
        merge_audience_members(&mut tx, source_team_id, target_team_id).await?;
        merge_challenge_solves(&mut tx, source_team_id, target_team_id).await?;
        merge_hint_unlocks(&mut tx, source_team_id, target_team_id).await?;
        merge_writeups(&mut tx, source_team_id, target_team_id).await?;
        merge_survey_responses(&mut tx, source_team_id, target_team_id).await?;
        merge_attack_defense_history(&mut tx, source_team_id, target_team_id).await?;
        reassign_non_unique_history(&mut tx, source_team_id, target_team_id).await?;
        merge_members(&mut tx, source_team_id, target_team_id).await?;

        sqlx::query!(
            "UPDATE teams SET updated_at = $1 WHERE id = $2",
            now,
            target_team_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!("DELETE FROM teams WHERE id = $1", source_team_id.0)
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;

        let event = EventEnvelope::new(
            organization_id,
            None,
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::TeamMerged {
                source_team_id,
                target_team_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &event,
            "team.merge",
            "team",
            &target_team_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;

        let target = TeamRepository::new(self.pool.clone())
            .one(organization_id, target_team_id)
            .await?;
        Ok(TeamMergeResult { target, event })
    }
}

fn require_distinct_teams(source: TeamId, target: TeamId) -> DomainResult<()> {
    if source == target {
        Err(DomainError::Validation(
            "source and target teams must differ".into(),
        ))
    } else {
        Ok(())
    }
}

async fn lock_teams(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    let (first, second) = if source < target {
        (source, target)
    } else {
        (target, source)
    };
    for team_id in [first, second] {
        sqlx::query_scalar!(
            "SELECT id FROM teams WHERE id = $1 AND organization_id = $2 FOR UPDATE",
            team_id.0,
            organization_id.0,
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
    }
    Ok(())
}

async fn ensure_mutation_safe(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    let teams = &[source.0, target.0];
    let competing = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM event_participants participant
            JOIN events event ON event.id = participant.event_id
            WHERE participant.team_id = ANY($1)
              AND event.state IN ('live','paused')
        ) AS "exists!"
        "#,
        teams,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if competing {
        return Err(DomainError::Conflict(
            "team membership cannot change during a live or paused event".into(),
        ));
    }

    let active_instance = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM instances
            WHERE team_id = ANY($1)
              AND state IN ('requested','provisioning','ready','unhealthy','stopping')
        ) AS "exists!"
        "#,
        teams,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if active_instance {
        return Err(DomainError::Conflict(
            "stop active team instances before changing membership".into(),
        ));
    }
    Ok(())
}

async fn enforce_target_event_sizes(
    tx: &mut Transaction<'_, Postgres>,
    target: TeamId,
    additional_members: i64,
) -> DomainResult<()> {
    let current_members = sqlx::query_scalar!(
        "SELECT count(*) AS \"count!\" FROM team_members WHERE team_id = $1",
        target.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    let blocked = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM event_participants participant
            JOIN events event ON event.id = participant.event_id
            WHERE participant.team_id = $1
              AND event.state NOT IN ('ended','archived')
              AND event.team_size_limit IS NOT NULL
              AND $2::bigint + $3::bigint > event.team_size_limit::bigint
        ) AS "exists!"
        "#,
        target.0,
        current_members,
        additional_members,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if blocked {
        Err(DomainError::Validation(
            "transfer would exceed a registered event's team size limit".into(),
        ))
    } else {
        Ok(())
    }
}

async fn enforce_merged_event_sizes(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    let teams = &[source.0, target.0];
    let combined_members = sqlx::query_scalar!(
        "SELECT count(*) AS \"count!\" FROM team_members WHERE team_id = ANY($1)",
        teams,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    let blocked = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM event_participants participant
            JOIN events event ON event.id = participant.event_id
            WHERE participant.team_id = ANY($1)
              AND event.state NOT IN ('ended','archived')
              AND event.team_size_limit IS NOT NULL
              AND $2::bigint > event.team_size_limit::bigint
        ) AS "exists!"
        "#,
        teams,
        combined_members,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if blocked {
        Err(DomainError::Validation(
            "merged roster would exceed a registered event's team size limit".into(),
        ))
    } else {
        Ok(())
    }
}

async fn transfer_source_captain(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    member: UserId,
    replacement: Option<UserId>,
) -> DomainResult<()> {
    let replacement = replacement.ok_or_else(|| {
        DomainError::Validation("a source-team replacement captain is required".into())
    })?;
    if replacement == member {
        return Err(DomainError::Validation(
            "replacement captain must be another source-team member".into(),
        ));
    }
    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2
        ) AS "exists!"
        "#,
        source.0,
        replacement.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if !exists {
        return Err(DomainError::Validation(
            "replacement captain must belong to the source team".into(),
        ));
    }
    sqlx::query!(
        "UPDATE team_members SET captain = false WHERE team_id = $1 AND user_id = $2",
        source.0,
        member.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE team_members SET captain = true WHERE team_id = $1 AND user_id = $2",
        source.0,
        replacement.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_event_participants(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        UPDATE event_participants target_row
        SET registered_at = LEAST(target_row.registered_at, source_row.registered_at),
            division_id = COALESCE(target_row.division_id, source_row.division_id),
            bracket_id = COALESCE(target_row.bracket_id, source_row.bracket_id)
        FROM event_participants source_row
        WHERE source_row.team_id = $1
          AND target_row.team_id = $2
          AND target_row.event_id = source_row.event_id
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        DELETE FROM event_participants source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM event_participants target_row
              WHERE target_row.team_id = $2
                AND target_row.event_id = source_row.event_id
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE event_participants SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_audience_members(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        DELETE FROM audience_members source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM audience_members target_row
              WHERE target_row.team_id = $2
                AND target_row.audience_id = source_row.audience_id
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE audience_members SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_challenge_solves(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        DELETE FROM challenge_solves source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM challenge_solves target_row
              WHERE target_row.team_id = $2
                AND target_row.challenge_id = source_row.challenge_id
                AND target_row.solved_at <= source_row.solved_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        DELETE FROM challenge_solves target_row
        WHERE target_row.team_id = $2
          AND EXISTS (
              SELECT 1 FROM challenge_solves source_row
              WHERE source_row.team_id = $1
                AND source_row.challenge_id = target_row.challenge_id
                AND source_row.solved_at < target_row.solved_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE challenge_solves SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_hint_unlocks(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        UPDATE hint_unlocks target_row
        SET unlocked_at = LEAST(target_row.unlocked_at, source_row.unlocked_at)
        FROM hint_unlocks source_row
        WHERE source_row.team_id = $1
          AND target_row.team_id = $2
          AND target_row.challenge_id = source_row.challenge_id
          AND target_row.hint_id = source_row.hint_id
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        DELETE FROM hint_unlocks source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM hint_unlocks target_row
              WHERE target_row.team_id = $2
                AND target_row.challenge_id = source_row.challenge_id
                AND target_row.hint_id = source_row.hint_id
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE hint_unlocks SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_writeups(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    delete_older_writeup_rows(tx, source, target).await?;
    sqlx::query!(
        "UPDATE writeups SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn delete_older_writeup_rows(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        DELETE FROM writeups source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM writeups target_row
              WHERE target_row.team_id = $2
                AND target_row.challenge_id = source_row.challenge_id
                AND target_row.updated_at >= source_row.updated_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        DELETE FROM writeups target_row
        WHERE target_row.team_id = $2
          AND EXISTS (
              SELECT 1 FROM writeups source_row
              WHERE source_row.team_id = $1
                AND source_row.challenge_id = target_row.challenge_id
                AND source_row.updated_at > target_row.updated_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_survey_responses(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        DELETE FROM survey_responses source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM survey_responses target_row
              WHERE target_row.team_id = $2
                AND target_row.challenge_id = source_row.challenge_id
                AND target_row.submitted_at >= source_row.submitted_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        DELETE FROM survey_responses target_row
        WHERE target_row.team_id = $2
          AND EXISTS (
              SELECT 1 FROM survey_responses source_row
              WHERE source_row.team_id = $1
                AND source_row.challenge_id = target_row.challenge_id
                AND source_row.submitted_at > target_row.submitted_at
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE survey_responses SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_attack_defense_history(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        r#"
        DELETE FROM attack_defense_flags source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM attack_defense_flags target_row
              WHERE target_row.team_id = $2
                AND target_row.event_id = source_row.event_id
                AND target_row.tick = source_row.tick
                AND target_row.service = source_row.service
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE attack_defense_flags SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;

    sqlx::query!(
        r#"
        DELETE FROM checker_results source_row
        WHERE source_row.team_id = $1
          AND EXISTS (
              SELECT 1 FROM checker_results target_row
              WHERE target_row.team_id = $2
                AND target_row.event_id = source_row.event_id
                AND target_row.tick = source_row.tick
                AND target_row.service = source_row.service
          )
        "#,
        source.0,
        target.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE checker_results SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn reassign_non_unique_history(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        "UPDATE role_grants SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE submissions SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE score_entries SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE instances SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn merge_members(
    tx: &mut Transaction<'_, Postgres>,
    source: TeamId,
    target: TeamId,
) -> DomainResult<()> {
    sqlx::query!(
        "UPDATE team_members SET captain = false WHERE team_id = $1 AND captain",
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        "UPDATE team_members SET team_id = $1 WHERE team_id = $2",
        target.0,
        source.0,
    )
    .execute(&mut **tx)
    .await
    .map_err(conflict_or_unavailable)?;
    Ok(())
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres team administration: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("team mutation conflicts with current membership".into())
    } else {
        unavailable(error)
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_core::{
        DomainError,
        identity::{OrganizationId, TeamId, UserId},
    };
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{TeamAdminRepository, TransferMember};
    use crate::MIGRATOR;

    struct TeamFixture {
        organization_id: OrganizationId,
        actor: UserId,
        source_captain: UserId,
        source_member: UserId,
        target_captain: UserId,
        source_team: TeamId,
        target_team: TeamId,
        now: chrono::DateTime<Utc>,
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn captain_transfer_requires_and_applies_a_source_successor(pool: PgPool) {
        let fixture = seed_teams(&pool).await;
        let repository = TeamAdminRepository::new(pool.clone());

        let missing_successor = repository
            .transfer_member(TransferMember {
                organization_id: fixture.organization_id,
                source_team_id: fixture.source_team,
                target_team_id: fixture.target_team,
                member_id: fixture.source_captain,
                replacement_captain_id: None,
                actor: fixture.actor,
                now: fixture.now,
            })
            .await;
        assert!(matches!(missing_successor, Err(DomainError::Validation(_))));

        let transferred = repository
            .transfer_member(TransferMember {
                organization_id: fixture.organization_id,
                source_team_id: fixture.source_team,
                target_team_id: fixture.target_team,
                member_id: fixture.source_captain,
                replacement_captain_id: Some(fixture.source_member),
                actor: fixture.actor,
                now: fixture.now,
            })
            .await
            .expect("transfer captain between teams");
        assert_eq!(transferred.source.members.len(), 1);
        assert_eq!(
            transferred.source.members[0].user_id,
            fixture.source_member.0
        );
        assert!(transferred.source.members[0].captain);
        assert_eq!(transferred.target.members.len(), 2);
        assert!(
            transferred
                .target
                .members
                .iter()
                .any(|member| { member.user_id == fixture.source_captain.0 && !member.captain })
        );
        assert_eq!(transferred.event.kind(), "identity.team.member_transferred");
        assert_audit_and_outbox_count(&pool, 1).await;
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn merge_reassigns_history_and_resolves_competitor_collisions(pool: PgPool) {
        let fixture = seed_teams(&pool).await;
        let history = seed_historical_ownership(&pool, &fixture).await;
        let repository = TeamAdminRepository::new(pool.clone());

        let merged = repository
            .merge(
                fixture.organization_id,
                fixture.source_team,
                fixture.target_team,
                fixture.actor,
                fixture.now + Duration::hours(1),
            )
            .await
            .expect("merge historical teams");

        assert_eq!(merged.target.members.len(), 3);
        assert_eq!(
            merged
                .target
                .members
                .iter()
                .filter(|member| member.captain)
                .count(),
            1
        );
        assert_eq!(merged.event.kind(), "identity.team.merged");
        assert_source_team_is_absent(&pool, fixture.source_team).await;
        assert_historical_ownership(&pool, &fixture, &history).await;
        assert_audit_and_outbox_count(&pool, 1).await;
    }

    #[allow(clippy::struct_field_names)]
    struct HistoricalFixture {
        event_id: Uuid,
        challenge_id: Uuid,
        source_submission_id: Uuid,
        source_writeup_id: Uuid,
        target_survey_id: Uuid,
    }

    async fn seed_teams(pool: &PgPool) -> TeamFixture {
        let fixture = TeamFixture {
            organization_id: OrganizationId::new(),
            actor: UserId::new(),
            source_captain: UserId::new(),
            source_member: UserId::new(),
            target_captain: UserId::new(),
            source_team: TeamId::new(),
            target_team: TeamId::new(),
            now: Utc::now(),
        };
        sqlx::query!(
            "INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,$2,$3,$4)",
            fixture.organization_id.0,
            "Team Admin Test",
            format!("team-admin-{}", fixture.organization_id),
            fixture.now,
        )
        .execute(pool)
        .await
        .expect("organization");
        for (user_id, email, display_name) in [
            (fixture.actor, "admin@example.test", "Admin"),
            (
                fixture.source_captain,
                "source-captain@example.test",
                "Source Captain",
            ),
            (
                fixture.source_member,
                "source-member@example.test",
                "Source Member",
            ),
            (
                fixture.target_captain,
                "target-captain@example.test",
                "Target Captain",
            ),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO users (
                    id,organization_id,email,email_normalized,display_name,email_verified,
                    disabled,custom_fields,created_at,updated_at
                ) VALUES ($1,$2,$3,$3,$4,true,false,'{}',$5,$5)
                "#,
                user_id.0,
                fixture.organization_id.0,
                email,
                display_name,
                fixture.now,
            )
            .execute(pool)
            .await
            .expect("user");
        }
        for (team_id, name, digest) in [
            (fixture.source_team, "Source Team", vec![1_u8; 32]),
            (fixture.target_team, "Target Team", vec![2_u8; 32]),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO teams (
                    id,organization_id,name,invite_code_digest,custom_fields,created_at,updated_at
                ) VALUES ($1,$2,$3,$4,'{}',$5,$5)
                "#,
                team_id.0,
                fixture.organization_id.0,
                name,
                digest,
                fixture.now,
            )
            .execute(pool)
            .await
            .expect("team");
        }
        for (team_id, user_id, captain) in [
            (fixture.source_team, fixture.source_captain, true),
            (fixture.source_team, fixture.source_member, false),
            (fixture.target_team, fixture.target_captain, true),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO team_members (
                    team_id,user_id,captain,joined_at,organization_id
                ) VALUES ($1,$2,$3,$4,$5)
                "#,
                team_id.0,
                user_id.0,
                captain,
                fixture.now,
                fixture.organization_id.0,
            )
            .execute(pool)
            .await
            .expect("team member");
        }
        fixture
    }

    async fn seed_historical_ownership(pool: &PgPool, fixture: &TeamFixture) -> HistoricalFixture {
        let history = HistoricalFixture {
            event_id: Uuid::now_v7(),
            challenge_id: Uuid::now_v7(),
            source_submission_id: Uuid::now_v7(),
            source_writeup_id: Uuid::now_v7(),
            target_survey_id: Uuid::now_v7(),
        };
        let modes = vec!["jeopardy".to_owned(), "attack_defense".to_owned()];
        sqlx::query!(
            r#"
            INSERT INTO events (
                id,organization_id,name,slug,state,participation,modes,created_at,updated_at
            ) VALUES ($1,$2,'Ended Event',$3,'ended','team',$4,$5,$5)
            "#,
            history.event_id,
            fixture.organization_id.0,
            format!("ended-{}", history.event_id),
            &modes,
            fixture.now,
        )
        .execute(pool)
        .await
        .expect("event");
        for (team_id, registered_at) in [
            (fixture.source_team, fixture.now - Duration::hours(2)),
            (fixture.target_team, fixture.now - Duration::hours(1)),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO event_participants (event_id,team_id,registered_at)
                VALUES ($1,$2,$3)
                "#,
                history.event_id,
                team_id.0,
                registered_at,
            )
            .execute(pool)
            .await
            .expect("event participant");
        }
        sqlx::query!(
            r#"
            INSERT INTO challenges (
                id,event_id,name,category,description,kind,state,scoring,visibility,
                created_by,created_at,updated_at
            ) VALUES (
                $1,$2,'History Challenge','Forensics','Historical ownership',
                '{"kind":"static_flag"}','archived',
                '{"kind":"static","points":100}','{}',$3,$4,$4
            )
            "#,
            history.challenge_id,
            history.event_id,
            fixture.actor.0,
            fixture.now,
        )
        .execute(pool)
        .await
        .expect("challenge");
        sqlx::query!(
            r#"
            INSERT INTO challenge_hints (challenge_id,id,content,cost)
            VALUES ($1,1,'A historical hint',10)
            "#,
            history.challenge_id,
        )
        .execute(pool)
        .await
        .expect("hint");
        seed_audience_history(pool, fixture, &history).await;
        seed_submission_history(pool, fixture, &history).await;
        seed_engagement_history(pool, fixture, &history).await;
        seed_scoring_and_instance_history(pool, fixture, &history).await;
        seed_attack_defense_history(pool, fixture, &history).await;
        history
    }

    async fn seed_audience_history(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        let audience_id = Uuid::now_v7();
        sqlx::query!(
            "INSERT INTO audiences (id,event_id,name) VALUES ($1,$2,'Finalists')",
            audience_id,
            history.event_id,
        )
        .execute(pool)
        .await
        .expect("audience");
        for team_id in [fixture.source_team, fixture.target_team] {
            sqlx::query!(
                "INSERT INTO audience_members (audience_id,team_id) VALUES ($1,$2)",
                audience_id,
                team_id.0,
            )
            .execute(pool)
            .await
            .expect("audience member");
        }
        for (team_id, unlocked_at) in [
            (fixture.source_team, fixture.now - Duration::minutes(30)),
            (fixture.target_team, fixture.now - Duration::minutes(10)),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO hint_unlocks (
                    challenge_id,hint_id,team_id,unlocked_at
                ) VALUES ($1,1,$2,$3)
                "#,
                history.challenge_id,
                team_id.0,
                unlocked_at,
            )
            .execute(pool)
            .await
            .expect("hint unlock");
        }
    }

    async fn seed_submission_history(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        let target_submission_id = Uuid::now_v7();
        for (submission_id, team_id, submitted_at) in [
            (
                history.source_submission_id,
                fixture.source_team,
                fixture.now - Duration::minutes(20),
            ),
            (
                target_submission_id,
                fixture.target_team,
                fixture.now - Duration::minutes(10),
            ),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO submissions (
                    id,event_id,challenge_id,team_id,outcome,idempotency_key,submitted_at
                ) VALUES ($1,$2,$3,$4,'correct',$5,$6)
                "#,
                submission_id,
                history.event_id,
                history.challenge_id,
                team_id.0,
                Uuid::now_v7(),
                submitted_at,
            )
            .execute(pool)
            .await
            .expect("submission");
            sqlx::query!(
                r#"
                INSERT INTO challenge_solves (
                    challenge_id,team_id,submission_id,solved_at
                ) VALUES ($1,$2,$3,$4)
                "#,
                history.challenge_id,
                team_id.0,
                submission_id,
                submitted_at,
            )
            .execute(pool)
            .await
            .expect("solve");
        }
    }

    async fn seed_engagement_history(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        let target_writeup_id = Uuid::now_v7();
        for (id, team_id, body, updated_at) in [
            (
                history.source_writeup_id,
                fixture.source_team,
                "New source writeup",
                fixture.now,
            ),
            (
                target_writeup_id,
                fixture.target_team,
                "Old target writeup",
                fixture.now - Duration::hours(1),
            ),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO writeups (
                    id,challenge_id,team_id,body,state,created_at,updated_at
                ) VALUES ($1,$2,$3,$4,'draft',$5,$5)
                "#,
                id,
                history.challenge_id,
                team_id.0,
                body,
                updated_at,
            )
            .execute(pool)
            .await
            .expect("writeup");
        }
        let source_survey_id = Uuid::now_v7();
        for (id, team_id, submitted_at) in [
            (
                source_survey_id,
                fixture.source_team,
                fixture.now - Duration::hours(1),
            ),
            (history.target_survey_id, fixture.target_team, fixture.now),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO survey_responses (
                    id,challenge_id,team_id,answers,submitted_at
                ) VALUES ($1,$2,$3,'{"difficulty":4}',$4)
                "#,
                id,
                history.challenge_id,
                team_id.0,
                submitted_at,
            )
            .execute(pool)
            .await
            .expect("survey response");
        }
    }

    async fn seed_scoring_and_instance_history(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        for (sequence, team_id, points) in [
            (1_i64, fixture.source_team, 100_i64),
            (2_i64, fixture.target_team, 50_i64),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO score_entries (
                    event_id,sequence,team_id,points,reason,occurred_at
                ) VALUES ($1,$2,$3,$4,'{"adjustment":{"note":"history"}}',$5)
                "#,
                history.event_id,
                sequence,
                team_id.0,
                points,
                fixture.now,
            )
            .execute(pool)
            .await
            .expect("score entry");
        }
        sqlx::query!(
            r#"
            INSERT INTO instances (
                id,event_id,challenge_id,team_id,orchestrator,template,state,
                idempotency_key,expires_at,created_at,updated_at
            ) VALUES (
                $1,$2,$3,$4,'kubernetes','history-v1','deleted',$5,$6,$7,$7
            )
            "#,
            Uuid::now_v7(),
            history.event_id,
            history.challenge_id,
            fixture.source_team.0,
            Uuid::now_v7(),
            fixture.now,
            fixture.now - Duration::hours(1),
        )
        .execute(pool)
        .await
        .expect("historical instance");

        let role_id = Uuid::now_v7();
        sqlx::query!(
            r#"
            INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
            VALUES ($1,$2,'historian','Historian','{}',false)
            "#,
            role_id,
            fixture.organization_id.0,
        )
        .execute(pool)
        .await
        .expect("role");
        sqlx::query!(
            r#"
            INSERT INTO role_grants (
                id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            "#,
            Uuid::now_v7(),
            fixture.source_member.0,
            role_id,
            fixture.organization_id.0,
            history.event_id,
            fixture.source_team.0,
            fixture.actor.0,
            fixture.now,
        )
        .execute(pool)
        .await
        .expect("role grant");
    }

    async fn seed_attack_defense_history(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        for (team_id, digest, healthy) in [
            (fixture.source_team, vec![3_u8; 32], false),
            (fixture.target_team, vec![4_u8; 32], true),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO attack_defense_flags (
                    event_id,tick,service,team_id,flag_digest,expires_at
                ) VALUES ($1,1,'web',$2,$3,$4)
                "#,
                history.event_id,
                team_id.0,
                digest,
                fixture.now,
            )
            .execute(pool)
            .await
            .expect("attack-defense flag");
            sqlx::query!(
                r#"
                INSERT INTO checker_results (
                    event_id,tick,service,team_id,healthy,message,checked_at
                ) VALUES ($1,1,'web',$2,$3,'historical',$4)
                "#,
                history.event_id,
                team_id.0,
                healthy,
                fixture.now,
            )
            .execute(pool)
            .await
            .expect("checker result");
        }
    }

    async fn assert_source_team_is_absent(pool: &PgPool, source_team: TeamId) {
        let exists = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM teams WHERE id = $1) AS \"exists!\"",
            source_team.0,
        )
        .fetch_one(pool)
        .await
        .expect("team existence");
        assert!(!exists);

        let references = sqlx::query!(
            r#"
            SELECT
                (SELECT count(*) FROM team_members WHERE team_id = $1) AS "team_members!",
                (SELECT count(*) FROM event_participants WHERE team_id = $1) AS "participants!",
                (SELECT count(*) FROM audience_members WHERE team_id = $1) AS "audiences!",
                (SELECT count(*) FROM hint_unlocks WHERE team_id = $1) AS "hints!",
                (SELECT count(*) FROM submissions WHERE team_id = $1) AS "submissions!",
                (SELECT count(*) FROM challenge_solves WHERE team_id = $1) AS "solves!",
                (SELECT count(*) FROM writeups WHERE team_id = $1) AS "writeups!",
                (SELECT count(*) FROM survey_responses WHERE team_id = $1) AS "surveys!",
                (SELECT count(*) FROM score_entries WHERE team_id = $1) AS "scores!",
                (SELECT count(*) FROM instances WHERE team_id = $1) AS "instances!",
                (SELECT count(*) FROM attack_defense_flags WHERE team_id = $1) AS "flags!",
                (SELECT count(*) FROM checker_results WHERE team_id = $1) AS "checkers!",
                (SELECT count(*) FROM role_grants WHERE team_id = $1) AS "role_grants!"
            "#,
            source_team.0,
        )
        .fetch_one(pool)
        .await
        .expect("source reference counts");
        assert_eq!(references.team_members, 0);
        assert_eq!(references.participants, 0);
        assert_eq!(references.audiences, 0);
        assert_eq!(references.hints, 0);
        assert_eq!(references.submissions, 0);
        assert_eq!(references.solves, 0);
        assert_eq!(references.writeups, 0);
        assert_eq!(references.surveys, 0);
        assert_eq!(references.scores, 0);
        assert_eq!(references.instances, 0);
        assert_eq!(references.flags, 0);
        assert_eq!(references.checkers, 0);
        assert_eq!(references.role_grants, 0);
    }

    async fn assert_historical_ownership(
        pool: &PgPool,
        fixture: &TeamFixture,
        history: &HistoricalFixture,
    ) {
        let participant = sqlx::query!(
            r#"
            SELECT team_id,registered_at
            FROM event_participants
            WHERE event_id = $1
            "#,
            history.event_id,
        )
        .fetch_one(pool)
        .await
        .expect("merged event participant");
        assert_eq!(participant.team_id, Some(fixture.target_team.0));
        assert_eq!(participant.registered_at, fixture.now - Duration::hours(2));

        let solve = sqlx::query!(
            r#"
            SELECT team_id,submission_id
            FROM challenge_solves
            WHERE challenge_id = $1
            "#,
            history.challenge_id,
        )
        .fetch_one(pool)
        .await
        .expect("merged solve");
        assert_eq!(solve.team_id, Some(fixture.target_team.0));
        assert_eq!(solve.submission_id, history.source_submission_id);

        let writeup = sqlx::query!(
            "SELECT id,team_id FROM writeups WHERE challenge_id = $1",
            history.challenge_id,
        )
        .fetch_one(pool)
        .await
        .expect("merged writeup");
        assert_eq!(writeup.id, history.source_writeup_id);
        assert_eq!(writeup.team_id, Some(fixture.target_team.0));

        let survey = sqlx::query!(
            "SELECT id,team_id FROM survey_responses WHERE challenge_id = $1",
            history.challenge_id,
        )
        .fetch_one(pool)
        .await
        .expect("merged survey");
        assert_eq!(survey.id, history.target_survey_id);
        assert_eq!(survey.team_id, Some(fixture.target_team.0));

        let totals = sqlx::query!(
            r#"
            SELECT count(*) AS "entries!",sum(points)::bigint AS "points!"
            FROM score_entries
            WHERE event_id = $1 AND team_id = $2
            "#,
            history.event_id,
            fixture.target_team.0,
        )
        .fetch_one(pool)
        .await
        .expect("merged scores");
        assert_eq!(totals.entries, 2);
        assert_eq!(totals.points, 150);

        let target_checker = sqlx::query_scalar!(
            r#"
            SELECT healthy
            FROM checker_results
            WHERE event_id = $1 AND tick = 1 AND service = 'web' AND team_id = $2
            "#,
            history.event_id,
            fixture.target_team.0,
        )
        .fetch_one(pool)
        .await
        .expect("merged checker result");
        assert!(target_checker);
    }

    async fn assert_audit_and_outbox_count(pool: &PgPool, expected: i64) {
        let audit_count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM audit_log")
            .fetch_one(pool)
            .await
            .expect("audit count");
        let outbox_count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM event_outbox")
            .fetch_one(pool)
            .await
            .expect("outbox count");
        assert_eq!(audit_count, expected);
        assert_eq!(outbox_count, expected);
    }
}
