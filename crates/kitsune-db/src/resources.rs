//! Tenant-scoped event and challenge persistence.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{BracketId, ChallengeId, DivisionId, EventId, EventState, OrganizationId, UserId},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

/// Persisted event projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    /// Event ID.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// URL key.
    pub slug: String,
    /// Markdown description.
    pub description: String,
    /// Lifecycle key.
    pub state: String,
    /// Participation key.
    pub participation: String,
    /// Enabled modes.
    pub modes: Vec<String>,
    /// Optional opening instant.
    pub starts_at: Option<DateTime<Utc>>,
    /// Optional closing instant.
    pub ends_at: Option<DateTime<Utc>>,
    /// Team size ceiling.
    pub team_size_limit: Option<i16>,
    /// Freeze state.
    pub scoreboard_frozen: bool,
    /// Hidden-board state.
    pub scoreboard_hidden: bool,
}

/// Persisted event division projection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DivisionRecord {
    /// Division ID.
    pub id: Uuid,
    /// Parent event.
    pub event_id: Uuid,
    /// Display name.
    pub name: String,
    /// Stable scoreboard order.
    pub position: i32,
}

/// Persisted tournament bracket projection.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BracketRecord {
    /// Bracket ID.
    pub id: Uuid,
    /// Parent event.
    pub event_id: Uuid,
    /// Display name.
    pub name: String,
    /// Entrants advanced from this bracket.
    pub advancement_slots: i16,
}

/// Atomic division create/update data.
pub struct DivisionMutation<'a> {
    /// Tenant.
    pub organization_id: OrganizationId,
    /// Parent event.
    pub event_id: EventId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Division identifier.
    pub division_id: DivisionId,
    /// Validated display name.
    pub name: &'a str,
    /// Stable scoreboard order.
    pub position: i32,
    /// Mutation timestamp.
    pub now: DateTime<Utc>,
}

/// Atomic bracket create/update data.
pub struct BracketMutation<'a> {
    /// Tenant.
    pub organization_id: OrganizationId,
    /// Parent event.
    pub event_id: EventId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Bracket identifier.
    pub bracket_id: BracketId,
    /// Validated display name.
    pub name: &'a str,
    /// Entrants advanced from this bracket.
    pub advancement_slots: i16,
    /// Mutation timestamp.
    pub now: DateTime<Utc>,
}

/// Atomic event creation data.
pub struct NewEvent<'a> {
    /// ID.
    pub id: EventId,
    /// Tenant.
    pub organization_id: OrganizationId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Name.
    pub name: &'a str,
    /// Slug.
    pub slug: &'a str,
    /// Description.
    pub description: &'a str,
    /// Lifecycle.
    pub state: &'a str,
    /// Participation.
    pub participation: &'a str,
    /// Modes.
    pub modes: &'a [String],
    /// Start.
    pub starts_at: Option<DateTime<Utc>>,
    /// End.
    pub ends_at: Option<DateTime<Utc>>,
    /// Team cap.
    pub team_size_limit: Option<i16>,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// Persisted challenge projection. Answer rules are intentionally excluded.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChallengeRecord {
    /// Challenge ID.
    pub id: Uuid,
    /// Parent event.
    pub event_id: Uuid,
    /// Name.
    pub name: String,
    /// Category.
    pub category: String,
    /// Markdown content.
    pub description: String,
    /// Typed behavior JSON.
    pub kind: Value,
    /// Lifecycle key.
    pub state: String,
    /// Typed scoring JSON.
    pub scoring: Value,
    /// Typed visibility JSON.
    pub visibility: Value,
    /// Tags.
    pub tags: Vec<String>,
    /// Attempt ceiling.
    pub max_attempts: Option<i32>,
    /// Writeup switch.
    pub writeups_enabled: bool,
    /// Board order.
    pub position: i32,
    /// Survey definition.
    pub survey: Value,
}

/// Player context used to evaluate division and prerequisite visibility.
#[derive(Debug, Clone)]
pub struct ChallengeAccessContext {
    /// Registered division, if any.
    pub division_id: Option<Uuid>,
    /// Challenges solved directly or through any current team.
    pub solves: Vec<Uuid>,
}

/// Atomic challenge creation data.
pub struct NewChallenge<'a> {
    /// ID.
    pub id: ChallengeId,
    /// Parent event.
    pub event_id: EventId,
    /// Author.
    pub created_by: UserId,
    /// Name.
    pub name: &'a str,
    /// Category.
    pub category: &'a str,
    /// Description.
    pub description: &'a str,
    /// Behavior.
    pub kind: &'a Value,
    /// Lifecycle.
    pub state: &'a str,
    /// Scoring.
    pub scoring: &'a Value,
    /// Visibility.
    pub visibility: &'a Value,
    /// Tags.
    pub tags: &'a [String],
    /// Attempt cap.
    pub max_attempts: Option<i32>,
    /// Writeup switch.
    pub writeups_enabled: bool,
    /// Order.
    pub position: i32,
    /// Survey schema.
    pub survey: &'a Value,
    /// Serialized one-way answer rules.
    pub answers: &'a [Value],
    /// `(id, content, cost)` hints.
    pub hints: &'a [(i32, String, i64)],
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// PostgreSQL event/challenge repository.
#[derive(Debug, Clone)]
pub struct ResourceRepository {
    pool: PgPool,
}

impl ResourceRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Creates a tenant-scoped event.
    pub async fn create_event(
        &self,
        event: NewEvent<'_>,
    ) -> DomainResult<(EventRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            EventRecord,
            r#"
            INSERT INTO events (
                id,organization_id,name,slug,description,state,participation,modes,
                starts_at,ends_at,team_size_limit,config,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'{}',$12,$12)
            RETURNING id,name,slug,description,state,participation,modes,starts_at,
                      ends_at,team_size_limit,scoreboard_frozen,scoreboard_hidden
            "#,
            event.id.0,
            event.organization_id.0,
            event.name,
            event.slug,
            event.description,
            event.state,
            event.participation,
            event.modes,
            event.starts_at,
            event.ends_at,
            event.team_size_limit,
            event.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            event.organization_id,
            Some(event.id),
            Some(event.actor),
            Uuid::now_v7(),
            event.now,
            DomainEvent::EventChanged { event_id: event.id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "event.create",
            "event",
            &event.id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Lists events strictly inside one tenant.
    pub async fn events(&self, organization_id: OrganizationId) -> DomainResult<Vec<EventRecord>> {
        sqlx::query_as!(
            EventRecord,
            r#"
            SELECT id,name,slug,description,state,participation,modes,starts_at,ends_at,
                   team_size_limit,scoreboard_frozen,scoreboard_hidden
            FROM events WHERE organization_id = $1
            ORDER BY starts_at DESC NULLS FIRST, created_at DESC
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Applies a validated lifecycle transition and records it atomically.
    pub async fn set_event_state(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        next: EventState,
        now: DateTime<Utc>,
    ) -> DomainResult<(EventRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let current = sqlx::query_scalar!(
            "SELECT state FROM events WHERE id = $1 AND organization_id = $2 FOR UPDATE",
            event_id.0,
            organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        parse_event_state(&current)?.transition_to(next)?;
        let state = event_state_key(next);
        let row = sqlx::query_as!(
            EventRecord,
            r#"
            UPDATE events
            SET state = $3, updated_at = $4
            WHERE id = $1 AND organization_id = $2
            RETURNING id,name,slug,description,state,participation,modes,starts_at,
                      ends_at,team_size_limit,scoreboard_frozen,scoreboard_hidden
            "#,
            event_id.0,
            organization_id.0,
            state,
            now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        let envelope = EventEnvelope::new(
            organization_id,
            Some(event_id),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::EventChanged { event_id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "event.state.change",
            "event",
            &event_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Updates public scoreboard freeze and visibility controls atomically.
    pub async fn set_scoreboard_controls(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        frozen: bool,
        hidden: bool,
        now: DateTime<Utc>,
    ) -> DomainResult<(EventRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            EventRecord,
            r#"
            UPDATE events
            SET scoreboard_frozen = $3, scoreboard_hidden = $4, updated_at = $5
            WHERE id = $1 AND organization_id = $2
            RETURNING id,name,slug,description,state,participation,modes,starts_at,
                      ends_at,team_size_limit,scoreboard_frozen,scoreboard_hidden
            "#,
            event_id.0,
            organization_id.0,
            frozen,
            hidden,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let envelope = EventEnvelope::new(
            organization_id,
            Some(event_id),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::ScoreboardControlChanged { frozen, hidden },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "scoreboard.controls.change",
            "event",
            &event_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Confirms an event belongs to the calling tenant.
    pub async fn owns_event(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
    ) -> DomainResult<bool> {
        sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM events WHERE id = $1 AND organization_id = $2) AS \"exists!\"",
            event_id.0,
            organization_id.0,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Lists event divisions in stable scoreboard order.
    pub async fn divisions(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
    ) -> DomainResult<Vec<DivisionRecord>> {
        sqlx::query_as!(
            DivisionRecord,
            r#"
            SELECT d.id,d.event_id,d.name,d.position
            FROM divisions d
            JOIN events e ON e.id = d.event_id
            WHERE d.event_id = $1 AND e.organization_id = $2
            ORDER BY d.position,d.name,d.id
            "#,
            event_id.0,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Creates an event division and its audit/outbox event atomically.
    pub async fn create_division(
        &self,
        division: DivisionMutation<'_>,
    ) -> DomainResult<(DivisionRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_owned_event(&mut tx, division.organization_id, division.event_id).await?;
        let row = sqlx::query_as!(
            DivisionRecord,
            r#"
            INSERT INTO divisions (id,event_id,name,position)
            VALUES ($1,$2,$3,$4)
            RETURNING id,event_id,name,position
            "#,
            division.division_id.0,
            division.event_id.0,
            division.name,
            division.position,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            division.organization_id,
            Some(division.event_id),
            Some(division.actor),
            Uuid::now_v7(),
            division.now,
            DomainEvent::EventChanged {
                event_id: division.event_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "division.create",
            "division",
            &division.division_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Updates a tenant-owned event division.
    pub async fn update_division(
        &self,
        division: DivisionMutation<'_>,
    ) -> DomainResult<(DivisionRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            DivisionRecord,
            r#"
            UPDATE divisions d
            SET name = $4, position = $5
            FROM events e
            WHERE d.id = $1 AND d.event_id = $2
              AND e.id = d.event_id AND e.organization_id = $3
            RETURNING d.id,d.event_id,d.name,d.position
            "#,
            division.division_id.0,
            division.event_id.0,
            division.organization_id.0,
            division.name,
            division.position,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?
        .ok_or(DomainError::NotFound)?;
        let envelope = EventEnvelope::new(
            division.organization_id,
            Some(division.event_id),
            Some(division.actor),
            Uuid::now_v7(),
            division.now,
            DomainEvent::EventChanged {
                event_id: division.event_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "division.update",
            "division",
            &division.division_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Deletes an unassigned division without silently reclassifying entrants.
    pub async fn delete_division(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        division_id: DivisionId,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_owned_division(&mut tx, organization_id, event_id, division_id).await?;
        let assigned = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM event_participants WHERE division_id = $1) AS \"exists!\"",
            division_id.0,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if assigned {
            return Err(DomainError::Conflict(
                "division is assigned to one or more event entrants".into(),
            ));
        }
        sqlx::query!("DELETE FROM divisions WHERE id = $1", division_id.0)
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let envelope = EventEnvelope::new(
            organization_id,
            Some(event_id),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::EventChanged { event_id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "division.delete",
            "division",
            &division_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Lists event brackets in stable name order.
    pub async fn brackets(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
    ) -> DomainResult<Vec<BracketRecord>> {
        sqlx::query_as!(
            BracketRecord,
            r#"
            SELECT b.id,b.event_id,b.name,b.advancement_slots
            FROM brackets b
            JOIN events e ON e.id = b.event_id
            WHERE b.event_id = $1 AND e.organization_id = $2
            ORDER BY b.name,b.id
            "#,
            event_id.0,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Creates a tournament bracket and its audit/outbox event atomically.
    pub async fn create_bracket(
        &self,
        bracket: BracketMutation<'_>,
    ) -> DomainResult<(BracketRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_owned_event(&mut tx, bracket.organization_id, bracket.event_id).await?;
        let row = sqlx::query_as!(
            BracketRecord,
            r#"
            INSERT INTO brackets (id,event_id,name,advancement_slots)
            VALUES ($1,$2,$3,$4)
            RETURNING id,event_id,name,advancement_slots
            "#,
            bracket.bracket_id.0,
            bracket.event_id.0,
            bracket.name,
            bracket.advancement_slots,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            bracket.organization_id,
            Some(bracket.event_id),
            Some(bracket.actor),
            Uuid::now_v7(),
            bracket.now,
            DomainEvent::EventChanged {
                event_id: bracket.event_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "bracket.create",
            "bracket",
            &bracket.bracket_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Updates a tenant-owned tournament bracket.
    pub async fn update_bracket(
        &self,
        bracket: BracketMutation<'_>,
    ) -> DomainResult<(BracketRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query_as!(
            BracketRecord,
            r#"
            UPDATE brackets b
            SET name = $4, advancement_slots = $5
            FROM events e
            WHERE b.id = $1 AND b.event_id = $2
              AND e.id = b.event_id AND e.organization_id = $3
            RETURNING b.id,b.event_id,b.name,b.advancement_slots
            "#,
            bracket.bracket_id.0,
            bracket.event_id.0,
            bracket.organization_id.0,
            bracket.name,
            bracket.advancement_slots,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?
        .ok_or(DomainError::NotFound)?;
        let envelope = EventEnvelope::new(
            bracket.organization_id,
            Some(bracket.event_id),
            Some(bracket.actor),
            Uuid::now_v7(),
            bracket.now,
            DomainEvent::EventChanged {
                event_id: bracket.event_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "bracket.update",
            "bracket",
            &bracket.bracket_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Deletes an unassigned bracket without silently changing entrants.
    pub async fn delete_bracket(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        actor: UserId,
        bracket_id: BracketId,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_owned_bracket(&mut tx, organization_id, event_id, bracket_id).await?;
        let assigned = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM event_participants WHERE bracket_id = $1) AS \"exists!\"",
            bracket_id.0,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if assigned {
            return Err(DomainError::Conflict(
                "bracket is assigned to one or more event entrants".into(),
            ));
        }
        sqlx::query!("DELETE FROM brackets WHERE id = $1", bracket_id.0)
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let envelope = EventEnvelope::new(
            organization_id,
            Some(event_id),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::EventChanged { event_id },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "bracket.delete",
            "bracket",
            &bracket_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Creates a challenge, answers, and hints in one transaction.
    pub async fn create_challenge(
        &self,
        organization_id: OrganizationId,
        challenge: NewChallenge<'_>,
    ) -> DomainResult<(ChallengeRecord, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let owns = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM events WHERE id = $1 AND organization_id = $2) AS \"exists!\"",
            challenge.event_id.0,
            organization_id.0,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if !owns {
            return Err(DomainError::NotFound);
        }
        let row = sqlx::query_as!(
            ChallengeRecord,
            r#"
            INSERT INTO challenges (
                id,event_id,name,category,description,kind,state,scoring,visibility,
                tags,max_attempts,writeups_enabled,position,created_by,created_at,
                updated_at,survey
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16)
            RETURNING id,event_id,name,category,description,kind,state,scoring,
                      visibility,tags,max_attempts,writeups_enabled,position,survey
            "#,
            challenge.id.0,
            challenge.event_id.0,
            challenge.name,
            challenge.category,
            challenge.description,
            challenge.kind,
            challenge.state,
            challenge.scoring,
            challenge.visibility,
            challenge.tags,
            challenge.max_attempts,
            challenge.writeups_enabled,
            challenge.position,
            challenge.created_by.0,
            challenge.now,
            challenge.survey,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        for (position, rule) in challenge.answers.iter().enumerate() {
            let position = i32::try_from(position)
                .map_err(|_| DomainError::LimitExceeded("answer rules".into()))?;
            sqlx::query!(
                "INSERT INTO challenge_answers (id,challenge_id,rule,position) VALUES ($1,$2,$3,$4)",
                Uuid::now_v7(),
                challenge.id.0,
                rule,
                position,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }
        for (id, content, cost) in challenge.hints {
            sqlx::query!(
                "INSERT INTO challenge_hints (challenge_id,id,content,cost) VALUES ($1,$2,$3,$4)",
                challenge.id.0,
                id,
                content,
                cost,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }
        let envelope = EventEnvelope::new(
            organization_id,
            Some(challenge.event_id),
            Some(challenge.created_by),
            Uuid::now_v7(),
            challenge.now,
            DomainEvent::ChallengeChanged {
                challenge_id: challenge.id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "challenge.create",
            "challenge",
            &challenge.id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((row, envelope))
    }

    /// Lists challenges with player-safe projections. Non-managers only see
    /// published or scheduled rows whose time window currently permits access.
    pub async fn challenges(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        include_unpublished: bool,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<ChallengeRecord>> {
        sqlx::query_as!(
            ChallengeRecord,
            r#"
            SELECT c.id,c.event_id,c.name,c.category,c.description,c.kind,c.state,
                   c.scoring,c.visibility,c.tags,c.max_attempts,c.writeups_enabled,
                   c.position,c.survey
            FROM challenges c
            JOIN events e ON e.id = c.event_id
            WHERE c.event_id = $1 AND e.organization_id = $2
              AND ($3 OR (
                c.state IN ('published','scheduled')
                AND (c.visibility->>'visible_from' IS NULL OR (c.visibility->>'visible_from')::timestamptz <= $4)
                AND (c.visibility->>'visible_until' IS NULL OR (c.visibility->>'visible_until')::timestamptz > $4)
              ))
            ORDER BY c.category,c.position,c.created_at
            "#,
            event_id.0,
            organization_id.0,
            include_unpublished,
            now,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Loads player visibility facts without exposing answer material.
    pub async fn challenge_access_context(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        user_id: UserId,
    ) -> DomainResult<ChallengeAccessContext> {
        let division_id = sqlx::query_scalar!(
            r#"
            SELECT ep.division_id
            FROM event_participants ep
            JOIN events e ON e.id = ep.event_id
            LEFT JOIN team_members tm ON tm.team_id = ep.team_id
            WHERE ep.event_id = $1 AND e.organization_id = $2
              AND (ep.user_id = $3 OR tm.user_id = $3)
            ORDER BY ep.registered_at
            LIMIT 1
            "#,
            event_id.0,
            organization_id.0,
            user_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .flatten();
        let solves = sqlx::query_scalar!(
            r#"
            SELECT DISTINCT cs.challenge_id
            FROM challenge_solves cs
            JOIN challenges c ON c.id = cs.challenge_id
            JOIN events e ON e.id = c.event_id
            LEFT JOIN team_members tm ON tm.team_id = cs.team_id
            WHERE c.event_id = $1 AND e.organization_id = $2
              AND (cs.user_id = $3 OR tm.user_id = $3)
            "#,
            event_id.0,
            organization_id.0,
            user_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(ChallengeAccessContext {
            division_id,
            solves,
        })
    }
}

async fn lock_owned_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    organization_id: OrganizationId,
    event_id: EventId,
) -> DomainResult<()> {
    sqlx::query_scalar!(
        "SELECT id FROM events WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        event_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(())
}

async fn lock_owned_division(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    organization_id: OrganizationId,
    event_id: EventId,
    division_id: DivisionId,
) -> DomainResult<()> {
    sqlx::query_scalar!(
        r#"
        SELECT d.id
        FROM divisions d
        JOIN events e ON e.id = d.event_id
        WHERE d.id = $1 AND d.event_id = $2 AND e.organization_id = $3
        FOR UPDATE OF d
        "#,
        division_id.0,
        event_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(())
}

async fn lock_owned_bracket(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    organization_id: OrganizationId,
    event_id: EventId,
    bracket_id: BracketId,
) -> DomainResult<()> {
    sqlx::query_scalar!(
        r#"
        SELECT b.id
        FROM brackets b
        JOIN events e ON e.id = b.event_id
        WHERE b.id = $1 AND b.event_id = $2 AND e.organization_id = $3
        FOR UPDATE OF b
        "#,
        bracket_id.0,
        event_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(())
}

pub(crate) async fn persist_audit_event(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    envelope: &EventEnvelope,
    action: &str,
    resource_type: &str,
    resource_id: &str,
) -> DomainResult<()> {
    let organization_id = envelope
        .organization_id
        .ok_or_else(|| DomainError::Validation("tenant event requires organization".into()))?;
    let serialized = serde_json::to_value(envelope)
        .map_err(|error| DomainError::Validation(error.to_string()))?;
    sqlx::query!(
        r#"
        INSERT INTO event_outbox (
            id,organization_id,event_id,kind,envelope,occurred_at,created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$6)
        "#,
        envelope.id,
        organization_id.0,
        envelope.event_id.map(|id| id.0),
        envelope.kind(),
        serialized,
        envelope.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,resource_id,
            metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'{}',$8,$9)
        "#,
        Uuid::now_v7(),
        organization_id.0,
        envelope.event_id.map(|id| id.0),
        envelope.actor_id.map(|id| id.0),
        action,
        resource_type,
        resource_id,
        envelope.correlation_id,
        envelope.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres resources: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("resource key already exists".into())
    } else {
        unavailable(error)
    }
}

fn parse_event_state(value: &str) -> DomainResult<EventState> {
    match value {
        "draft" => Ok(EventState::Draft),
        "scheduled" => Ok(EventState::Scheduled),
        "live" => Ok(EventState::Live),
        "paused" => Ok(EventState::Paused),
        "ended" => Ok(EventState::Ended),
        "archived" => Ok(EventState::Archived),
        _ => Err(DomainError::Unavailable(
            "postgres event contains an invalid lifecycle state".into(),
        )),
    }
}

const fn event_state_key(value: EventState) -> &'static str {
    match value {
        EventState::Draft => "draft",
        EventState::Scheduled => "scheduled",
        EventState::Live => "live",
        EventState::Paused => "paused",
        EventState::Ended => "ended",
        EventState::Archived => "archived",
    }
}
