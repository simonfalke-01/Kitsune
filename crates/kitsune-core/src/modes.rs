//! Pluggable game-mode contract and four first-party engines.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    DomainError, DomainResult,
    challenge::{AnswerOutcome, AnswerRule, Challenge},
    events::SubmissionOutcome,
    identity::{ChallengeId, EventId, ObjectiveId, TeamId, UserId},
    scoring::{CompetitorId, ScoreEntry, ScoreReason, ScoringStrategy},
};

/// JSON command envelope accepted by a dynamically selected mode.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModeCommand {
    /// Stable command key.
    pub kind: String,
    /// Versioned command body.
    pub payload: serde_json::Value,
    /// Logical time supplied by the application, never read from a hidden clock.
    pub now: DateTime<Utc>,
}

/// Result of applying a mode command.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModeTransition {
    /// Replacement serialized state.
    pub state: serde_json::Value,
    /// Score ledger entries to append atomically.
    pub scores: Vec<ScoreEntry>,
    /// Public response body.
    pub response: serde_json::Value,
}

/// General mode extension contract. Workshop proves scoring is optional.
pub trait GameMode: Send + Sync {
    /// Stable registration key.
    fn key(&self) -> &'static str;
    /// Initializes a versioned mode-state document.
    fn initial_state(&self, event_id: EventId) -> serde_json::Value;
    /// Applies a command deterministically to serialized state.
    fn apply(
        &self,
        event_id: EventId,
        state: &serde_json::Value,
        command: ModeCommand,
    ) -> DomainResult<ModeTransition>;
    /// Produces the public scoreboard/objective view.
    fn public_state(&self, state: &serde_json::Value) -> DomainResult<serde_json::Value>;
    /// Admin control keys offered by this mode.
    fn admin_controls(&self) -> &'static [&'static str];
}

/// Jeopardy mode aggregate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct JeopardyState {
    /// Challenges by identifier.
    pub challenges: BTreeMap<ChallengeId, Challenge>,
    /// Answer rules by challenge.
    pub answers: BTreeMap<ChallengeId, Vec<AnswerRule>>,
    /// Solves by challenge.
    pub solves: BTreeMap<ChallengeId, BTreeSet<CompetitorId>>,
    /// Failed attempts by challenge and competitor.
    pub failures: BTreeMap<(ChallengeId, CompetitorId), u32>,
    /// Unlocked hints by challenge and competitor.
    pub hint_unlocks: BTreeSet<(ChallengeId, u32, CompetitorId)>,
}

/// Type-safe Jeopardy commands used by services before JSON adaptation.
#[derive(Debug, Clone)]
pub enum JeopardyCommand {
    /// Publish or replace an authored challenge.
    UpsertChallenge {
        /// Challenge.
        challenge: Challenge,
        /// Answer rules stored separately from the public challenge.
        answers: Vec<AnswerRule>,
    },
    /// Submit an answer.
    Submit {
        /// Competitor.
        competitor: CompetitorId,
        /// Challenge.
        challenge_id: ChallengeId,
        /// User-supplied answer.
        answer: String,
        /// Division snapshot.
        division: Option<crate::identity::DivisionId>,
        /// Event score sequence start.
        score_sequence: u64,
        /// Optional first-blood bonus.
        first_blood_bonus: i64,
    },
    /// Spend points to unlock a hint.
    UnlockHint {
        /// Competitor.
        competitor: CompetitorId,
        /// Challenge.
        challenge_id: ChallengeId,
        /// Hint key.
        hint_id: u32,
        /// Event score sequence.
        score_sequence: u64,
    },
}

/// Command result with a stable submission outcome.
#[derive(Debug, Clone, PartialEq)]
pub struct JeopardyResult {
    /// Submission result when applicable.
    pub outcome: Option<SubmissionOutcome>,
    /// Appended score entries.
    pub scores: Vec<ScoreEntry>,
    /// First blood was awarded.
    pub first_blood: bool,
}

impl JeopardyState {
    /// Applies a typed Jeopardy command and preserves solve/attempt invariants.
    pub fn apply(
        &mut self,
        event_id: EventId,
        command: JeopardyCommand,
        now: DateTime<Utc>,
    ) -> DomainResult<JeopardyResult> {
        match command {
            JeopardyCommand::UpsertChallenge { challenge, answers } => {
                challenge.validate()?;
                if challenge.event_id != event_id {
                    return Err(DomainError::Validation("event mismatch".into()));
                }
                for answer in &answers {
                    answer.validate()?;
                }
                self.answers.insert(challenge.id, answers);
                self.challenges.insert(challenge.id, challenge);
                Ok(JeopardyResult {
                    outcome: None,
                    scores: Vec::new(),
                    first_blood: false,
                })
            }
            JeopardyCommand::Submit {
                competitor,
                challenge_id,
                answer,
                division,
                score_sequence,
                first_blood_bonus,
            } => {
                let challenge = self
                    .challenges
                    .get(&challenge_id)
                    .ok_or(DomainError::NotFound)?;
                let prior_solves = self.solves.entry(challenge_id).or_default();
                if prior_solves.contains(&competitor) {
                    return Err(DomainError::Conflict(
                        "competitor already solved challenge".into(),
                    ));
                }
                let failures = self.failures.entry((challenge_id, competitor)).or_default();
                if challenge
                    .max_attempts
                    .is_some_and(|maximum| *failures >= maximum)
                {
                    return Ok(JeopardyResult {
                        outcome: Some(SubmissionOutcome::RateLimited),
                        scores: Vec::new(),
                        first_blood: false,
                    });
                }
                let rules = self
                    .answers
                    .get(&challenge_id)
                    .ok_or_else(|| DomainError::Unavailable("answer rules absent".into()))?;
                let mut pending = false;
                let correct = rules.iter().try_fold(false, |accepted, rule| {
                    let outcome = rule.evaluate(&answer)?;
                    pending |= outcome == AnswerOutcome::PendingReview;
                    Ok::<_, DomainError>(accepted || outcome == AnswerOutcome::Correct)
                })?;
                if pending && !correct {
                    return Ok(JeopardyResult {
                        outcome: Some(SubmissionOutcome::Pending),
                        scores: Vec::new(),
                        first_blood: false,
                    });
                }
                if !correct {
                    *failures = failures.saturating_add(1);
                    return Ok(JeopardyResult {
                        outcome: Some(SubmissionOutcome::Incorrect),
                        scores: Vec::new(),
                        first_blood: false,
                    });
                }
                let first_blood = prior_solves.is_empty();
                let points = challenge
                    .scoring
                    .solve_value(u64::try_from(prior_solves.len()).unwrap_or(u64::MAX))?;
                prior_solves.insert(competitor);
                let mut scores = vec![ScoreEntry {
                    event_id,
                    competitor,
                    division_id: division,
                    sequence: score_sequence,
                    points,
                    reason: ScoreReason::Solve { challenge_id },
                    occurred_at: now,
                    hidden_by_freeze: false,
                }];
                if first_blood && first_blood_bonus != 0 {
                    scores.push(ScoreEntry {
                        event_id,
                        competitor,
                        division_id: division,
                        sequence: score_sequence.saturating_add(1),
                        points: first_blood_bonus,
                        reason: ScoreReason::FirstBlood { challenge_id },
                        occurred_at: now,
                        hidden_by_freeze: false,
                    });
                }
                Ok(JeopardyResult {
                    outcome: Some(SubmissionOutcome::Correct),
                    scores,
                    first_blood,
                })
            }
            JeopardyCommand::UnlockHint {
                competitor,
                challenge_id,
                hint_id,
                score_sequence,
            } => {
                let challenge = self
                    .challenges
                    .get(&challenge_id)
                    .ok_or(DomainError::NotFound)?;
                let hint = challenge
                    .hints
                    .iter()
                    .find(|hint| hint.id == hint_id)
                    .ok_or(DomainError::NotFound)?;
                if !self
                    .hint_unlocks
                    .insert((challenge_id, hint_id, competitor))
                {
                    return Err(DomainError::Conflict("hint already unlocked".into()));
                }
                let scores = (hint.cost != 0)
                    .then_some(ScoreEntry {
                        event_id,
                        competitor,
                        division_id: None,
                        sequence: score_sequence,
                        points: -hint.cost,
                        reason: ScoreReason::Hint {
                            challenge_id,
                            hint_id,
                        },
                        occurred_at: now,
                        hidden_by_freeze: false,
                    })
                    .into_iter()
                    .collect();
                Ok(JeopardyResult {
                    outcome: None,
                    scores,
                    first_blood: false,
                })
            }
        }
    }
}

/// JSON adapter for Jeopardy; typed commands are used by the API service.
pub struct JeopardyMode;

impl GameMode for JeopardyMode {
    fn key(&self) -> &'static str {
        "jeopardy"
    }

    fn initial_state(&self, _event_id: EventId) -> serde_json::Value {
        serde_json::to_value(JeopardyState::default()).expect("serializable state")
    }

    fn apply(
        &self,
        _event_id: EventId,
        _state: &serde_json::Value,
        _command: ModeCommand,
    ) -> DomainResult<ModeTransition> {
        Err(DomainError::Validation(
            "Jeopardy commands require the secret-aware typed service".into(),
        ))
    }

    fn public_state(&self, state: &serde_json::Value) -> DomainResult<serde_json::Value> {
        let mut state: JeopardyState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        state.answers.clear();
        serde_json::to_value(state).map_err(|error| DomainError::Validation(error.to_string()))
    }

    fn admin_controls(&self) -> &'static [&'static str] {
        &["publish", "hide", "freeze", "unfreeze", "recalculate"]
    }
}

/// KotH objective configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KothObjective {
    /// Identifier.
    pub id: ObjectiveId,
    /// Display name.
    pub name: String,
    /// Points per held tick.
    pub points_per_tick: i64,
    /// Claim proof digest.
    pub claim_digest: Vec<u8>,
}

/// Live holder of one objective.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectiveHold {
    /// Holding team.
    pub team_id: TeamId,
    /// Claim time.
    pub claimed_at: DateTime<Utc>,
    /// Most recent defense time.
    pub defended_at: DateTime<Utc>,
}

/// Deterministic KotH state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct KothState {
    /// Objective configuration.
    pub objectives: BTreeMap<ObjectiveId, KothObjective>,
    /// Current holders.
    pub holds: BTreeMap<ObjectiveId, ObjectiveHold>,
    /// Last completed tick sequence.
    pub tick: u64,
}

impl KothState {
    /// Claims or refreshes an objective after verifying its secret proof.
    pub fn claim(
        &mut self,
        objective_id: ObjectiveId,
        team_id: TeamId,
        proof: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<bool> {
        let objective = self
            .objectives
            .get(&objective_id)
            .ok_or(DomainError::NotFound)?;
        let candidate = Sha256::digest(proof.trim().as_bytes());
        if !bool::from(subtle::ConstantTimeEq::ct_eq(
            objective.claim_digest.as_slice(),
            candidate.as_slice(),
        )) {
            return Err(DomainError::Forbidden);
        }
        let changed = self
            .holds
            .get(&objective_id)
            .is_none_or(|hold| hold.team_id != team_id);
        self.holds
            .entry(objective_id)
            .and_modify(|hold| {
                if hold.team_id == team_id {
                    hold.defended_at = now;
                } else {
                    *hold = ObjectiveHold {
                        team_id,
                        claimed_at: now,
                        defended_at: now,
                    };
                }
            })
            .or_insert(ObjectiveHold {
                team_id,
                claimed_at: now,
                defended_at: now,
            });
        Ok(changed)
    }

    /// Scores all held objectives exactly once for the next tick.
    pub fn tick(
        &mut self,
        event_id: EventId,
        sequence_start: u64,
        now: DateTime<Utc>,
    ) -> Vec<ScoreEntry> {
        self.tick = self.tick.saturating_add(1);
        self.holds
            .iter()
            .enumerate()
            .filter_map(|(index, (objective_id, hold))| {
                let objective = self.objectives.get(objective_id)?;
                Some(ScoreEntry {
                    event_id,
                    competitor: CompetitorId::Team(hold.team_id),
                    division_id: None,
                    sequence: sequence_start
                        .saturating_add(u64::try_from(index).unwrap_or(u64::MAX)),
                    points: objective.points_per_tick,
                    reason: ScoreReason::KothTick {
                        objective: objective.name.clone(),
                    },
                    occurred_at: now,
                    hidden_by_freeze: false,
                })
            })
            .collect()
    }
}

/// KotH mode registration.
pub struct KothMode;

impl GameMode for KothMode {
    fn key(&self) -> &'static str {
        "koth"
    }

    fn initial_state(&self, _event_id: EventId) -> serde_json::Value {
        serde_json::to_value(KothState::default()).expect("serializable state")
    }

    fn apply(
        &self,
        event_id: EventId,
        state: &serde_json::Value,
        command: ModeCommand,
    ) -> DomainResult<ModeTransition> {
        let mut state: KothState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        if command.kind != "tick" {
            return Err(DomainError::Validation("unknown KotH command".into()));
        }
        let sequence = command
            .payload
            .get("score_sequence")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| DomainError::Validation("score_sequence is required".into()))?;
        let scores = state.tick(event_id, sequence, command.now);
        Ok(ModeTransition {
            state: serde_json::to_value(&state)
                .map_err(|error| DomainError::Validation(error.to_string()))?,
            response: serde_json::json!({"tick": state.tick, "entries": scores.len()}),
            scores,
        })
    }

    fn public_state(&self, state: &serde_json::Value) -> DomainResult<serde_json::Value> {
        let state: KothState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        Ok(serde_json::json!({
            "objectives": state.objectives.values().map(|objective| serde_json::json!({
                "id": objective.id,
                "name": objective.name,
                "points_per_tick": objective.points_per_tick,
                "holder": state.holds.get(&objective.id),
            })).collect::<Vec<_>>(),
            "tick": state.tick,
        }))
    }

    fn admin_controls(&self) -> &'static [&'static str] {
        &["start_ticks", "pause_ticks", "release_hold", "score_tick"]
    }
}

/// A&D service definition.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttackDefenseService {
    /// Stable key.
    pub key: String,
    /// Human-readable name.
    pub name: String,
    /// Vulnerable service image/template.
    pub instance_template: String,
    /// Attack points for one accepted opponent flag.
    pub attack_points: i64,
    /// Defense points when the team keeps its flag uncompromised for a tick.
    pub defense_points: i64,
    /// SLA points for a healthy checker result.
    pub sla_points: i64,
}

/// One checker outcome for a team service and tick.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CheckerResult {
    /// Team.
    pub team_id: TeamId,
    /// Service key.
    pub service: String,
    /// Service accepted functional checks.
    pub healthy: bool,
    /// Bounded diagnostic, without flag contents.
    pub message: String,
}

/// A decoded rotating attack flag.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlagClaim {
    /// Owner team.
    pub owner: TeamId,
    /// Service key.
    pub service: String,
    /// Tick in which it was issued.
    pub tick: u64,
}

/// HMAC flag issuer; only authenticated opaque flags leave the boundary.
pub struct FlagIssuer {
    secret: SecretString,
}

impl FlagIssuer {
    /// Creates an issuer from a high-entropy server secret.
    pub fn new(secret: SecretString) -> DomainResult<Self> {
        if secret.expose_secret().len() < 32 {
            return Err(DomainError::Validation(
                "flag issuer secret must be at least 32 bytes".into(),
            ));
        }
        Ok(Self { secret })
    }

    /// Creates a self-authenticating, tick-bound flag.
    pub fn issue(&self, claim: &FlagClaim) -> String {
        use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
        let body = format!("{}:{}:{}", claim.owner, claim.service, claim.tick);
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret.expose_secret().as_bytes())
            .expect("HMAC accepts any key size");
        mac.update(body.as_bytes());
        let signature = mac.finalize().into_bytes();
        format!(
            "KIT{{{}}}.{}",
            URL_SAFE_NO_PAD.encode(body),
            URL_SAFE_NO_PAD.encode(signature)
        )
    }

    /// Authenticates and decodes a flag without database lookup.
    pub fn verify(&self, flag: &str) -> DomainResult<FlagClaim> {
        use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
        let contents = flag
            .strip_prefix("KIT{")
            .and_then(|value| value.split_once("}."))
            .ok_or(DomainError::Forbidden)?;
        let body = URL_SAFE_NO_PAD
            .decode(contents.0)
            .map_err(|_| DomainError::Forbidden)?;
        let signature = URL_SAFE_NO_PAD
            .decode(contents.1)
            .map_err(|_| DomainError::Forbidden)?;
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret.expose_secret().as_bytes())
            .expect("HMAC accepts any key size");
        mac.update(&body);
        mac.verify_slice(&signature)
            .map_err(|_| DomainError::Forbidden)?;
        let body = String::from_utf8(body).map_err(|_| DomainError::Forbidden)?;
        let mut parts = body.splitn(3, ':');
        let owner = parts
            .next()
            .and_then(|value| Uuid::parse_str(value).ok())
            .map(TeamId)
            .ok_or(DomainError::Forbidden)?;
        let service = parts
            .next()
            .filter(|value| !value.is_empty())
            .ok_or(DomainError::Forbidden)?;
        let tick = parts
            .next()
            .and_then(|value| value.parse::<u64>().ok())
            .ok_or(DomainError::Forbidden)?;
        Ok(FlagClaim {
            owner,
            service: service.into(),
            tick,
        })
    }
}

/// Attack/Defense state and anti-replay register.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AttackDefenseState {
    /// Service definitions.
    pub services: BTreeMap<String, AttackDefenseService>,
    /// Registered teams.
    pub teams: BTreeSet<TeamId>,
    /// Current tick.
    pub tick: u64,
    /// Number of earlier ticks whose flags remain acceptable.
    pub expiry_window: u64,
    /// Digest of every accepted flag submission.
    pub accepted_flags: BTreeSet<Vec<u8>>,
    /// Owners whose service flag was stolen in each tick.
    pub compromised: BTreeSet<(u64, String, TeamId)>,
}

impl AttackDefenseState {
    /// Validates and records an attack submission.
    pub fn submit_flag(
        &mut self,
        issuer: &FlagIssuer,
        attacker: TeamId,
        flag: &str,
    ) -> DomainResult<(SubmissionOutcome, Option<FlagClaim>)> {
        let claim = issuer.verify(flag)?;
        if claim.owner == attacker {
            return Ok((SubmissionOutcome::OwnFlag, None));
        }
        if !self.teams.contains(&attacker) || !self.teams.contains(&claim.owner) {
            return Err(DomainError::Forbidden);
        }
        if !self.services.contains_key(&claim.service) {
            return Ok((SubmissionOutcome::Incorrect, None));
        }
        if claim.tick > self.tick || self.tick.saturating_sub(claim.tick) > self.expiry_window {
            return Ok((SubmissionOutcome::Expired, None));
        }
        let digest = Sha256::digest(flag.as_bytes()).to_vec();
        if !self.accepted_flags.insert(digest) {
            return Ok((SubmissionOutcome::Duplicate, None));
        }
        self.compromised
            .insert((claim.tick, claim.service.clone(), claim.owner));
        Ok((SubmissionOutcome::Correct, Some(claim)))
    }

    /// Completes one tick and emits defense/SLA entries from checker results.
    pub fn complete_tick(
        &mut self,
        event_id: EventId,
        checks: &[CheckerResult],
        sequence_start: u64,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<ScoreEntry>> {
        let completed_tick = self.tick;
        let mut scores = Vec::new();
        for check in checks {
            if !self.teams.contains(&check.team_id) {
                return Err(DomainError::Validation("checker team is unknown".into()));
            }
            let service = self
                .services
                .get(&check.service)
                .ok_or_else(|| DomainError::Validation("checker service is unknown".into()))?;
            if !self
                .compromised
                .contains(&(completed_tick, check.service.clone(), check.team_id))
            {
                scores.push(ScoreEntry {
                    event_id,
                    competitor: CompetitorId::Team(check.team_id),
                    division_id: None,
                    sequence: sequence_start
                        .saturating_add(u64::try_from(scores.len()).unwrap_or(u64::MAX)),
                    points: service.defense_points,
                    reason: ScoreReason::Defense,
                    occurred_at: now,
                    hidden_by_freeze: false,
                });
            }
            if check.healthy {
                scores.push(ScoreEntry {
                    event_id,
                    competitor: CompetitorId::Team(check.team_id),
                    division_id: None,
                    sequence: sequence_start
                        .saturating_add(u64::try_from(scores.len()).unwrap_or(u64::MAX)),
                    points: service.sla_points,
                    reason: ScoreReason::Sla,
                    occurred_at: now,
                    hidden_by_freeze: false,
                });
            }
        }
        self.tick = self.tick.saturating_add(1);
        Ok(scores)
    }
}

/// Attack/Defense mode registration.
pub struct AttackDefenseMode;

impl GameMode for AttackDefenseMode {
    fn key(&self) -> &'static str {
        "attack_defense"
    }

    fn initial_state(&self, _event_id: EventId) -> serde_json::Value {
        serde_json::to_value(AttackDefenseState::default()).expect("serializable state")
    }

    fn apply(
        &self,
        _event_id: EventId,
        _state: &serde_json::Value,
        _command: ModeCommand,
    ) -> DomainResult<ModeTransition> {
        Err(DomainError::Validation(
            "A&D commands require secret-aware typed services".into(),
        ))
    }

    fn public_state(&self, state: &serde_json::Value) -> DomainResult<serde_json::Value> {
        let mut state: AttackDefenseState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        state.accepted_flags.clear();
        serde_json::to_value(state).map_err(|error| DomainError::Validation(error.to_string()))
    }

    fn admin_controls(&self) -> &'static [&'static str] {
        &[
            "start",
            "pause",
            "rotate_flags",
            "run_checkers",
            "advance_tick",
        ]
    }
}

/// Non-competitive lesson progress.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct WorkshopState {
    /// Ordered lesson keys.
    pub lessons: Vec<String>,
    /// Completed lesson keys by learner.
    pub progress: BTreeMap<UserId, BTreeSet<String>>,
}

/// Minimal proof that modes need neither competition identity nor scoring.
pub struct WorkshopMode;

impl GameMode for WorkshopMode {
    fn key(&self) -> &'static str {
        "workshop"
    }

    fn initial_state(&self, _event_id: EventId) -> serde_json::Value {
        serde_json::to_value(WorkshopState::default()).expect("serializable state")
    }

    fn apply(
        &self,
        _event_id: EventId,
        state: &serde_json::Value,
        command: ModeCommand,
    ) -> DomainResult<ModeTransition> {
        let mut state: WorkshopState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        if command.kind != "complete_lesson" {
            return Err(DomainError::Validation("unknown workshop command".into()));
        }
        let user = command
            .payload
            .get("user_id")
            .and_then(serde_json::Value::as_str)
            .and_then(|value| Uuid::parse_str(value).ok())
            .map(UserId)
            .ok_or_else(|| DomainError::Validation("valid user_id is required".into()))?;
        let lesson = command
            .payload
            .get("lesson")
            .and_then(serde_json::Value::as_str)
            .filter(|lesson| state.lessons.iter().any(|known| known == lesson))
            .ok_or_else(|| DomainError::Validation("known lesson is required".into()))?;
        let newly_completed = state
            .progress
            .entry(user)
            .or_default()
            .insert(lesson.into());
        Ok(ModeTransition {
            state: serde_json::to_value(&state)
                .map_err(|error| DomainError::Validation(error.to_string()))?,
            scores: Vec::new(),
            response: serde_json::json!({"completed": newly_completed}),
        })
    }

    fn public_state(&self, state: &serde_json::Value) -> DomainResult<serde_json::Value> {
        let state: WorkshopState = serde_json::from_value(state.clone())
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        Ok(serde_json::json!({"lessons": state.lessons}))
    }

    fn admin_controls(&self) -> &'static [&'static str] {
        &["publish_lesson", "reorder_lessons", "reset_progress"]
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use crate::{
        challenge::{ChallengeKind, ChallengeState, Hint, VisibilityRule},
        identity::{ChallengeId, OrganizationId},
        scoring::ScoringRule,
    };

    use super::*;

    fn challenge(event_id: EventId) -> (Challenge, Vec<AnswerRule>) {
        let challenge = Challenge {
            id: ChallengeId::new(),
            event_id,
            name: "Foxfire".into(),
            category: "crypto".into(),
            description: "Recover the spark".into(),
            kind: ChallengeKind::StaticFlag,
            state: ChallengeState::Published,
            scoring: ScoringRule::Dynamic {
                initial: 500,
                minimum: 100,
                decay: 50,
            },
            visibility: VisibilityRule::default(),
            tags: BTreeSet::new(),
            hints: vec![Hint {
                id: 1,
                content: "Watch the nonce".into(),
                cost: 10,
            }],
            max_attempts: Some(3),
            writeups_enabled: true,
            survey: Vec::new(),
        };
        let answers = vec![AnswerRule::exact(SecretString::from("KIT{spark}"), false)];
        (challenge, answers)
    }

    #[test]
    fn jeopardy_awards_first_blood_once() {
        let event = EventId::new();
        let (challenge, answers) = challenge(event);
        let id = challenge.id;
        let mut state = JeopardyState::default();
        state
            .apply(
                event,
                JeopardyCommand::UpsertChallenge { challenge, answers },
                Utc::now(),
            )
            .expect("author");
        let first = state
            .apply(
                event,
                JeopardyCommand::Submit {
                    competitor: CompetitorId::Team(TeamId::new()),
                    challenge_id: id,
                    answer: "KIT{spark}".into(),
                    division: None,
                    score_sequence: 1,
                    first_blood_bonus: 25,
                },
                Utc::now(),
            )
            .expect("submit");
        let second = state
            .apply(
                event,
                JeopardyCommand::Submit {
                    competitor: CompetitorId::Team(TeamId::new()),
                    challenge_id: id,
                    answer: "KIT{spark}".into(),
                    division: None,
                    score_sequence: 3,
                    first_blood_bonus: 25,
                },
                Utc::now(),
            )
            .expect("submit");
        assert!(first.first_blood);
        assert_eq!(first.scores.len(), 2);
        assert!(!second.first_blood);
        assert_eq!(second.scores.len(), 1);
    }

    #[test]
    fn attack_flags_reject_own_duplicate_and_expired() {
        let attacker = TeamId::new();
        let victim = TeamId::new();
        let issuer = FlagIssuer::new(SecretString::from("x".repeat(32))).expect("issuer");
        let mut state = AttackDefenseState {
            services: BTreeMap::from([(
                "web".into(),
                AttackDefenseService {
                    key: "web".into(),
                    name: "Web".into(),
                    instance_template: "web:v1".into(),
                    attack_points: 10,
                    defense_points: 5,
                    sla_points: 3,
                },
            )]),
            teams: BTreeSet::from([attacker, victim]),
            tick: 4,
            expiry_window: 1,
            ..AttackDefenseState::default()
        };
        let flag = issuer.issue(&FlagClaim {
            owner: victim,
            service: "web".into(),
            tick: 4,
        });
        assert_eq!(
            state.submit_flag(&issuer, attacker, &flag).expect("flag").0,
            SubmissionOutcome::Correct
        );
        assert_eq!(
            state.submit_flag(&issuer, attacker, &flag).expect("flag").0,
            SubmissionOutcome::Duplicate
        );
        let own = issuer.issue(&FlagClaim {
            owner: attacker,
            service: "web".into(),
            tick: 4,
        });
        assert_eq!(
            state.submit_flag(&issuer, attacker, &own).expect("flag").0,
            SubmissionOutcome::OwnFlag
        );
        let expired = issuer.issue(&FlagClaim {
            owner: victim,
            service: "web".into(),
            tick: 1,
        });
        assert_eq!(
            state
                .submit_flag(&issuer, attacker, &expired)
                .expect("flag")
                .0,
            SubmissionOutcome::Expired
        );
    }

    #[test]
    fn workshop_completes_without_score_entries() {
        let mode = WorkshopMode;
        let user = UserId::new();
        let state = serde_json::to_value(WorkshopState {
            lessons: vec!["intro".into()],
            progress: BTreeMap::new(),
        })
        .expect("state");
        let transition = mode
            .apply(
                EventId::new(),
                &state,
                ModeCommand {
                    kind: "complete_lesson".into(),
                    payload: serde_json::json!({"user_id": user, "lesson": "intro"}),
                    now: Utc::now(),
                },
            )
            .expect("complete");
        assert!(transition.scores.is_empty());
        assert_eq!(transition.response["completed"], true);
    }

    #[test]
    fn identifier_generation_is_unique() {
        assert_ne!(OrganizationId::new(), OrganizationId::new());
    }
}
