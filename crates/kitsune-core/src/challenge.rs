//! Challenge authoring and answer validation.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use regex::{Regex, RegexBuilder};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::{
    DomainError, DomainResult,
    identity::{ChallengeId, DivisionId, EventId},
    scoring::ScoringRule,
};

/// Challenge behavior implemented by core or a capability-bound plugin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum ChallengeKind {
    /// Text answer validated by one or more policies.
    StaticFlag,
    /// One selected answer from declared choices.
    MultipleChoice { choices: Vec<String> },
    /// Per-identity orchestrated service.
    DynamicInstance { template: String },
    /// Downloadable artifact is the primary challenge material.
    FileBacked,
    /// Organizer-managed remote TCP/HTTP service.
    RemoteService { connection: String },
    /// Submission enters a review queue.
    ManualVerification,
    /// Component-provided type with a stable registration key.
    Plugin { plugin: String, kind: String },
}

/// Authoring lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChallengeState {
    /// Only authors can see it.
    Draft,
    /// Testers and authors can see it.
    Testing,
    /// Visibility is controlled by the release window.
    Scheduled,
    /// Eligible players can see it.
    Published,
    /// Explicitly removed from players without deleting history.
    Hidden,
    /// Read-only historical content.
    Archived,
}

/// Visibility constraints evaluated in addition to lifecycle state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct VisibilityRule {
    /// Earliest release instant.
    pub visible_from: Option<DateTime<Utc>>,
    /// Hide instant.
    pub visible_until: Option<DateTime<Utc>>,
    /// Empty means all divisions.
    pub division_ids: BTreeSet<DivisionId>,
    /// All listed prerequisite challenges must be solved.
    pub prerequisites: BTreeSet<ChallengeId>,
}

impl VisibilityRule {
    /// Determines player visibility for a concrete context.
    pub fn allows(
        &self,
        at: DateTime<Utc>,
        division: Option<DivisionId>,
        solves: &BTreeSet<ChallengeId>,
    ) -> bool {
        self.visible_from.is_none_or(|start| at >= start)
            && self.visible_until.is_none_or(|end| at < end)
            && (self.division_ids.is_empty()
                || division.is_some_and(|id| self.division_ids.contains(&id)))
            && self.prerequisites.is_subset(solves)
    }
}

/// Player-facing hint with an optional score cost.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hint {
    /// Stable ordering and key.
    pub id: u32,
    /// Hint body.
    pub content: String,
    /// Non-negative score cost.
    pub cost: i64,
}

/// A survey item offered after solve or writeup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SurveyQuestion {
    /// Stable key.
    pub key: String,
    /// Prompt.
    pub prompt: String,
    /// Allowed integer range, inclusive.
    pub range: Option<(i32, i32)>,
    /// Whether an answer is required.
    pub required: bool,
}

/// Player writeup lifecycle shared by the author and organizer review queue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WriteupState {
    /// Editable player work that has not entered review.
    Draft,
    /// Waiting for an organizer decision.
    Submitted,
    /// Organizer feedback requires another player revision.
    ChangesRequested,
    /// Accepted by an organizer but not publicly visible.
    Approved,
    /// Accepted and visible under the challenge's publication policy.
    Published,
}

impl WriteupState {
    /// Validates an author-controlled transition.
    pub fn author_transition(self, submit: bool) -> DomainResult<Self> {
        match (self, submit) {
            (Self::Draft | Self::ChangesRequested, false) => Ok(self),
            (Self::Draft | Self::ChangesRequested, true) => Ok(Self::Submitted),
            _ => Err(DomainError::Conflict(
                "writeup is locked while it is under organizer control".into(),
            )),
        }
    }

    /// Validates an organizer-controlled review transition.
    pub fn review_transition(self, next: Self) -> DomainResult<Self> {
        let allowed = matches!(
            (self, next),
            (Self::Submitted, Self::ChangesRequested | Self::Approved)
                | (Self::Approved, Self::ChangesRequested | Self::Published)
        );
        if allowed {
            Ok(next)
        } else {
            Err(DomainError::Conflict(format!(
                "writeup cannot transition from {self:?} to {next:?}"
            )))
        }
    }
}

/// Validates a response against the authored integer survey schema.
pub fn validate_survey_answers(
    questions: &[SurveyQuestion],
    answers: &BTreeMap<String, i32>,
) -> DomainResult<()> {
    let known_keys = questions
        .iter()
        .map(|question| question.key.as_str())
        .collect::<BTreeSet<_>>();
    if answers.keys().any(|key| !known_keys.contains(key.as_str())) {
        return Err(DomainError::Validation(
            "survey response contains an unknown question".into(),
        ));
    }
    for question in questions {
        let answer = answers.get(&question.key);
        if question.required && answer.is_none() {
            return Err(DomainError::Validation(format!(
                "survey question '{}' is required",
                question.key
            )));
        }
        if let (Some(value), Some((minimum, maximum))) = (answer, question.range)
            && !(minimum..=maximum).contains(value)
        {
            return Err(DomainError::Validation(format!(
                "survey answer '{}' must be between {minimum} and {maximum}",
                question.key
            )));
        }
    }
    Ok(())
}

/// Fully authored challenge aggregate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Challenge {
    /// Identifier.
    pub id: ChallengeId,
    /// Parent event.
    pub event_id: EventId,
    /// Display name.
    pub name: String,
    /// Category column.
    pub category: String,
    /// Markdown description.
    pub description: String,
    /// Challenge behavior.
    pub kind: ChallengeKind,
    /// Lifecycle state.
    pub state: ChallengeState,
    /// Score policy.
    pub scoring: ScoringRule,
    /// Visibility and unlock constraints.
    pub visibility: VisibilityRule,
    /// Tags.
    pub tags: BTreeSet<String>,
    /// Available hints.
    pub hints: Vec<Hint>,
    /// Optional bounded failures per identity.
    pub max_attempts: Option<u32>,
    /// Whether player writeup submission is enabled.
    pub writeups_enabled: bool,
    /// Post-solve survey schema.
    pub survey: Vec<SurveyQuestion>,
}

impl Challenge {
    /// Validates authoring invariants before persistence.
    pub fn validate(&self) -> DomainResult<()> {
        if self.name.trim().is_empty() || self.category.trim().is_empty() {
            return Err(DomainError::Validation(
                "challenge name and category are required".into(),
            ));
        }
        if self.max_attempts == Some(0) {
            return Err(DomainError::Validation(
                "max attempts must be positive".into(),
            ));
        }
        if self.hints.iter().any(|hint| hint.cost < 0) {
            return Err(DomainError::Validation(
                "hint cost cannot be negative".into(),
            ));
        }
        if self.visibility.prerequisites.contains(&self.id) {
            return Err(DomainError::Validation(
                "challenge cannot require itself".into(),
            ));
        }
        self.scoring.validate()
    }

    /// Player visibility including state and context rules.
    pub fn visible_to(
        &self,
        at: DateTime<Utc>,
        division: Option<DivisionId>,
        solves: &BTreeSet<ChallengeId>,
    ) -> bool {
        matches!(
            self.state,
            ChallengeState::Published | ChallengeState::Scheduled
        ) && self.visibility.allows(at, division, solves)
    }
}

/// Stored answer representation. Exact answers are one-way digests.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AnswerRule {
    /// SHA-256 digest of a normalized answer.
    ExactDigest {
        /// Digest bytes.
        digest: Vec<u8>,
        /// Lowercase before hashing.
        case_insensitive: bool,
    },
    /// Bounded regular expression.
    Regex {
        /// Pattern.
        pattern: String,
        /// Case-insensitive matching.
        case_insensitive: bool,
    },
    /// Exact selected choice.
    Choice { value: String },
    /// Per-identity flag. Validation is delegated to the flag issuer.
    Dynamic,
    /// Organizer approval required.
    Manual,
}

/// Answer evaluation outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnswerOutcome {
    /// Answer is correct.
    Correct,
    /// Answer is incorrect.
    Incorrect,
    /// Requires asynchronous manual review.
    PendingReview,
    /// Requires a dynamic issuer/verifier.
    RequiresDynamicVerification,
}

impl AnswerRule {
    /// Creates an exact answer rule without retaining the plaintext.
    pub fn exact(answer: SecretString, case_insensitive: bool) -> Self {
        let digest = answer_digest(answer.expose_secret(), case_insensitive);
        Self::ExactDigest {
            digest: digest.to_vec(),
            case_insensitive,
        }
    }

    /// Validates safe bounds and syntax for authored patterns.
    pub fn validate(&self) -> DomainResult<()> {
        if let Self::Regex { pattern, .. } = self {
            if pattern.len() > 2_048 {
                return Err(DomainError::Validation("regex is too large".into()));
            }
            Regex::new(pattern)
                .map_err(|error| DomainError::Validation(format!("invalid regex: {error}")))?;
        }
        Ok(())
    }

    /// Evaluates an answer using constant-time digest comparison where possible.
    pub fn evaluate(&self, answer: &str) -> DomainResult<AnswerOutcome> {
        self.validate()?;
        match self {
            Self::ExactDigest {
                digest,
                case_insensitive,
            } => {
                let submitted = answer_digest(answer, *case_insensitive);
                Ok(if digest.as_slice().ct_eq(&submitted).into() {
                    AnswerOutcome::Correct
                } else {
                    AnswerOutcome::Incorrect
                })
            }
            Self::Regex {
                pattern,
                case_insensitive,
            } => {
                let regex = RegexBuilder::new(pattern)
                    .case_insensitive(*case_insensitive)
                    .size_limit(1 << 20)
                    .dfa_size_limit(1 << 20)
                    .build()
                    .map_err(|error| DomainError::Validation(format!("invalid regex: {error}")))?;
                Ok(if regex.is_match(answer.trim()) {
                    AnswerOutcome::Correct
                } else {
                    AnswerOutcome::Incorrect
                })
            }
            Self::Choice { value } => Ok(if value == answer {
                AnswerOutcome::Correct
            } else {
                AnswerOutcome::Incorrect
            }),
            Self::Dynamic => Ok(AnswerOutcome::RequiresDynamicVerification),
            Self::Manual => Ok(AnswerOutcome::PendingReview),
        }
    }
}

fn answer_digest(answer: &str, case_insensitive: bool) -> [u8; 32] {
    let normalized = if case_insensitive {
        answer.trim().to_lowercase()
    } else {
        answer.trim().to_owned()
    };
    Sha256::digest(normalized.as_bytes()).into()
}

/// Validates that the complete prerequisite graph is acyclic.
pub fn validate_prerequisite_graph(challenges: &[Challenge]) -> DomainResult<()> {
    use std::collections::BTreeMap;

    fn visit(
        id: ChallengeId,
        graph: &BTreeMap<ChallengeId, BTreeSet<ChallengeId>>,
        visiting: &mut BTreeSet<ChallengeId>,
        visited: &mut BTreeSet<ChallengeId>,
    ) -> bool {
        if visited.contains(&id) {
            return true;
        }
        if !visiting.insert(id) {
            return false;
        }
        if graph
            .get(&id)
            .into_iter()
            .flatten()
            .any(|dependency| !visit(*dependency, graph, visiting, visited))
        {
            return false;
        }
        visiting.remove(&id);
        visited.insert(id);
        true
    }

    let graph: BTreeMap<_, _> = challenges
        .iter()
        .map(|challenge| (challenge.id, challenge.visibility.prerequisites.clone()))
        .collect();
    let known: BTreeSet<_> = graph.keys().copied().collect();
    if graph
        .values()
        .flatten()
        .any(|dependency| !known.contains(dependency))
    {
        return Err(DomainError::Validation(
            "prerequisite refers to an unknown challenge".into(),
        ));
    }
    let mut visiting = BTreeSet::new();
    let mut visited = BTreeSet::new();
    if graph
        .keys()
        .any(|id| !visit(*id, &graph, &mut visiting, &mut visited))
    {
        return Err(DomainError::Validation(
            "prerequisite graph contains a cycle".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use secrecy::SecretString;

    use super::*;

    #[test]
    fn exact_flags_are_trimmed_and_optionally_case_insensitive() {
        let rule = AnswerRule::exact(SecretString::from("FOX{Spark}"), true);
        assert_eq!(
            rule.evaluate("  fox{spark}  ").expect("evaluate"),
            AnswerOutcome::Correct
        );
        assert!(!format!("{rule:?}").contains("FOX{Spark}"));
    }

    #[test]
    fn regex_flags_are_anchorable_and_bounded() {
        let rule = AnswerRule::Regex {
            pattern: r"^kit\{[0-9]{3}\}$".into(),
            case_insensitive: false,
        };
        assert_eq!(
            rule.evaluate("kit{123}").expect("evaluate"),
            AnswerOutcome::Correct
        );
        assert_eq!(
            rule.evaluate("xkit{123}").expect("evaluate"),
            AnswerOutcome::Incorrect
        );
    }

    #[test]
    fn writeup_lifecycle_separates_author_and_reviewer_control() {
        assert_eq!(
            WriteupState::Draft.author_transition(true),
            Ok(WriteupState::Submitted)
        );
        assert_eq!(
            WriteupState::Submitted.review_transition(WriteupState::Approved),
            Ok(WriteupState::Approved)
        );
        assert_eq!(
            WriteupState::Approved.review_transition(WriteupState::Published),
            Ok(WriteupState::Published)
        );
        assert!(WriteupState::Submitted.author_transition(false).is_err());
        assert!(
            WriteupState::Submitted
                .review_transition(WriteupState::Published)
                .is_err()
        );
    }

    #[test]
    fn survey_validation_enforces_schema_and_ranges() {
        let questions = vec![SurveyQuestion {
            key: "difficulty".into(),
            prompt: "How difficult?".into(),
            range: Some((1, 5)),
            required: true,
        }];
        assert!(validate_survey_answers(&questions, &BTreeMap::new()).is_err());
        assert!(
            validate_survey_answers(&questions, &BTreeMap::from([("difficulty".into(), 6)]))
                .is_err()
        );
        assert!(
            validate_survey_answers(&questions, &BTreeMap::from([("difficulty".into(), 4)]))
                .is_ok()
        );
    }
}
