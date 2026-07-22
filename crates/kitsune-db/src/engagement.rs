//! Transactional post-solve writeup and survey workflows.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    challenge::{SurveyQuestion, WriteupState, validate_survey_answers},
    events::DomainEvent,
    identity::{ChallengeId, EventId, OrganizationId, SurveyResponseId, UserId, WriteupId},
    scoring::CompetitorId,
};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::resources::persist_audit_event;

/// Player or organizer writeup projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteupRecord {
    /// Writeup identifier.
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
    /// Markdown body.
    pub body: String,
    /// Stable lifecycle key.
    pub state: String,
    /// Last reviewer, when reviewed.
    pub reviewer_id: Option<Uuid>,
    /// Organizer feedback.
    pub feedback: Option<String>,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Last update timestamp.
    pub updated_at: DateTime<Utc>,
}

/// Player writeup save command.
pub struct SaveWriteup<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Challenge target.
    pub challenge_id: ChallengeId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Markdown content.
    pub body: &'a str,
    /// Move the saved draft into the review queue.
    pub submit: bool,
    /// Correlation ID.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// Organizer review command.
pub struct ReviewWriteup<'a> {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Writeup target.
    pub writeup_id: WriteupId,
    /// Authenticated reviewer.
    pub reviewer: UserId,
    /// Requested state.
    pub state: WriteupState,
    /// Optional review feedback.
    pub feedback: Option<&'a str>,
    /// Correlation ID.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// Player survey submission command.
pub struct SubmitSurvey {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary.
    pub event_id: EventId,
    /// Challenge target.
    pub challenge_id: ChallengeId,
    /// Authenticated actor.
    pub actor: UserId,
    /// Integer answers keyed by authored question key.
    pub answers: BTreeMap<String, i32>,
    /// Correlation ID.
    pub correlation_id: Uuid,
    /// Timestamp.
    pub now: DateTime<Utc>,
}

/// Stable survey receipt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyResponseRecord {
    /// Response identifier.
    pub id: Uuid,
    /// Challenge identifier.
    pub challenge_id: Uuid,
    /// Validated answers.
    pub answers: BTreeMap<String, i32>,
    /// Last submission timestamp.
    pub submitted_at: DateTime<Utc>,
}

/// Aggregate statistics for one survey question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveyQuestionSummaryRecord {
    /// Authored question key.
    pub key: String,
    /// Authored prompt.
    pub prompt: String,
    /// Number of responses containing the key.
    pub responses: usize,
    /// Arithmetic mean when any response exists.
    pub average: Option<f64>,
    /// Lowest observed value.
    pub minimum: Option<i32>,
    /// Highest observed value.
    pub maximum: Option<i32>,
}

/// Organizer survey analytics projection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveySummaryRecord {
    /// Number of competitor responses.
    pub response_count: usize,
    /// Authored questions in stable order.
    pub questions: Vec<SurveyQuestionSummaryRecord>,
}

/// A committed engagement record and its fresh realtime events.
pub struct EngagementResult<T> {
    /// Safe committed projection.
    pub record: T,
    /// Events that must be published after the transaction commits.
    pub events: Vec<EventEnvelope>,
}

/// PostgreSQL post-solve workflow repository.
#[derive(Debug, Clone)]
pub struct EngagementRepository {
    pool: PgPool,
}

impl EngagementRepository {
    /// Wraps a pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Loads the current competitor's writeup.
    pub async fn writeup(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        challenge_id: ChallengeId,
        actor: UserId,
    ) -> DomainResult<WriteupRecord> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let context = challenge_context(&mut tx, organization_id, event_id, challenge_id).await?;
        let competitor = solved_competitor(&mut tx, challenge_id, actor).await?;
        let record = load_competitor_writeup(&mut tx, challenge_id, competitor, &context.name)
            .await?
            .ok_or(DomainError::NotFound)?;
        tx.rollback().await.map_err(unavailable)?;
        Ok(record)
    }

    /// Creates or updates a player draft and optionally submits it for review.
    pub async fn save_writeup(
        &self,
        command: SaveWriteup<'_>,
    ) -> DomainResult<EngagementResult<WriteupRecord>> {
        let body = command.body.trim();
        if body.is_empty() || body.len() > 100_000 {
            return Err(DomainError::Validation(
                "writeup must contain 1 to 100000 bytes".into(),
            ));
        }
        if command.submit && body.len() < 20 {
            return Err(DomainError::Validation(
                "submitted writeup must contain at least 20 bytes".into(),
            ));
        }

        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let context = challenge_context(
            &mut tx,
            command.organization_id,
            command.event_id,
            command.challenge_id,
        )
        .await?;
        if !context.writeups_enabled {
            return Err(DomainError::NotFound);
        }
        let competitor = solved_competitor(&mut tx, command.challenge_id, command.actor).await?;
        let existing =
            load_competitor_writeup(&mut tx, command.challenge_id, competitor, &context.name)
                .await?;
        let (writeup_id, state) = match &existing {
            Some(writeup) => {
                let current = parse_writeup_state(&writeup.state)?;
                (
                    WriteupId(writeup.id),
                    current.author_transition(command.submit)?,
                )
            }
            None => (
                WriteupId::new(),
                if command.submit {
                    WriteupState::Submitted
                } else {
                    WriteupState::Draft
                },
            ),
        };
        let (user_id, team_id) = competitor_columns(competitor);
        sqlx::query!(
            r#"
            INSERT INTO writeups (
                id,challenge_id,user_id,team_id,body,state,reviewer_id,
                feedback,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,$7,$7)
            ON CONFLICT (challenge_id,user_id,team_id)
            DO UPDATE SET body = EXCLUDED.body,state = EXCLUDED.state,
                          updated_at = EXCLUDED.updated_at
            "#,
            writeup_id.0,
            command.challenge_id.0,
            user_id,
            team_id,
            body,
            writeup_state_key(state),
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;

        let event = writeup_event(
            command.organization_id,
            command.event_id,
            command.actor,
            command.correlation_id,
            command.now,
            writeup_id,
            command.challenge_id,
            state,
        );
        persist_audit_event(
            &mut tx,
            &event,
            if command.submit {
                "writeup.submit"
            } else {
                "writeup.save"
            },
            "writeup",
            &writeup_id.to_string(),
        )
        .await?;
        let record =
            load_competitor_writeup(&mut tx, command.challenge_id, competitor, &context.name)
                .await?
                .ok_or(DomainError::NotFound)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(EngagementResult {
            record,
            events: vec![event],
        })
    }

    /// Lists the organizer review queue, optionally filtered by state.
    pub async fn writeup_queue(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        state: Option<WriteupState>,
    ) -> DomainResult<Vec<WriteupRecord>> {
        let state = state.map(writeup_state_key);
        let rows = sqlx::query!(
            r#"
            SELECT w.id,w.challenge_id,c.name AS challenge_name,w.user_id,w.team_id,
                   COALESCE(t.name,u.display_name) AS "competitor_name!",w.body,w.state,
                   w.reviewer_id,w.feedback,w.created_at,w.updated_at
            FROM writeups w
            JOIN challenges c ON c.id = w.challenge_id
            JOIN events e ON e.id = c.event_id
            LEFT JOIN users u ON u.id = w.user_id
            LEFT JOIN teams t ON t.id = w.team_id
            WHERE e.id = $1 AND e.organization_id = $2
              AND ($3::text IS NULL OR w.state = $3)
            ORDER BY w.updated_at DESC,w.id
            "#,
            event_id.0,
            organization_id.0,
            state,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        rows.into_iter()
            .map(|row| {
                writeup_record(
                    row.id,
                    row.challenge_id,
                    row.challenge_name,
                    row.user_id,
                    row.team_id,
                    row.competitor_name,
                    row.body,
                    row.state,
                    row.reviewer_id,
                    row.feedback,
                    row.created_at,
                    row.updated_at,
                )
            })
            .collect()
    }

    /// Applies an organizer review transition.
    pub async fn review_writeup(
        &self,
        command: ReviewWriteup<'_>,
    ) -> DomainResult<EngagementResult<WriteupRecord>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query!(
            r#"
            SELECT w.challenge_id,w.state
            FROM writeups w
            JOIN challenges c ON c.id = w.challenge_id
            JOIN events e ON e.id = c.event_id
            WHERE w.id = $1 AND e.id = $2 AND e.organization_id = $3
            FOR UPDATE OF w
            "#,
            command.writeup_id.0,
            command.event_id.0,
            command.organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let current = parse_writeup_state(&row.state)?;
        let next = current.review_transition(command.state)?;
        let feedback = command
            .feedback
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if next == WriteupState::ChangesRequested && feedback.is_none() {
            return Err(DomainError::Validation(
                "feedback is required when requesting changes".into(),
            ));
        }
        if feedback.is_some_and(|value| value.len() > 10_000) {
            return Err(DomainError::Validation(
                "writeup feedback cannot exceed 10000 bytes".into(),
            ));
        }
        sqlx::query!(
            r#"
            UPDATE writeups
            SET state = $2,reviewer_id = $3,feedback = $4,updated_at = $5
            WHERE id = $1
            "#,
            command.writeup_id.0,
            writeup_state_key(next),
            command.reviewer.0,
            feedback,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        let event = writeup_event(
            command.organization_id,
            command.event_id,
            command.reviewer,
            command.correlation_id,
            command.now,
            command.writeup_id,
            ChallengeId(row.challenge_id),
            next,
        );
        persist_audit_event(
            &mut tx,
            &event,
            "writeup.review",
            "writeup",
            &command.writeup_id.to_string(),
        )
        .await?;
        let record = load_writeup_by_id(&mut tx, command.writeup_id).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(EngagementResult {
            record,
            events: vec![event],
        })
    }

    /// Validates and upserts one competitor's post-solve survey response.
    pub async fn submit_survey(
        &self,
        command: SubmitSurvey,
    ) -> DomainResult<EngagementResult<SurveyResponseRecord>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let context = challenge_context(
            &mut tx,
            command.organization_id,
            command.event_id,
            command.challenge_id,
        )
        .await?;
        if context.survey.is_empty() {
            return Err(DomainError::NotFound);
        }
        validate_survey_answers(&context.survey, &command.answers)?;
        let competitor = solved_competitor(&mut tx, command.challenge_id, command.actor).await?;
        let (user_id, team_id) = competitor_columns(competitor);
        let existing_id = sqlx::query_scalar!(
            r#"
            SELECT id FROM survey_responses
            WHERE challenge_id = $1
              AND user_id IS NOT DISTINCT FROM $2
              AND team_id IS NOT DISTINCT FROM $3
            FOR UPDATE
            "#,
            command.challenge_id.0,
            user_id,
            team_id,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?;
        let response_id = existing_id.map_or_else(SurveyResponseId::new, SurveyResponseId);
        let answers = serde_json::to_value(&command.answers).map_err(serialization_error)?;
        sqlx::query!(
            r#"
            INSERT INTO survey_responses (
                id,challenge_id,user_id,team_id,answers,submitted_at
            ) VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (challenge_id,user_id,team_id)
            DO UPDATE SET answers = EXCLUDED.answers,submitted_at = EXCLUDED.submitted_at
            "#,
            response_id.0,
            command.challenge_id.0,
            user_id,
            team_id,
            answers,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let event = EventEnvelope::new(
            command.organization_id,
            Some(command.event_id),
            Some(command.actor),
            command.correlation_id,
            command.now,
            DomainEvent::SurveySubmitted {
                response_id,
                challenge_id: command.challenge_id,
                competitor,
            },
        );
        persist_audit_event(
            &mut tx,
            &event,
            "survey.submit",
            "survey_response",
            &response_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(EngagementResult {
            record: SurveyResponseRecord {
                id: response_id.0,
                challenge_id: command.challenge_id.0,
                answers: command.answers,
                submitted_at: command.now,
            },
            events: vec![event],
        })
    }

    /// Aggregates all responses without exposing competitor-level answers.
    pub async fn survey_summary(
        &self,
        organization_id: OrganizationId,
        event_id: EventId,
        challenge_id: ChallengeId,
    ) -> DomainResult<SurveySummaryRecord> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let context = challenge_context(&mut tx, organization_id, event_id, challenge_id).await?;
        let rows = sqlx::query_scalar!(
            "SELECT answers FROM survey_responses WHERE challenge_id = $1",
            challenge_id.0,
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.rollback().await.map_err(unavailable)?;
        let answers = rows
            .into_iter()
            .map(serde_json::from_value::<BTreeMap<String, i32>>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(serialization_error)?;
        let questions = context
            .survey
            .into_iter()
            .map(|question| summarize_question(question, &answers))
            .collect();
        Ok(SurveySummaryRecord {
            response_count: answers.len(),
            questions,
        })
    }
}

struct ChallengeContext {
    name: String,
    writeups_enabled: bool,
    survey: Vec<SurveyQuestion>,
}

async fn challenge_context(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    event_id: EventId,
    challenge_id: ChallengeId,
) -> DomainResult<ChallengeContext> {
    let row = sqlx::query!(
        r#"
        SELECT c.name,c.writeups_enabled,c.survey
        FROM challenges c
        JOIN events e ON e.id = c.event_id
        WHERE c.id = $1 AND e.id = $2 AND e.organization_id = $3
        "#,
        challenge_id.0,
        event_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    let survey = serde_json::from_value(row.survey).map_err(serialization_error)?;
    Ok(ChallengeContext {
        name: row.name,
        writeups_enabled: row.writeups_enabled,
        survey,
    })
}

async fn solved_competitor(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    actor: UserId,
) -> DomainResult<CompetitorId> {
    let row = sqlx::query!(
        r#"
        SELECT cs.user_id,cs.team_id
        FROM challenge_solves cs
        WHERE cs.challenge_id = $1
          AND (
              cs.user_id = $2
              OR EXISTS (
                  SELECT 1 FROM team_members tm
                  WHERE tm.team_id = cs.team_id AND tm.user_id = $2
              )
          )
        ORDER BY cs.solved_at
        LIMIT 1
        "#,
        challenge_id.0,
        actor.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::Forbidden)?;
    match (row.user_id, row.team_id) {
        (Some(user_id), None) => Ok(CompetitorId::User(UserId(user_id))),
        (None, Some(team_id)) => Ok(CompetitorId::Team(kitsune_core::identity::TeamId(team_id))),
        _ => Err(DomainError::Unavailable(
            "solve contains an invalid competitor identity".into(),
        )),
    }
}

async fn load_competitor_writeup(
    tx: &mut Transaction<'_, Postgres>,
    challenge_id: ChallengeId,
    competitor: CompetitorId,
    challenge_name: &str,
) -> DomainResult<Option<WriteupRecord>> {
    let (user_id, team_id) = competitor_columns(competitor);
    let row = sqlx::query!(
        r#"
        SELECT w.id,w.user_id,w.team_id,COALESCE(t.name,u.display_name) AS "competitor_name!",
               w.body,w.state,w.reviewer_id,w.feedback,w.created_at,w.updated_at
        FROM writeups w
        LEFT JOIN users u ON u.id = w.user_id
        LEFT JOIN teams t ON t.id = w.team_id
        WHERE w.challenge_id = $1
          AND w.user_id IS NOT DISTINCT FROM $2
          AND w.team_id IS NOT DISTINCT FROM $3
        "#,
        challenge_id.0,
        user_id,
        team_id,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    row.map(|row| {
        writeup_record(
            row.id,
            challenge_id.0,
            challenge_name.to_owned(),
            row.user_id,
            row.team_id,
            row.competitor_name,
            row.body,
            row.state,
            row.reviewer_id,
            row.feedback,
            row.created_at,
            row.updated_at,
        )
    })
    .transpose()
}

async fn load_writeup_by_id(
    tx: &mut Transaction<'_, Postgres>,
    writeup_id: WriteupId,
) -> DomainResult<WriteupRecord> {
    let row = sqlx::query!(
        r#"
        SELECT w.id,w.challenge_id,c.name AS challenge_name,w.user_id,w.team_id,
               COALESCE(t.name,u.display_name) AS "competitor_name!",w.body,w.state,
               w.reviewer_id,w.feedback,w.created_at,w.updated_at
        FROM writeups w
        JOIN challenges c ON c.id = w.challenge_id
        LEFT JOIN users u ON u.id = w.user_id
        LEFT JOIN teams t ON t.id = w.team_id
        WHERE w.id = $1
        "#,
        writeup_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    writeup_record(
        row.id,
        row.challenge_id,
        row.challenge_name,
        row.user_id,
        row.team_id,
        row.competitor_name,
        row.body,
        row.state,
        row.reviewer_id,
        row.feedback,
        row.created_at,
        row.updated_at,
    )
}

#[allow(clippy::too_many_arguments)]
fn writeup_record(
    id: Uuid,
    challenge_id: Uuid,
    challenge_name: String,
    user_id: Option<Uuid>,
    team_id: Option<Uuid>,
    competitor_name: String,
    body: String,
    state: String,
    reviewer_id: Option<Uuid>,
    feedback: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
) -> DomainResult<WriteupRecord> {
    let (competitor_kind, competitor_id) = match (user_id, team_id) {
        (Some(user_id), None) => ("user".to_owned(), user_id),
        (None, Some(team_id)) => ("team".to_owned(), team_id),
        _ => {
            return Err(DomainError::Unavailable(
                "writeup contains an invalid competitor identity".into(),
            ));
        }
    };
    Ok(WriteupRecord {
        id,
        challenge_id,
        challenge_name,
        competitor_kind,
        competitor_id,
        competitor_name,
        body,
        state,
        reviewer_id,
        feedback,
        created_at,
        updated_at,
    })
}

fn summarize_question(
    question: SurveyQuestion,
    answers: &[BTreeMap<String, i32>],
) -> SurveyQuestionSummaryRecord {
    let values = answers
        .iter()
        .filter_map(|answers| answers.get(&question.key).copied())
        .collect::<Vec<_>>();
    let sum = values.iter().map(|value| f64::from(*value)).sum::<f64>();
    let average = u32::try_from(values.len())
        .ok()
        .filter(|count| *count > 0)
        .map(|count| sum / f64::from(count));
    SurveyQuestionSummaryRecord {
        key: question.key,
        prompt: question.prompt,
        responses: values.len(),
        average,
        minimum: values.iter().min().copied(),
        maximum: values.iter().max().copied(),
    }
}

#[allow(clippy::too_many_arguments)]
fn writeup_event(
    organization_id: OrganizationId,
    event_id: EventId,
    actor: UserId,
    correlation_id: Uuid,
    now: DateTime<Utc>,
    writeup_id: WriteupId,
    challenge_id: ChallengeId,
    state: WriteupState,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        Some(event_id),
        Some(actor),
        correlation_id,
        now,
        DomainEvent::WriteupChanged {
            writeup_id,
            challenge_id,
            state: writeup_state_key(state).to_owned(),
        },
    )
}

const fn competitor_columns(competitor: CompetitorId) -> (Option<Uuid>, Option<Uuid>) {
    match competitor {
        CompetitorId::User(user_id) => (Some(user_id.0), None),
        CompetitorId::Team(team_id) => (None, Some(team_id.0)),
    }
}

const fn writeup_state_key(state: WriteupState) -> &'static str {
    match state {
        WriteupState::Draft => "draft",
        WriteupState::Submitted => "submitted",
        WriteupState::ChangesRequested => "changes_requested",
        WriteupState::Approved => "approved",
        WriteupState::Published => "published",
    }
}

fn parse_writeup_state(state: &str) -> DomainResult<WriteupState> {
    match state {
        "draft" => Ok(WriteupState::Draft),
        "submitted" => Ok(WriteupState::Submitted),
        "changes_requested" => Ok(WriteupState::ChangesRequested),
        "approved" => Ok(WriteupState::Approved),
        "published" => Ok(WriteupState::Published),
        _ => Err(DomainError::Unavailable(
            "writeup contains an invalid lifecycle state".into(),
        )),
    }
}

fn serialization_error(error: serde_json::Error) -> DomainError {
    DomainError::Unavailable(format!("engagement serialization failed: {error}"))
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres engagement: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("engagement response was concurrently updated".into())
    } else {
        unavailable(error)
    }
}
