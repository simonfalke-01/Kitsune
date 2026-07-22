//! Pure scoring strategies and append-only score ledger replay.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    DomainError, DomainResult,
    identity::{ChallengeId, DivisionId, EventId, TeamId, UserId},
};

/// Identity credited by a score entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum CompetitorId {
    /// Individual player.
    User(UserId),
    /// Team.
    Team(TeamId),
}

/// Built-in or plugin-provided scoring configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScoringRule {
    /// Unchanging solve value.
    Static { points: i64 },
    /// CTF-style solve-count decay with a floor.
    Dynamic {
        /// Starting score.
        initial: i64,
        /// Minimum score.
        minimum: i64,
        /// Solve count at which the score reaches the floor.
        decay: u64,
    },
    /// Capability-bound plugin strategy.
    Plugin { plugin: String, strategy: String },
}

impl ScoringRule {
    /// Validates a rule before use.
    pub fn validate(&self) -> DomainResult<()> {
        match self {
            Self::Static { points } if *points < 0 => Err(DomainError::Validation(
                "static points cannot be negative".into(),
            )),
            Self::Dynamic {
                initial,
                minimum,
                decay,
            } if *minimum < 0 || minimum > initial || *decay == 0 => Err(DomainError::Validation(
                "invalid dynamic scoring bounds".into(),
            )),
            Self::Plugin { plugin, strategy }
                if plugin.trim().is_empty() || strategy.trim().is_empty() =>
            {
                Err(DomainError::Validation(
                    "plugin scoring key is required".into(),
                ))
            }
            _ => Ok(()),
        }
    }
}

/// Pure strategy interface. Plugin calls adapt into the same deterministic API.
pub trait ScoringStrategy: Send + Sync {
    /// Returns points for the next solve, where `prior_solves` excludes it.
    fn solve_value(&self, prior_solves: u64) -> DomainResult<i64>;
}

impl ScoringStrategy for ScoringRule {
    fn solve_value(&self, prior_solves: u64) -> DomainResult<i64> {
        self.validate()?;
        match *self {
            Self::Static { points } => Ok(points),
            Self::Dynamic {
                initial,
                minimum,
                decay,
            } => {
                let progress = i128::from(prior_solves.min(decay));
                let range = i128::from(initial - minimum);
                let denominator = i128::from(decay);
                let reduction = (range * progress * progress) / (denominator * denominator);
                let value = i128::from(initial) - reduction;
                i64::try_from(value.max(i128::from(minimum)))
                    .map_err(|_| DomainError::Validation("score overflow".into()))
            }
            Self::Plugin { .. } => Err(DomainError::Unavailable(
                "plugin strategy requires the plugin host".into(),
            )),
        }
    }
}

/// Why a score changed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScoreReason {
    /// Challenge solve.
    Solve { challenge_id: ChallengeId },
    /// First solve bonus.
    FirstBlood { challenge_id: ChallengeId },
    /// Hint economy charge.
    Hint {
        challenge_id: ChallengeId,
        hint_id: u32,
    },
    /// KotH objective hold tick.
    KothTick { objective: String },
    /// A&D attack score.
    Attack,
    /// A&D defense score.
    Defense,
    /// A&D service-level score.
    Sla,
    /// Explicit organizer adjustment.
    Adjustment { reason: String },
    /// Reverses an earlier entry without deleting history.
    Reversal { entry_sequence: u64 },
}

/// Immutable score change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreEntry {
    /// Event boundary.
    pub event_id: EventId,
    /// Credited competitor.
    pub competitor: CompetitorId,
    /// Optional division snapshot.
    pub division_id: Option<DivisionId>,
    /// Monotonic sequence within an event.
    pub sequence: u64,
    /// Signed point delta.
    pub points: i64,
    /// Reason.
    pub reason: ScoreReason,
    /// Authoritative occurrence time.
    pub occurred_at: DateTime<Utc>,
    /// If true, hidden from frozen public boards until unfreeze.
    pub hidden_by_freeze: bool,
}

/// Materialized row with deterministic tie-break metadata.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScoreRow {
    /// Competitor.
    pub competitor: CompetitorId,
    /// Total score.
    pub score: i64,
    /// Instant this competitor most recently reached its final score.
    pub reached_at: DateTime<Utc>,
}

/// Replays the score ledger and returns score-descending, earliest-reach-first
/// rows. Frozen entries can be omitted for a public snapshot.
pub fn scoreboard(
    entries: &[ScoreEntry],
    division: Option<DivisionId>,
    include_frozen: bool,
) -> Vec<ScoreRow> {
    let mut values: BTreeMap<CompetitorId, (i64, DateTime<Utc>)> = BTreeMap::new();
    let mut reversed = BTreeSet::new();
    for entry in entries {
        if let ScoreReason::Reversal { entry_sequence } = entry.reason {
            reversed.insert(entry_sequence);
        }
    }
    let mut ordered: Vec<_> = entries.iter().collect();
    ordered.sort_by_key(|entry| entry.sequence);
    for entry in ordered {
        if reversed.contains(&entry.sequence)
            || (!include_frozen && entry.hidden_by_freeze)
            || division.is_some_and(|id| entry.division_id != Some(id))
            || matches!(entry.reason, ScoreReason::Reversal { .. })
        {
            continue;
        }
        let state = values
            .entry(entry.competitor)
            .or_insert((0, entry.occurred_at));
        state.0 = state.0.saturating_add(entry.points);
        state.1 = entry.occurred_at;
    }
    let mut rows: Vec<_> = values
        .into_iter()
        .map(|(competitor, (score, reached_at))| ScoreRow {
            competitor,
            score,
            reached_at,
        })
        .collect();
    rows.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.reached_at.cmp(&right.reached_at))
            .then_with(|| left.competitor.cmp(&right.competitor))
    });
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dynamic_decay_is_monotonic_and_floored() {
        let scoring = ScoringRule::Dynamic {
            initial: 500,
            minimum: 100,
            decay: 50,
        };
        let values: Vec<_> = (0..=100)
            .map(|solves| scoring.solve_value(solves).expect("score"))
            .collect();
        assert_eq!(values[0], 500);
        assert_eq!(values[50], 100);
        assert_eq!(values[100], 100);
        assert!(values.windows(2).all(|pair| pair[0] >= pair[1]));
    }

    #[test]
    fn tie_break_prefers_earliest_to_reach() {
        let event = EventId::new();
        let early = CompetitorId::User(UserId::new());
        let late = CompetitorId::User(UserId::new());
        let now = Utc::now();
        let entries = vec![
            ScoreEntry {
                event_id: event,
                competitor: late,
                division_id: None,
                sequence: 2,
                points: 100,
                reason: ScoreReason::Adjustment {
                    reason: "test".into(),
                },
                occurred_at: now + chrono::Duration::seconds(1),
                hidden_by_freeze: false,
            },
            ScoreEntry {
                event_id: event,
                competitor: early,
                division_id: None,
                sequence: 1,
                points: 100,
                reason: ScoreReason::Adjustment {
                    reason: "test".into(),
                },
                occurred_at: now,
                hidden_by_freeze: false,
            },
        ];
        assert_eq!(scoreboard(&entries, None, true)[0].competitor, early);
    }
}
