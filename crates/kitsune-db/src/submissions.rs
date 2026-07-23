//! Atomic challenge submissions and public scoreboard projections.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    challenge::{
        AnswerOutcome, AnswerRule, ChallengeKind, VisibilityRule, validate_answer_contract,
    },
    events::{DomainEvent, SubmissionOutcome},
    identity::{ChallengeId, DivisionId, EventId, OrganizationId, SubmissionId, TeamId, UserId},
    scoring::{CompetitorId, ScoreReason, ScoringRule, ScoringStrategy},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::resources::persist_audit_event;

const DEFAULT_FIRST_BLOOD_BONUS: i64 = 50;

/// Immutable submission receipt safe for a player response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionRecord {
    /// Submission identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// Stable result key.
    pub outcome: String,
    /// Total points awarded by this submission.
    pub awarded_points: i64,
    /// Whether this solve was the first accepted solve.
    pub first_blood: bool,
    /// Remaining incorrect attempts when a limit exists.
    pub attempts_remaining: Option<i32>,
    /// Authoritative receipt time.
    pub submitted_at: DateTime<Utc>,
}

/// Submission command passed into the transactional repository.
pub struct NewSubmission<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Challenge target.
    pub challenge_id: ChallengeId,
    /// Authenticated user who supplied the answer.
    pub actor: UserId,
    /// Current server-side session.
    pub session_id: Uuid,
    /// Client-generated retry key.
    pub idempotency_key: Uuid,
    /// Plaintext answer, retained only for this transaction.
    pub answer: &'a str,
    /// Authenticated-encrypted answer retained only for manual review outcomes.
    pub sealed_answer: &'a [u8],
    /// Optional process-local attestation produced by the bounded plugin host.
    pub plugin_verification: Option<&'a VerifiedPluginAnswer<'a>>,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// Identity and retry key sufficient to replay a safe immutable receipt.
pub struct SubmissionReplayKey<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Challenge target.
    pub challenge_id: ChallengeId,
    /// Authenticated retrying actor.
    pub actor: UserId,
    /// Original client-generated key.
    pub idempotency_key: Uuid,
    /// Exact answer payload originally submitted with the key.
    pub answer: &'a str,
}

/// Plugin verifier inputs read before executing untrusted component code.
#[derive(Debug, Clone)]
pub struct PluginVerificationContext {
    /// Installed plugin name.
    pub plugin: String,
    /// Registered challenge kind.
    pub kind: String,
    /// Organizer-authored bounded plugin configuration.
    pub config: serde_json::Value,
    /// Challenge revision bound to the verifier result.
    pub challenge_updated_at: DateTime<Utc>,
    /// Resolved competitor kind under the event participation policy.
    pub competitor_kind: &'static str,
    /// Resolved competitor identifier under the event participation policy.
    pub competitor_id: Uuid,
}

/// Narrow decision returned by a plugin verifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PluginAnswerDecision {
    /// Reject the answer.
    Incorrect,
    /// Accept the answer.
    Correct,
}

/// Process-local verifier attestation checked again under the challenge lock.
pub struct VerifiedPluginAnswer<'a> {
    /// Plugin name read from the challenge before invocation.
    pub plugin: &'a str,
    /// Plugin challenge kind read before invocation.
    pub kind: &'a str,
    /// Challenge revision that supplied plugin configuration.
    pub challenge_updated_at: DateTime<Utc>,
    /// Digest of the exact normalized answer passed to the component.
    pub answer_digest: [u8; 32],
    /// Component decision.
    pub decision: PluginAnswerDecision,
}

#[derive(Clone, Copy)]
struct GameplayScope {
    organization_id: OrganizationId,
    event_id: EventId,
    challenge_id: ChallengeId,
    actor: UserId,
    now: DateTime<Utc>,
}

#[derive(Clone, Copy)]
struct SolveContext {
    organization_id: OrganizationId,
    event_id: EventId,
    challenge_id: ChallengeId,
    actor: UserId,
    correlation_id: Uuid,
    now: DateTime<Utc>,
}

impl SolveContext {
    const fn gameplay_scope(self) -> GameplayScope {
        GameplayScope {
            organization_id: self.organization_id,
            event_id: self.event_id,
            challenge_id: self.challenge_id,
            actor: self.actor,
            now: self.now,
        }
    }
}

impl NewSubmission<'_> {
    const fn gameplay_scope(&self) -> GameplayScope {
        GameplayScope {
            organization_id: self.organization_id,
            event_id: self.event_id,
            challenge_id: self.challenge_id,
            actor: self.actor,
            now: self.now,
        }
    }

    const fn solve_context(&self) -> SolveContext {
        SolveContext {
            organization_id: self.organization_id,
            event_id: self.event_id,
            challenge_id: self.challenge_id,
            actor: self.actor,
            correlation_id: self.idempotency_key,
            now: self.now,
        }
    }
}

/// Repository result including fresh events that need immediate publication.
pub struct SubmissionResult {
    /// Stable receipt.
    pub record: SubmissionRecord,
    /// Empty for an idempotent replay.
    pub events: Vec<EventEnvelope>,
    /// Whether the receipt came from an earlier request.
    pub replayed: bool,
}

/// One ranked competitor row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreboardRowRecord {
    /// User or team.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Total visible score.
    pub score: i64,
    /// Number of accepted challenge solves.
    pub solves: i64,
    /// Tie-break instant.
    pub reached_at: DateTime<Utc>,
}

/// Event scoreboard controls and rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreboardRecord {
    /// Organizer-controlled hidden state.
    pub hidden: bool,
    /// Whether post-freeze entries are currently concealed from players.
    pub frozen: bool,
    /// Ordered standings. Empty while a public board is hidden.
    pub rows: Vec<ScoreboardRowRecord>,
}

/// One append-only point in a competitor score history.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreHistoryPointRecord {
    /// Global score-ledger sequence.
    pub sequence: i64,
    /// Running visible score after this entry.
    pub score: i64,
    /// Entry timestamp.
    pub occurred_at: DateTime<Utc>,
}

/// One competitor's ordered historical score series.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreHistorySeriesRecord {
    /// `user` or `team`.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Public display name.
    pub name: String,
    /// Ordered running totals.
    pub points: Vec<ScoreHistoryPointRecord>,
}

/// Event score history with the same concealment controls as the leaderboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreHistoryRecord {
    /// Organizer has hidden the public board.
    pub hidden: bool,
    /// Post-freeze entries are concealed from players.
    pub frozen: bool,
    /// Competitor series.
    pub series: Vec<ScoreHistorySeriesRecord>,
}

/// Player-safe hint state. Content is absent until the competitor unlocks it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HintRecord {
    /// Challenge-local hint identifier.
    pub id: u32,
    /// One-time score cost.
    pub cost: i64,
    /// Revealed content.
    pub content: Option<String>,
    /// Competitor unlock state.
    pub unlocked: bool,
}

/// Hint unlock command.
pub struct NewHintUnlock {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Challenge target.
    pub challenge_id: ChallengeId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Challenge-local hint key.
    pub hint_id: u32,
    /// Correlation ID for audit and events.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

impl NewHintUnlock {
    const fn gameplay_scope(&self) -> GameplayScope {
        GameplayScope {
            organization_id: self.organization_id,
            event_id: self.event_id,
            challenge_id: self.challenge_id,
            actor: self.actor,
            now: self.now,
        }
    }
}

/// Transactional hint unlock result.
pub struct HintUnlockResult {
    /// Revealed hint.
    pub hint: HintRecord,
    /// Positive score cost charged by this request; zero for a replay.
    pub charged: i64,
    /// Fresh events for immediate publication.
    pub events: Vec<EventEnvelope>,
    /// Whether the competitor had already unlocked this hint.
    pub replayed: bool,
}

/// Organizer-safe encrypted manual review queue record.
#[derive(Debug, Clone)]
pub struct ManualReviewRecord {
    /// Submission identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// Challenge display name.
    pub challenge_name: String,
    /// `user` or `team`.
    pub competitor_kind: String,
    /// Competitor identifier.
    pub competitor_id: Uuid,
    /// Competitor display name.
    pub competitor_name: String,
    /// Authenticated-encrypted evidence for API-bound decryption.
    pub answer_ciphertext: Vec<u8>,
    /// Submission timestamp.
    pub submitted_at: DateTime<Utc>,
}

/// Organizer decision for a pending manual submission.
pub struct NewManualReview<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Pending submission target.
    pub submission_id: SubmissionId,
    /// Authenticated reviewer.
    pub reviewer: UserId,
    /// Accept and score when true; discard when false.
    pub accepted: bool,
    /// Optional safe reviewer note.
    pub note: Option<&'a str>,
    /// Correlation ID.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// PostgreSQL submission and scoreboard repository.
#[derive(Debug, Clone)]
pub struct SubmissionRepository {
    pool: PgPool,
}

impl SubmissionRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns an existing immutable receipt before any external verifier work.
    pub async fn replay(
        &self,
        key: &SubmissionReplayKey<'_>,
    ) -> DomainResult<Option<SubmissionResult>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let record = replayed_submission_by_key(&mut tx, key).await?;
        tx.rollback().await.map_err(unavailable)?;
        Ok(record.map(|record| SubmissionResult {
            record,
            events: Vec::new(),
            replayed: true,
        }))
    }

    /// Loads the immutable plugin selector/configuration used for one bounded
    /// verifier call. The submission transaction rechecks its revision.
    pub async fn plugin_verification_context(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        challenge_id: ChallengeId,
        actor: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<Option<PluginVerificationContext>> {
        let scope = GameplayScope {
            organization_id,
            event_id,
            challenge_id,
            actor,
            now,
        };
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let challenge = read_challenge(&mut tx, scope).await?;
        validate_event_window(&challenge, now)?;
        let competitor = resolve_competitor(&mut tx, scope, &challenge).await?;
        validate_challenge_visibility(&mut tx, scope, competitor, &challenge).await?;
        if competitor_has_solved(&mut tx, challenge_id, competitor).await? {
            return Err(DomainError::Conflict("challenge is already solved".into()));
        }
        let failed_attempts = failed_attempts(&mut tx, challenge_id, competitor).await?;
        remaining_attempts(challenge.max_attempts, failed_attempts)?;
        let kind = serde_json::from_value::<ChallengeKind>(challenge.kind)
            .map_err(|error| DomainError::Unavailable(format!("stored challenge type: {error}")))?;
        let (competitor_kind, competitor_id) = competitor_identity(competitor);
        let result = match kind {
            ChallengeKind::Plugin {
                plugin,
                kind,
                config,
            } => Some(PluginVerificationContext {
                plugin,
                kind,
                config,
                challenge_updated_at: challenge.updated_at,
                competitor_kind,
                competitor_id,
            }),
            _ => None,
        };
        tx.rollback().await.map_err(unavailable)?;
        Ok(result)
    }

    /// Validates and records an answer, solve, score changes, audit records,
    /// and outbox events in one transaction.
    pub async fn submit(&self, command: NewSubmission<'_>) -> DomainResult<SubmissionResult> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        if let Some(record) = replayed_submission(&mut tx, &command).await? {
            tx.rollback().await.map_err(unavailable)?;
            return Ok(SubmissionResult {
                record,
                events: Vec::new(),
                replayed: true,
            });
        }

        let scope = command.gameplay_scope();
        let challenge = lock_challenge(&mut tx, scope).await?;
        // A concurrent retry may have committed while this transaction waited
        // for the challenge lock. Recheck before performing any state change.
        if let Some(record) = replayed_submission(&mut tx, &command).await? {
            tx.rollback().await.map_err(unavailable)?;
            return Ok(SubmissionResult {
                record,
                events: Vec::new(),
                replayed: true,
            });
        }
        validate_event_window(&challenge, command.now)?;
        let competitor = resolve_competitor(&mut tx, scope, &challenge).await?;
        register_competitor(&mut tx, scope, competitor).await?;
        validate_challenge_visibility(&mut tx, scope, competitor, &challenge).await?;

        if competitor_has_solved(&mut tx, command.challenge_id, competitor).await? {
            return Err(DomainError::Conflict("challenge is already solved".into()));
        }

        let failed_attempts = failed_attempts(&mut tx, command.challenge_id, competitor).await?;
        let attempts_remaining = remaining_attempts(challenge.max_attempts, failed_attempts)?;
        let answer_rules = load_answer_rules(&mut tx, command.challenge_id).await?;
        let outcome = evaluate_answer(
            &mut tx,
            scope,
            competitor,
            &challenge,
            &answer_rules,
            command.answer,
            command.plugin_verification,
        )
        .await?;
        if outcome == SubmissionOutcome::Pending
            && competitor_has_pending(&mut tx, command.challenge_id, competitor).await?
        {
            return Err(DomainError::Conflict(
                "a manual submission is already awaiting review".into(),
            ));
        }
        let answer_digest = Sha256::digest(command.answer.trim().as_bytes());
        let submission_id = SubmissionId::new();

        let mut awarded_points = 0;
        let mut first_blood = false;
        let mut final_attempts_remaining = attempts_remaining;
        if outcome == SubmissionOutcome::Incorrect {
            final_attempts_remaining = attempts_remaining.map(|remaining| remaining - 1);
        }

        insert_submission(
            &mut tx,
            &command,
            competitor,
            submission_id,
            outcome,
            answer_digest.as_slice(),
            final_attempts_remaining,
        )
        .await?;

        let mut events = Vec::new();
        let received = submission_event(&command, submission_id, competitor, outcome);
        persist_audit_event(
            &mut tx,
            &received,
            "submission.create",
            "submission",
            &submission_id.to_string(),
        )
        .await?;
        events.push(received);

        if outcome == SubmissionOutcome::Correct {
            let solve = award_solve(
                &mut tx,
                command.solve_context(),
                &challenge,
                submission_id,
                competitor,
            )
            .await?;
            awarded_points = solve.awarded_points;
            first_blood = solve.first_blood;
            events.extend(solve.events);
            sqlx::query!(
                r#"
                UPDATE submissions
                SET awarded_points = $2, first_blood = $3
                WHERE id = $1
                "#,
                submission_id.0,
                awarded_points,
                first_blood,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }

        tx.commit().await.map_err(unavailable)?;
        Ok(SubmissionResult {
            record: SubmissionRecord {
                id: submission_id.0,
                challenge_id: command.challenge_id.0,
                outcome: outcome_key(outcome).to_owned(),
                awarded_points,
                first_blood,
                attempts_remaining: final_attempts_remaining,
                submitted_at: command.now,
            },
            events,
            replayed: false,
        })
    }

    /// Returns a tenant-scoped public or organizer scoreboard.
    pub async fn scoreboard(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        division_id: Option<DivisionId>,
        organizer: bool,
    ) -> DomainResult<ScoreboardRecord> {
        let controls = scoreboard_controls(&self.pool, organization_id, event_id).await?;
        if controls.hidden && !organizer {
            return Ok(ScoreboardRecord {
                hidden: true,
                frozen: controls.frozen,
                rows: Vec::new(),
            });
        }
        let rows = sqlx::query_as!(
            ScoreboardRowRecord,
            r#"
            SELECT
                CASE WHEN se.team_id IS NULL THEN 'user' ELSE 'team' END AS "competitor_kind!",
                COALESCE(se.team_id, se.user_id) AS "competitor_id!",
                COALESCE(t.name, u.display_name) AS "name!",
                SUM(se.points)::bigint AS "score!",
                COUNT(*) FILTER (WHERE se.reason ? 'solve')::bigint AS "solves!",
                MAX(se.occurred_at) AS "reached_at!"
            FROM score_entries se
            LEFT JOIN teams t ON t.id = se.team_id
            LEFT JOIN users u ON u.id = se.user_id
            WHERE se.event_id = $1
              AND ($2 OR NOT se.hidden_by_freeze)
              AND ($3::uuid IS NULL OR se.division_id = $3)
              AND NOT (se.reason ? 'reversal')
              AND NOT EXISTS (
                  SELECT 1 FROM score_entries reversal
                  WHERE reversal.event_id = se.event_id
                    AND reversal.reason->'reversal'->>'entry_sequence' = se.sequence::text
              )
            GROUP BY se.team_id,se.user_id,t.name,u.display_name
            ORDER BY SUM(se.points) DESC,MAX(se.occurred_at),COALESCE(se.team_id, se.user_id)
            "#,
            event_id.0,
            organizer || !controls.frozen,
            division_id.map(|id| id.0),
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(ScoreboardRecord {
            hidden: controls.hidden,
            frozen: controls.frozen,
            rows,
        })
    }

    /// Returns append-only score histories under scoreboard concealment rules.
    pub async fn score_history(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        division_id: Option<DivisionId>,
        organizer: bool,
        series_limit: i64,
    ) -> DomainResult<ScoreHistoryRecord> {
        let controls = scoreboard_controls(&self.pool, organization_id, event_id).await?;
        if controls.hidden && !organizer {
            return Ok(ScoreHistoryRecord {
                hidden: true,
                frozen: controls.frozen,
                series: Vec::new(),
            });
        }
        let rows = sqlx::query!(
            r#"
            WITH eligible AS (
                SELECT se.*
                FROM score_entries se
                WHERE se.event_id = $1
                  AND ($2 OR NOT se.hidden_by_freeze)
                  AND ($3::uuid IS NULL OR se.division_id = $3)
                  AND NOT (se.reason ? 'reversal')
                  AND NOT EXISTS (
                      SELECT 1 FROM score_entries reversal
                      WHERE reversal.event_id = se.event_id
                        AND reversal.reason->'reversal'->>'entry_sequence' = se.sequence::text
                  )
            ), leaders AS (
                SELECT team_id,user_id
                FROM eligible
                GROUP BY team_id,user_id
                ORDER BY SUM(points) DESC,MAX(occurred_at),COALESCE(team_id,user_id)
                LIMIT $4
            )
            SELECT
                se.sequence,
                CASE WHEN se.team_id IS NULL THEN 'user' ELSE 'team' END AS "competitor_kind!",
                COALESCE(se.team_id,se.user_id) AS "competitor_id!",
                COALESCE(t.name,u.display_name) AS "name!",
                SUM(se.points) OVER (
                    PARTITION BY se.team_id,se.user_id
                    ORDER BY se.sequence
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                )::bigint AS "score!",
                se.occurred_at
            FROM eligible se
            JOIN leaders leader
              ON leader.team_id IS NOT DISTINCT FROM se.team_id
             AND leader.user_id IS NOT DISTINCT FROM se.user_id
            LEFT JOIN teams t ON t.id = se.team_id
            LEFT JOIN users u ON u.id = se.user_id
            ORDER BY se.sequence
            "#,
            event_id.0,
            organizer || !controls.frozen,
            division_id.map(|id| id.0),
            series_limit,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        let mut grouped = BTreeMap::<(String, Uuid, String), Vec<ScoreHistoryPointRecord>>::new();
        for row in rows {
            grouped
                .entry((row.competitor_kind, row.competitor_id, row.name))
                .or_default()
                .push(ScoreHistoryPointRecord {
                    sequence: row.sequence,
                    score: row.score,
                    occurred_at: row.occurred_at,
                });
        }
        let mut series = grouped
            .into_iter()
            .map(
                |((competitor_kind, competitor_id, name), points)| ScoreHistorySeriesRecord {
                    competitor_kind,
                    competitor_id,
                    name,
                    points,
                },
            )
            .collect::<Vec<_>>();
        series.sort_by(|left, right| {
            let left_score = left.points.last().map_or(0, |point| point.score);
            let right_score = right.points.last().map_or(0, |point| point.score);
            right_score
                .cmp(&left_score)
                .then_with(|| left.name.cmp(&right.name))
                .then_with(|| left.competitor_id.cmp(&right.competitor_id))
        });
        Ok(ScoreHistoryRecord {
            hidden: controls.hidden,
            frozen: controls.frozen,
            series,
        })
    }

    /// Lists hints without disclosing locked content.
    pub async fn hints(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        challenge_id: ChallengeId,
        actor: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<HintRecord>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let scope = GameplayScope {
            organization_id,
            event_id,
            challenge_id,
            actor,
            now,
        };
        let challenge = read_challenge(&mut tx, scope).await?;
        let competitor = resolve_competitor(&mut tx, scope, &challenge).await?;
        validate_challenge_visibility(&mut tx, scope, competitor, &challenge).await?;
        let rows = hint_records(&mut tx, challenge_id, competitor).await?;
        tx.rollback().await.map_err(unavailable)?;
        Ok(rows)
    }

    /// Reveals one hint exactly once per competitor and appends its score cost.
    pub async fn unlock_hint(&self, command: NewHintUnlock) -> DomainResult<HintUnlockResult> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let scope = command.gameplay_scope();
        let challenge = lock_challenge(&mut tx, scope).await?;
        validate_event_window(&challenge, command.now)?;
        let competitor = resolve_competitor(&mut tx, scope, &challenge).await?;
        register_competitor(&mut tx, scope, competitor).await?;
        validate_challenge_visibility(&mut tx, scope, competitor, &challenge).await?;

        let hint_id = i32::try_from(command.hint_id)
            .map_err(|_| DomainError::Validation("hint identifier is too large".into()))?;
        let hint = sqlx::query!(
            r#"
            SELECT content,cost FROM challenge_hints
            WHERE challenge_id = $1 AND id = $2
            FOR UPDATE
            "#,
            command.challenge_id.0,
            hint_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let (user_id, team_id) = competitor_columns(competitor);
        let already_unlocked = sqlx::query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM hint_unlocks
                WHERE challenge_id = $1 AND hint_id = $2
                  AND user_id IS NOT DISTINCT FROM $3
                  AND team_id IS NOT DISTINCT FROM $4
            ) AS "exists!"
            "#,
            command.challenge_id.0,
            hint_id,
            user_id,
            team_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if already_unlocked {
            tx.rollback().await.map_err(unavailable)?;
            return Ok(HintUnlockResult {
                hint: HintRecord {
                    id: command.hint_id,
                    cost: hint.cost,
                    content: Some(hint.content),
                    unlocked: true,
                },
                charged: 0,
                events: Vec::new(),
                replayed: true,
            });
        }

        sqlx::query!(
            r#"
            INSERT INTO hint_unlocks (
                challenge_id,hint_id,user_id,team_id,unlocked_at
            ) VALUES ($1,$2,$3,$4,$5)
            "#,
            command.challenge_id.0,
            hint_id,
            user_id,
            team_id,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;

        let hint_event = EventEnvelope::new(
            command.organization_id,
            Some(command.event_id),
            Some(command.actor),
            command.correlation_id,
            command.now,
            DomainEvent::HintUnlocked {
                challenge_id: command.challenge_id,
                hint_id: command.hint_id,
                competitor,
            },
        );
        persist_audit_event(
            &mut tx,
            &hint_event,
            "challenge.hint.unlock",
            "challenge_hint",
            &format!("{}:{}", command.challenge_id, command.hint_id),
        )
        .await?;
        let mut events = vec![hint_event];
        if hint.cost > 0 {
            let division_id = participant_division(&mut tx, command.event_id, competitor).await?;
            let sequence = next_score_sequence(&mut tx).await?;
            let reason = serde_json::to_value(ScoreReason::Hint {
                challenge_id: command.challenge_id,
                hint_id: command.hint_id,
            })
            .map_err(serialization_error)?;
            insert_score_entry(
                &mut tx,
                scope,
                competitor,
                division_id,
                sequence,
                -hint.cost,
                &reason,
                challenge.scoreboard_frozen,
            )
            .await?;
            let score_event = EventEnvelope::new(
                command.organization_id,
                Some(command.event_id),
                Some(command.actor),
                command.correlation_id,
                command.now,
                DomainEvent::ScoreChanged {
                    competitor,
                    delta: -hint.cost,
                },
            );
            persist_audit_event(
                &mut tx,
                &score_event,
                "score.hint_cost",
                "score_entry",
                &sequence.to_string(),
            )
            .await?;
            events.push(score_event);
        }
        tx.commit().await.map_err(unavailable)?;
        Ok(HintUnlockResult {
            hint: HintRecord {
                id: command.hint_id,
                cost: hint.cost,
                content: Some(hint.content),
                unlocked: true,
            },
            charged: hint.cost,
            events,
            replayed: false,
        })
    }

    /// Lists pending manual submissions with encrypted evidence.
    pub async fn manual_review_queue(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
    ) -> DomainResult<Vec<ManualReviewRecord>> {
        let rows = sqlx::query!(
            r#"
            SELECT s.id,s.challenge_id,c.name AS challenge_name,s.user_id,s.team_id,
                   COALESCE(t.name,u.display_name) AS "competitor_name!",
                   s.answer_ciphertext,s.submitted_at
            FROM submissions s
            JOIN challenges c ON c.id = s.challenge_id
            JOIN events e ON e.id = s.event_id
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN teams t ON t.id = s.team_id
            WHERE e.organization_id = $1 AND e.id = $2 AND s.outcome = 'pending'
              AND s.answer_ciphertext IS NOT NULL
            ORDER BY s.submitted_at,s.id
            "#,
            organization_id.0,
            event_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        rows.into_iter()
            .map(|row| {
                let (competitor_kind, competitor_id) =
                    review_competitor_identity(row.user_id, row.team_id, "manual submission")?;
                Ok(ManualReviewRecord {
                    id: row.id,
                    challenge_id: row.challenge_id.ok_or_else(|| {
                        DomainError::Unavailable("manual submission lost its challenge".into())
                    })?,
                    challenge_name: row.challenge_name,
                    competitor_kind,
                    competitor_id,
                    competitor_name: row.competitor_name,
                    answer_ciphertext: row.answer_ciphertext.ok_or_else(|| {
                        DomainError::Unavailable("manual submission lost its evidence".into())
                    })?,
                    submitted_at: row.submitted_at,
                })
            })
            .collect()
    }

    /// Accepts or discards one pending submission in the scoring transaction.
    pub async fn review_manual_submission(
        &self,
        command: NewManualReview<'_>,
    ) -> DomainResult<SubmissionResult> {
        let note = command
            .note
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if note.is_some_and(|value| value.len() > 10_000) {
            return Err(DomainError::Validation(
                "manual review note cannot exceed 10000 bytes".into(),
            ));
        }
        let challenge_id = sqlx::query_scalar!(
            r#"
            SELECT s.challenge_id
            FROM submissions s
            JOIN events e ON e.id = s.event_id
            WHERE s.id = $1 AND e.id = $2 AND e.organization_id = $3
            "#,
            command.submission_id.0,
            command.event_id.0,
            command.organization_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .flatten()
        .map(ChallengeId)
        .ok_or(DomainError::NotFound)?;
        let scope = GameplayScope {
            organization_id: command.organization_id,
            event_id: command.event_id,
            challenge_id,
            actor: command.reviewer,
            now: command.now,
        };
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let challenge = lock_challenge(&mut tx, scope).await?;
        let row = sqlx::query!(
            r#"
            SELECT user_id,team_id,outcome,attempts_remaining,submitted_at
            FROM submissions
            WHERE id = $1 AND event_id = $2 AND challenge_id = $3
            FOR UPDATE
            "#,
            command.submission_id.0,
            command.event_id.0,
            challenge_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        if row.outcome != "pending" {
            return Err(DomainError::Conflict(
                "manual submission has already been reviewed".into(),
            ));
        }
        let competitor = review_competitor(row.user_id, row.team_id)?;
        if command.accepted && competitor_has_solved(&mut tx, challenge_id, competitor).await? {
            return Err(DomainError::Conflict("challenge is already solved".into()));
        }
        let outcome = if command.accepted {
            SubmissionOutcome::Correct
        } else {
            SubmissionOutcome::Discarded
        };
        sqlx::query!(
            r#"
            UPDATE submissions
            SET outcome = $2,checker_message = $3,reviewed_by = $4,reviewed_at = $5
            WHERE id = $1
            "#,
            command.submission_id.0,
            outcome_key(outcome),
            note,
            command.reviewer.0,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        let review_event = EventEnvelope::new(
            command.organization_id,
            Some(command.event_id),
            Some(command.reviewer),
            command.correlation_id,
            command.now,
            DomainEvent::SubmissionReviewed {
                submission_id: command.submission_id,
                challenge_id,
                competitor,
                accepted: command.accepted,
            },
        );
        persist_audit_event(
            &mut tx,
            &review_event,
            "submission.review",
            "submission",
            &command.submission_id.to_string(),
        )
        .await?;
        let mut events = vec![review_event];
        let mut awarded_points = 0;
        let mut first_blood = false;
        if command.accepted {
            let solve = award_solve(
                &mut tx,
                SolveContext {
                    organization_id: command.organization_id,
                    event_id: command.event_id,
                    challenge_id,
                    actor: command.reviewer,
                    correlation_id: command.correlation_id,
                    now: command.now,
                },
                &challenge,
                command.submission_id,
                competitor,
            )
            .await?;
            awarded_points = solve.awarded_points;
            first_blood = solve.first_blood;
            events.extend(solve.events);
            sqlx::query!(
                r#"
                UPDATE submissions
                SET awarded_points = $2,first_blood = $3
                WHERE id = $1
                "#,
                command.submission_id.0,
                awarded_points,
                first_blood,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }
        tx.commit().await.map_err(unavailable)?;
        Ok(SubmissionResult {
            record: SubmissionRecord {
                id: command.submission_id.0,
                challenge_id: challenge_id.0,
                outcome: outcome_key(outcome).to_owned(),
                awarded_points,
                first_blood,
                attempts_remaining: row.attempts_remaining,
                submitted_at: row.submitted_at,
            },
            events,
            replayed: false,
        })
    }
}

struct LockedChallenge {
    state: String,
    kind: serde_json::Value,
    updated_at: DateTime<Utc>,
    scoring: serde_json::Value,
    visibility: serde_json::Value,
    max_attempts: Option<i32>,
    event_state: String,
    participation: String,
    scoreboard_frozen: bool,
    starts_at: Option<DateTime<Utc>>,
    ends_at: Option<DateTime<Utc>>,
    team_size_limit: Option<i16>,
    first_blood_bonus: i64,
}

struct ScoreboardControls {
    hidden: bool,
    frozen: bool,
}

struct SolveAward {
    awarded_points: i64,
    first_blood: bool,
    events: Vec<EventEnvelope>,
}

async fn scoreboard_controls(
    pool: &PgPool,
    organization_id: OrganizationId,
    event_id: EventId,
) -> DomainResult<ScoreboardControls> {
    let row = sqlx::query!(
        r#"
        SELECT scoreboard_hidden,scoreboard_frozen
        FROM events
        WHERE id = $1 AND organization_id = $2
        "#,
        event_id.0,
        organization_id.0,
    )
    .fetch_optional(pool)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(ScoreboardControls {
        hidden: row.scoreboard_hidden,
        frozen: row.scoreboard_frozen,
    })
}

async fn replayed_submission(
    tx: &mut Transaction<'_, Postgres>,
    command: &NewSubmission<'_>,
) -> DomainResult<Option<SubmissionRecord>> {
    replayed_submission_by_key(
        tx,
        &SubmissionReplayKey {
            organization_id: command.organization_id,
            event_id: command.event_id,
            challenge_id: command.challenge_id,
            actor: command.actor,
            idempotency_key: command.idempotency_key,
            answer: command.answer,
        },
    )
    .await
}

async fn replayed_submission_by_key(
    tx: &mut Transaction<'_, Postgres>,
    key: &SubmissionReplayKey<'_>,
) -> DomainResult<Option<SubmissionRecord>> {
    let row = sqlx::query!(
        r#"
        SELECT s.id,s.challenge_id,s.user_id,s.team_id,s.outcome,s.answer_digest,
               s.awarded_points,
               s.first_blood,s.attempts_remaining,s.submitted_at,
               EXISTS(
                   SELECT 1 FROM team_members tm
                   WHERE tm.team_id = s.team_id AND tm.user_id = $4
               ) AS "team_member!"
        FROM submissions s
        JOIN events e ON e.id = s.event_id
        WHERE s.event_id = $1 AND s.idempotency_key = $2 AND e.organization_id = $3
        "#,
        key.event_id.0,
        key.idempotency_key,
        key.organization_id.0,
        key.actor.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    if row.user_id != Some(key.actor.0) && !row.team_member {
        return Err(DomainError::Conflict(
            "idempotency key is already in use".into(),
        ));
    }
    if row.challenge_id != Some(key.challenge_id.0) {
        return Err(DomainError::Conflict(
            "idempotency key belongs to another challenge".into(),
        ));
    }
    let submitted_digest = Sha256::digest(key.answer.trim().as_bytes());
    let digest_matches = row
        .answer_digest
        .as_deref()
        .is_some_and(|stored| bool::from(stored.ct_eq(submitted_digest.as_slice())));
    if !digest_matches {
        return Err(DomainError::Conflict(
            "idempotency key was used with a different answer".into(),
        ));
    }
    Ok(Some(SubmissionRecord {
        id: row.id,
        challenge_id: row.challenge_id.ok_or_else(|| {
            DomainError::Unavailable("stored challenge submission has no challenge".into())
        })?,
        outcome: row.outcome,
        awarded_points: row.awarded_points,
        first_blood: row.first_blood,
        attempts_remaining: row.attempts_remaining,
        submitted_at: row.submitted_at,
    }))
}

async fn lock_challenge(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
) -> DomainResult<LockedChallenge> {
    let row = sqlx::query!(
        r#"
        SELECT c.state,c.kind,c.scoring,c.visibility,c.max_attempts,c.updated_at,
               e.state AS event_state,e.participation,e.scoreboard_frozen,
               e.starts_at,e.ends_at,e.team_size_limit,
               COALESCE((e.config->>'first_blood_bonus')::bigint, $4) AS "first_blood_bonus!"
        FROM challenges c
        JOIN events e ON e.id = c.event_id
        WHERE c.id = $1 AND c.event_id = $2 AND e.organization_id = $3
        FOR UPDATE OF c
        "#,
        scope.challenge_id.0,
        scope.event_id.0,
        scope.organization_id.0,
        DEFAULT_FIRST_BLOOD_BONUS,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(LockedChallenge {
        state: row.state,
        kind: row.kind,
        updated_at: row.updated_at,
        scoring: row.scoring,
        visibility: row.visibility,
        max_attempts: row.max_attempts,
        event_state: row.event_state,
        participation: row.participation,
        scoreboard_frozen: row.scoreboard_frozen,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        team_size_limit: row.team_size_limit,
        first_blood_bonus: row.first_blood_bonus,
    })
}

async fn read_challenge(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
) -> DomainResult<LockedChallenge> {
    let row = sqlx::query!(
        r#"
        SELECT c.state,c.kind,c.scoring,c.visibility,c.max_attempts,c.updated_at,
               e.state AS event_state,e.participation,e.scoreboard_frozen,
               e.starts_at,e.ends_at,e.team_size_limit,
               COALESCE((e.config->>'first_blood_bonus')::bigint, $4) AS "first_blood_bonus!"
        FROM challenges c
        JOIN events e ON e.id = c.event_id
        WHERE c.id = $1 AND c.event_id = $2 AND e.organization_id = $3
        "#,
        scope.challenge_id.0,
        scope.event_id.0,
        scope.organization_id.0,
        DEFAULT_FIRST_BLOOD_BONUS,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(LockedChallenge {
        state: row.state,
        kind: row.kind,
        updated_at: row.updated_at,
        scoring: row.scoring,
        visibility: row.visibility,
        max_attempts: row.max_attempts,
        event_state: row.event_state,
        participation: row.participation,
        scoreboard_frozen: row.scoreboard_frozen,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        team_size_limit: row.team_size_limit,
        first_blood_bonus: row.first_blood_bonus,
    })
}

fn validate_event_window(challenge: &LockedChallenge, now: DateTime<Utc>) -> DomainResult<()> {
    if challenge.event_state != "live"
        || challenge.starts_at.is_some_and(|start| now < start)
        || challenge.ends_at.is_some_and(|end| now >= end)
    {
        return Err(DomainError::Conflict(
            "event is not accepting submissions".into(),
        ));
    }
    Ok(())
}

async fn resolve_competitor(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    challenge: &LockedChallenge,
) -> DomainResult<CompetitorId> {
    let team_id = sqlx::query_scalar!(
        r#"
        SELECT tm.team_id
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = $1 AND tm.organization_id = $2
        "#,
        scope.actor.0,
        scope.organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    let competitor = match challenge.participation.as_str() {
        "individual" => CompetitorId::User(scope.actor),
        "team" => CompetitorId::Team(TeamId(team_id.ok_or_else(|| {
            DomainError::Validation("join a team before submitting to this event".into())
        })?)),
        "hybrid" => match team_id {
            Some(id) => CompetitorId::Team(TeamId(id)),
            None => CompetitorId::User(scope.actor),
        },
        _ => {
            return Err(DomainError::Unavailable(
                "event contains an invalid participation mode".into(),
            ));
        }
    };
    if let (CompetitorId::Team(team_id), Some(limit)) = (competitor, challenge.team_size_limit) {
        let members = sqlx::query_scalar!(
            "SELECT count(*) AS \"count!\" FROM team_members WHERE team_id = $1",
            team_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
        if members > i64::from(limit) {
            return Err(DomainError::Validation(
                "team exceeds this event's size limit".into(),
            ));
        }
    }
    Ok(competitor)
}

async fn register_competitor(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    competitor: CompetitorId,
) -> DomainResult<()> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query!(
        r#"
        INSERT INTO event_participants (
            event_id,user_id,team_id,division_id,bracket_id,registered_at
        ) VALUES ($1,$2,$3,NULL,NULL,$4)
        ON CONFLICT DO NOTHING
        "#,
        scope.event_id.0,
        user_id,
        team_id,
        scope.now,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

async fn validate_challenge_visibility(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    competitor: CompetitorId,
    challenge: &LockedChallenge,
) -> DomainResult<()> {
    if !matches!(challenge.state.as_str(), "published" | "scheduled") {
        return Err(DomainError::NotFound);
    }
    let (user_id, team_id) = competitor_columns(competitor);
    let division_id = sqlx::query_scalar!(
        r#"
        SELECT division_id FROM event_participants
        WHERE event_id = $1 AND user_id IS NOT DISTINCT FROM $2
          AND team_id IS NOT DISTINCT FROM $3
        "#,
        scope.event_id.0,
        user_id,
        team_id,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .flatten();
    let solves = sqlx::query_scalar!(
        r#"
        SELECT challenge_id FROM challenge_solves
        WHERE user_id IS NOT DISTINCT FROM $1 AND team_id IS NOT DISTINCT FROM $2
        "#,
        user_id,
        team_id,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(unavailable)?
    .into_iter()
    .map(ChallengeId)
    .collect::<BTreeSet<_>>();
    let visibility = serde_json::from_value::<VisibilityRule>(challenge.visibility.clone())
        .map_err(|error| {
            DomainError::Unavailable(format!("invalid challenge visibility: {error}"))
        })?;
    if visibility.allows(scope.now, division_id.map(DivisionId), &solves) {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

async fn competitor_has_solved(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    competitor: CompetitorId,
) -> DomainResult<bool> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM challenge_solves
            WHERE challenge_id = $1
              AND user_id IS NOT DISTINCT FROM $2
              AND team_id IS NOT DISTINCT FROM $3
        ) AS "exists!"
        "#,
        challenge_id.0,
        user_id,
        team_id,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

async fn failed_attempts(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    competitor: CompetitorId,
) -> DomainResult<i64> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!" FROM submissions
        WHERE challenge_id = $1 AND outcome = 'incorrect'
          AND (
              ($3::uuid IS NOT NULL AND team_id = $3)
              OR ($3::uuid IS NULL AND user_id = $2 AND team_id IS NULL)
          )
        "#,
        challenge_id.0,
        user_id,
        team_id,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

async fn competitor_has_pending(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    competitor: CompetitorId,
) -> DomainResult<bool> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1 FROM submissions
            WHERE challenge_id = $1 AND outcome = 'pending'
              AND (
                  ($3::uuid IS NOT NULL AND team_id = $3)
                  OR ($3::uuid IS NULL AND user_id = $2 AND team_id IS NULL)
              )
        ) AS "exists!"
        "#,
        challenge_id.0,
        user_id,
        team_id,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

fn remaining_attempts(
    max_attempts: Option<i32>,
    failed_attempts: i64,
) -> DomainResult<Option<i32>> {
    let Some(max_attempts) = max_attempts else {
        return Ok(None);
    };
    let failed_attempts = i32::try_from(failed_attempts)
        .map_err(|_| DomainError::LimitExceeded("challenge attempts".into()))?;
    let remaining = max_attempts.saturating_sub(failed_attempts);
    if remaining == 0 {
        Err(DomainError::LimitExceeded(
            "challenge attempt budget exhausted".into(),
        ))
    } else {
        Ok(Some(remaining))
    }
}

async fn load_answer_rules(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
) -> DomainResult<Vec<AnswerRule>> {
    let rows = sqlx::query_scalar!(
        "SELECT rule FROM challenge_answers WHERE challenge_id = $1 ORDER BY position,id",
        challenge_id.0,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(unavailable)?;
    rows.into_iter()
        .map(|row| {
            serde_json::from_value(row).map_err(|error| {
                DomainError::Unavailable(format!("invalid stored answer rule: {error}"))
            })
        })
        .collect()
}

async fn hint_records(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    competitor: CompetitorId,
) -> DomainResult<Vec<HintRecord>> {
    let (user_id, team_id) = competitor_columns(competitor);
    let rows = sqlx::query!(
        r#"
        SELECT h.id,h.cost,
               CASE WHEN EXISTS(
                   SELECT 1 FROM hint_unlocks hu
                   WHERE hu.challenge_id = h.challenge_id AND hu.hint_id = h.id
                     AND hu.user_id IS NOT DISTINCT FROM $2
                     AND hu.team_id IS NOT DISTINCT FROM $3
               ) THEN h.content ELSE NULL END AS content,
               EXISTS(
                   SELECT 1 FROM hint_unlocks hu
                   WHERE hu.challenge_id = h.challenge_id AND hu.hint_id = h.id
                     AND hu.user_id IS NOT DISTINCT FROM $2
                     AND hu.team_id IS NOT DISTINCT FROM $3
               ) AS "unlocked!"
        FROM challenge_hints h
        WHERE h.challenge_id = $1
        ORDER BY h.id
        "#,
        challenge_id.0,
        user_id,
        team_id,
    )
    .fetch_all(&mut **tx)
    .await
    .map_err(unavailable)?;
    rows.into_iter()
        .map(|row| {
            Ok(HintRecord {
                id: u32::try_from(row.id)
                    .map_err(|_| DomainError::Unavailable("negative hint identifier".into()))?,
                cost: row.cost,
                content: row.content,
                unlocked: row.unlocked,
            })
        })
        .collect()
}

async fn evaluate_answer(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    competitor: CompetitorId,
    challenge: &LockedChallenge,
    rules: &[AnswerRule],
    answer: &str,
    plugin_verification: Option<&VerifiedPluginAnswer<'_>>,
) -> DomainResult<SubmissionOutcome> {
    let kind =
        serde_json::from_value::<ChallengeKind>(challenge.kind.clone()).map_err(|error| {
            DomainError::Unavailable(format!("stored challenge type is invalid: {error}"))
        })?;
    validate_answer_contract(&kind, rules)?;

    let mut pending = false;
    for rule in rules {
        match rule.evaluate(answer)? {
            AnswerOutcome::Correct => return Ok(SubmissionOutcome::Correct),
            AnswerOutcome::PendingReview => pending = true,
            AnswerOutcome::RequiresDynamicVerification => {
                return verify_dynamic_answer(tx, scope, competitor, answer).await;
            }
            AnswerOutcome::RequiresPluginVerification => {
                return verify_plugin_answer(
                    &kind,
                    challenge.updated_at,
                    answer,
                    plugin_verification,
                );
            }
            AnswerOutcome::Incorrect => {}
        }
    }
    Ok(if pending {
        SubmissionOutcome::Pending
    } else {
        SubmissionOutcome::Incorrect
    })
}

fn verify_plugin_answer(
    challenge_kind: &ChallengeKind,
    challenge_updated_at: DateTime<Utc>,
    answer: &str,
    verification: Option<&VerifiedPluginAnswer<'_>>,
) -> DomainResult<SubmissionOutcome> {
    let verification = verification
        .ok_or_else(|| DomainError::Unavailable("plugin answer verifier is not enabled".into()))?;
    let ChallengeKind::Plugin { plugin, kind, .. } = challenge_kind else {
        return Err(DomainError::Validation(
            "plugin verifier does not match the challenge type".into(),
        ));
    };
    let answer_digest = Sha256::digest(answer.trim().as_bytes());
    let binding_matches = plugin == verification.plugin
        && kind == verification.kind
        && challenge_updated_at.timestamp_micros()
            == verification.challenge_updated_at.timestamp_micros()
        && bool::from(
            answer_digest
                .as_slice()
                .ct_eq(verification.answer_digest.as_slice()),
        );
    if !binding_matches {
        return Err(DomainError::Conflict(
            "plugin challenge changed during answer verification".into(),
        ));
    }
    Ok(match verification.decision {
        PluginAnswerDecision::Incorrect => SubmissionOutcome::Incorrect,
        PluginAnswerDecision::Correct => SubmissionOutcome::Correct,
    })
}

async fn verify_dynamic_answer(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    competitor: CompetitorId,
    answer: &str,
) -> DomainResult<SubmissionOutcome> {
    let (user_id, team_id) = competitor_columns(competitor);
    let stored_digest = sqlx::query_scalar!(
        r#"
        SELECT flag_digest
        FROM instances
        WHERE event_id = $1
          AND challenge_id = $2
          AND user_id IS NOT DISTINCT FROM $3
          AND team_id IS NOT DISTINCT FROM $4
          AND state IN ('ready', 'unhealthy')
          AND flag_digest IS NOT NULL
          AND expires_at > $5
        ORDER BY updated_at DESC
        LIMIT 1
        FOR SHARE
        "#,
        scope.event_id.0,
        scope.challenge_id.0,
        user_id,
        team_id,
        scope.now,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .flatten()
    .ok_or_else(|| DomainError::Unavailable("no unexpired challenge instance is ready".into()))?;

    let submitted_digest = Sha256::digest(answer.trim().as_bytes());
    let accepted = stored_digest
        .as_slice()
        .ct_eq(submitted_digest.as_slice())
        .into();
    Ok(if accepted {
        SubmissionOutcome::Correct
    } else {
        SubmissionOutcome::Incorrect
    })
}

#[allow(clippy::too_many_arguments)]
async fn insert_submission(
    tx: &mut Transaction<'_, Postgres>,
    command: &NewSubmission<'_>,
    competitor: CompetitorId,
    submission_id: SubmissionId,
    outcome: SubmissionOutcome,
    answer_digest: &[u8],
    attempts_remaining: Option<i32>,
) -> DomainResult<()> {
    let (_, team_id) = competitor_columns(competitor);
    sqlx::query!(
        r#"
        INSERT INTO submissions (
            id,event_id,challenge_id,user_id,team_id,outcome,answer_digest,
            checker_message,idempotency_key,session_id,submitted_at,
            attempts_remaining,answer_ciphertext
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,$12)
        "#,
        submission_id.0,
        command.event_id.0,
        command.challenge_id.0,
        command.actor.0,
        team_id,
        outcome_key(outcome),
        answer_digest,
        command.idempotency_key,
        command.session_id,
        command.now,
        attempts_remaining,
        (outcome == SubmissionOutcome::Pending).then_some(command.sealed_answer),
    )
    .execute(&mut **tx)
    .await
    .map_err(conflict_or_unavailable)?;
    Ok(())
}

async fn award_solve(
    tx: &mut Transaction<'_, Postgres>,
    context: SolveContext,
    challenge: &LockedChallenge,
    submission_id: SubmissionId,
    competitor: CompetitorId,
) -> DomainResult<SolveAward> {
    let prior_solves = sqlx::query_scalar!(
        "SELECT count(*) AS \"count!\" FROM challenge_solves WHERE challenge_id = $1",
        context.challenge_id.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    let scoring = serde_json::from_value::<ScoringRule>(challenge.scoring.clone())
        .map_err(|error| DomainError::Unavailable(format!("invalid scoring rule: {error}")))?;
    let solve_points = scoring.solve_value(
        u64::try_from(prior_solves)
            .map_err(|_| DomainError::Unavailable("negative solve count".into()))?,
    )?;
    let first_blood = prior_solves == 0;
    let bonus = if first_blood {
        challenge.first_blood_bonus.max(0)
    } else {
        0
    };
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query!(
        r#"
        INSERT INTO challenge_solves (
            challenge_id,user_id,team_id,submission_id,solved_at
        ) VALUES ($1,$2,$3,$4,$5)
        "#,
        context.challenge_id.0,
        user_id,
        team_id,
        submission_id.0,
        context.now,
    )
    .execute(&mut **tx)
    .await
    .map_err(conflict_or_unavailable)?;
    let division_id = participant_division(tx, context.event_id, competitor).await?;

    let solve_sequence = next_score_sequence(tx).await?;
    let reason = serde_json::to_value(ScoreReason::Solve {
        challenge_id: context.challenge_id,
    })
    .map_err(serialization_error)?;
    insert_score_entry(
        tx,
        context.gameplay_scope(),
        competitor,
        division_id,
        solve_sequence,
        solve_points,
        &reason,
        challenge.scoreboard_frozen,
    )
    .await?;

    let mut events = vec![score_event(context, competitor, solve_points)];
    persist_audit_event(
        tx,
        &events[0],
        "score.challenge_solve",
        "score_entry",
        &solve_sequence.to_string(),
    )
    .await?;
    if bonus > 0 {
        let bonus_sequence = next_score_sequence(tx).await?;
        let reason = serde_json::to_value(ScoreReason::FirstBlood {
            challenge_id: context.challenge_id,
        })
        .map_err(serialization_error)?;
        insert_score_entry(
            tx,
            context.gameplay_scope(),
            competitor,
            division_id,
            bonus_sequence,
            bonus,
            &reason,
            challenge.scoreboard_frozen,
        )
        .await?;
        let score_event = score_event(context, competitor, bonus);
        persist_audit_event(
            tx,
            &score_event,
            "score.first_blood_bonus",
            "score_entry",
            &bonus_sequence.to_string(),
        )
        .await?;
        events.push(score_event);
    }
    if first_blood {
        let first_blood_event = EventEnvelope::new(
            context.organization_id,
            Some(context.event_id),
            Some(context.actor),
            context.correlation_id,
            context.now,
            DomainEvent::FirstBlood {
                challenge_id: context.challenge_id,
                competitor,
            },
        );
        persist_audit_event(
            tx,
            &first_blood_event,
            "submission.first_blood",
            "challenge",
            &context.challenge_id.to_string(),
        )
        .await?;
        events.push(first_blood_event);
    }
    Ok(SolveAward {
        awarded_points: solve_points.saturating_add(bonus),
        first_blood,
        events,
    })
}

async fn participant_division(
    tx: &mut Transaction<'_, Postgres>,
    event_id: EventId,
    competitor: CompetitorId,
) -> DomainResult<Option<Uuid>> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query_scalar!(
        r#"
        SELECT division_id FROM event_participants
        WHERE event_id = $1 AND user_id IS NOT DISTINCT FROM $2
          AND team_id IS NOT DISTINCT FROM $3
        "#,
        event_id.0,
        user_id,
        team_id,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

async fn next_score_sequence(tx: &mut Transaction<'_, Postgres>) -> DomainResult<i64> {
    sqlx::query_scalar!("SELECT nextval('score_entry_sequence') AS \"sequence!\"")
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)
}

#[allow(clippy::too_many_arguments)]
async fn insert_score_entry(
    tx: &mut Transaction<'_, Postgres>,
    scope: GameplayScope,
    competitor: CompetitorId,
    division_id: Option<Uuid>,
    sequence: i64,
    points: i64,
    reason: &serde_json::Value,
    hidden_by_freeze: bool,
) -> DomainResult<()> {
    let (user_id, team_id) = competitor_columns(competitor);
    sqlx::query!(
        r#"
        INSERT INTO score_entries (
            event_id,sequence,user_id,team_id,division_id,points,reason,
            occurred_at,hidden_by_freeze
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        "#,
        scope.event_id.0,
        sequence,
        user_id,
        team_id,
        division_id,
        points,
        reason,
        scope.now,
        hidden_by_freeze,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

fn submission_event(
    command: &NewSubmission<'_>,
    submission_id: SubmissionId,
    competitor: CompetitorId,
    outcome: SubmissionOutcome,
) -> EventEnvelope {
    EventEnvelope::new(
        command.organization_id,
        Some(command.event_id),
        Some(command.actor),
        command.idempotency_key,
        command.now,
        DomainEvent::SubmissionReceived {
            submission_id,
            challenge_id: command.challenge_id,
            competitor,
            outcome,
        },
    )
}

fn score_event(context: SolveContext, competitor: CompetitorId, delta: i64) -> EventEnvelope {
    EventEnvelope::new(
        context.organization_id,
        Some(context.event_id),
        Some(context.actor),
        context.correlation_id,
        context.now,
        DomainEvent::ScoreChanged { competitor, delta },
    )
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

fn review_competitor(user_id: Option<Uuid>, team_id: Option<Uuid>) -> DomainResult<CompetitorId> {
    match (user_id, team_id) {
        (_, Some(team_id)) => Ok(CompetitorId::Team(TeamId(team_id))),
        (Some(user_id), None) => Ok(CompetitorId::User(UserId(user_id))),
        (None, None) => Err(DomainError::Unavailable(
            "manual submission contains no competitor identity".into(),
        )),
    }
}

fn review_competitor_identity(
    user_id: Option<Uuid>,
    team_id: Option<Uuid>,
    resource: &str,
) -> DomainResult<(String, Uuid)> {
    match (user_id, team_id) {
        (_, Some(team_id)) => Ok(("team".to_owned(), team_id)),
        (Some(user_id), None) => Ok(("user".to_owned(), user_id)),
        (None, None) => Err(DomainError::Unavailable(format!(
            "{resource} contains no competitor identity"
        ))),
    }
}

const fn outcome_key(outcome: SubmissionOutcome) -> &'static str {
    match outcome {
        SubmissionOutcome::Correct => "correct",
        SubmissionOutcome::Incorrect => "incorrect",
        SubmissionOutcome::Partial => "partial",
        SubmissionOutcome::Pending => "pending",
        SubmissionOutcome::Discarded => "discarded",
        SubmissionOutcome::RateLimited => "rate_limited",
        SubmissionOutcome::OwnFlag => "own_flag",
        SubmissionOutcome::Duplicate => "duplicate",
        SubmissionOutcome::Expired => "expired",
    }
}

fn serialization_error(error: serde_json::Error) -> DomainError {
    DomainError::Unavailable(format!("submission serialization failed: {error}"))
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres submissions: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("submission was already recorded".into())
    } else {
        unavailable(error)
    }
}
