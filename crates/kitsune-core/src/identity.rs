//! Organizations, events, people, teams, divisions, and brackets.

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DomainError, DomainResult};

macro_rules! id_type {
    ($name:ident) => {
        #[doc = concat!("Strongly typed identifier for ", stringify!($name), ".")]
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize,
        )]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            /// Generates a time-sortable UUIDv7 identifier.
            pub fn new() -> Self {
                Self(Uuid::now_v7())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

id_type!(OrganizationId);
id_type!(EventId);
id_type!(UserId);
id_type!(TeamId);
id_type!(DivisionId);
id_type!(BracketId);
id_type!(ChallengeId);
id_type!(ObjectiveId);
id_type!(SubmissionId);
id_type!(InstanceId);
id_type!(FlowId);
id_type!(PluginId);
id_type!(TokenId);
id_type!(NotificationId);

/// Custom profile field value after schema validation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CustomValue {
    /// Short or long text.
    Text(String),
    /// Boolean choice.
    Boolean(bool),
    /// Integer quantity.
    Integer(i64),
    /// A selected list of stable option keys.
    Options(Vec<String>),
}

/// Root tenant boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Organization {
    /// Identifier.
    pub id: OrganizationId,
    /// Display name.
    pub name: String,
    /// URL-safe tenant key.
    pub slug: String,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
}

/// Participation policy for an event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParticipationMode {
    /// Each user scores independently.
    Individual,
    /// Members score through a team.
    Team,
    /// The event permits both identities on explicitly compatible objectives.
    Hybrid,
}

/// Event lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventState {
    /// Organizer-only configuration.
    Draft,
    /// Visible before its start instant.
    Scheduled,
    /// Accepting gameplay actions.
    Live,
    /// Temporarily not accepting gameplay actions.
    Paused,
    /// Immutable competition result.
    Ended,
    /// Hidden from normal navigation while retained.
    Archived,
}

/// A competition, workshop, or hybrid activity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    /// Identifier.
    pub id: EventId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Display name.
    pub name: String,
    /// URL-safe event key.
    pub slug: String,
    /// Current lifecycle state.
    pub state: EventState,
    /// Scoring identity policy.
    pub participation: ParticipationMode,
    /// Scheduled start, if any.
    pub starts_at: Option<DateTime<Utc>>,
    /// Scheduled end, if any.
    pub ends_at: Option<DateTime<Utc>>,
    /// Maximum team size. `None` is unlimited.
    pub team_size_limit: Option<u16>,
    /// Enabled game-mode identifiers.
    pub modes: BTreeSet<String>,
}

impl Event {
    /// Validates lifecycle scheduling and mode availability.
    pub fn validate(&self) -> DomainResult<()> {
        if self.name.trim().is_empty() || self.slug.trim().is_empty() {
            return Err(DomainError::Validation(
                "event name and slug are required".into(),
            ));
        }
        if self.modes.is_empty() {
            return Err(DomainError::Validation(
                "event must enable at least one game mode".into(),
            ));
        }
        if self
            .starts_at
            .zip(self.ends_at)
            .is_some_and(|(start, end)| end <= start)
        {
            return Err(DomainError::Validation(
                "event end must be after its start".into(),
            ));
        }
        Ok(())
    }

    /// Returns whether gameplay is accepted at a timestamp.
    pub fn accepts_gameplay_at(&self, now: DateTime<Utc>) -> bool {
        self.state == EventState::Live
            && self.starts_at.is_none_or(|start| now >= start)
            && self.ends_at.is_none_or(|end| now < end)
    }
}

impl EventState {
    /// Validates an organizer-requested lifecycle transition. Repeating the
    /// current state is idempotent; historical events never become writable.
    pub fn transition_to(self, next: Self) -> DomainResult<Self> {
        let allowed = self == next
            || matches!(
                (self, next),
                (Self::Draft, Self::Scheduled | Self::Live | Self::Archived)
                    | (Self::Scheduled, Self::Draft | Self::Live | Self::Archived)
                    | (Self::Live, Self::Paused | Self::Ended)
                    | (Self::Paused, Self::Live | Self::Ended)
                    | (Self::Ended, Self::Archived)
            );
        if allowed {
            Ok(next)
        } else {
            Err(DomainError::Conflict(format!(
                "event cannot transition from {self:?} to {next:?}"
            )))
        }
    }
}

/// Player or operator account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    /// Identifier.
    pub id: UserId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Unique normalized email.
    pub email: String,
    /// Public display name.
    pub display_name: String,
    /// Whether email ownership has been verified.
    pub email_verified: bool,
    /// Whether authentication is blocked.
    pub disabled: bool,
    /// Typed custom data.
    pub custom_fields: BTreeMap<String, CustomValue>,
    /// Account creation timestamp.
    pub created_at: DateTime<Utc>,
}

/// A player collective within an organization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Team {
    /// Identifier.
    pub id: TeamId,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Display name.
    pub name: String,
    /// Join-code digest; plaintext codes are never persisted.
    pub invite_code_digest: Vec<u8>,
    /// Team membership.
    pub members: BTreeMap<UserId, TeamMember>,
    /// Typed custom data.
    pub custom_fields: BTreeMap<String, CustomValue>,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
}

/// Membership responsibilities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TeamMember {
    /// Member account.
    pub user_id: UserId,
    /// Captain can manage membership.
    pub captain: bool,
    /// Membership creation timestamp.
    pub joined_at: DateTime<Utc>,
}

impl Team {
    /// Adds a member while preserving the event's size and single-captain rules.
    pub fn add_member(
        &mut self,
        user_id: UserId,
        captain: bool,
        size_limit: Option<u16>,
        joined_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        if self.members.contains_key(&user_id) {
            return Err(DomainError::Conflict("user is already a member".into()));
        }
        if size_limit.is_some_and(|limit| self.members.len() >= usize::from(limit)) {
            return Err(DomainError::LimitExceeded("team size limit".into()));
        }
        if captain && self.members.values().any(|member| member.captain) {
            return Err(DomainError::Conflict("team already has a captain".into()));
        }
        self.members.insert(
            user_id,
            TeamMember {
                user_id,
                captain,
                joined_at,
            },
        );
        Ok(())
    }

    /// Transfers captaincy atomically to an existing member.
    pub fn transfer_captain(&mut self, target: UserId) -> DomainResult<()> {
        if !self.members.contains_key(&target) {
            return Err(DomainError::NotFound);
        }
        for member in self.members.values_mut() {
            member.captain = member.user_id == target;
        }
        Ok(())
    }
}

/// Scoreboard classification such as student or professional.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Division {
    /// Identifier.
    pub id: DivisionId,
    /// Event boundary.
    pub event_id: EventId,
    /// Display name.
    pub name: String,
    /// Stable ordering.
    pub position: i32,
}

/// Tournament grouping and advancement policy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bracket {
    /// Identifier.
    pub id: BracketId,
    /// Event boundary.
    pub event_id: EventId,
    /// Display name.
    pub name: String,
    /// Number of entrants advanced from this bracket.
    pub advancement_slots: u16,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captain_transfer_preserves_exactly_one_captain() {
        let first = UserId::new();
        let second = UserId::new();
        let mut team = Team {
            id: TeamId::new(),
            organization_id: OrganizationId::new(),
            name: "Foxes".into(),
            invite_code_digest: vec![1],
            members: BTreeMap::new(),
            custom_fields: BTreeMap::new(),
            created_at: Utc::now(),
        };
        team.add_member(first, true, Some(2), Utc::now())
            .expect("first member");
        team.add_member(second, false, Some(2), Utc::now())
            .expect("second member");
        team.transfer_captain(second).expect("transfer");
        assert!(!team.members[&first].captain);
        assert!(team.members[&second].captain);
    }

    #[test]
    fn event_rejects_inverted_schedule() {
        let now = Utc::now();
        let event = Event {
            id: EventId::new(),
            organization_id: OrganizationId::new(),
            name: "Night Hunt".into(),
            slug: "night-hunt".into(),
            state: EventState::Scheduled,
            participation: ParticipationMode::Team,
            starts_at: Some(now),
            ends_at: Some(now),
            team_size_limit: Some(4),
            modes: BTreeSet::from(["jeopardy".into()]),
        };
        assert!(event.validate().is_err());
    }

    #[test]
    fn event_lifecycle_prevents_reopening_history() {
        assert_eq!(
            EventState::Draft.transition_to(EventState::Live),
            Ok(EventState::Live)
        );
        assert_eq!(
            EventState::Paused.transition_to(EventState::Live),
            Ok(EventState::Live)
        );
        assert!(EventState::Ended.transition_to(EventState::Live).is_err());
        assert!(
            EventState::Archived
                .transition_to(EventState::Draft)
                .is_err()
        );
    }
}
