//! Fine-grained, scoped role-based authorization.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::identity::{EventId, OrganizationId, TeamId, UserId};

/// A stable authorization operation. New permissions are additive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    /// Read public event content.
    EventRead,
    /// Change event configuration.
    EventManage,
    /// Read challenge content available to an actor.
    ChallengeRead,
    /// Author and publish challenges.
    ChallengeManage,
    /// Submit an answer or attack flag.
    SubmissionCreate,
    /// Review and moderate submissions.
    SubmissionManage,
    /// Read a visible scoreboard.
    ScoreboardRead,
    /// Freeze, hide, adjust, or replay scoring.
    ScoreboardManage,
    /// Create or manage a team.
    TeamManage,
    /// Manage identities and assignments.
    IdentityManage,
    /// Provision and operate instances.
    InstanceManage,
    /// Build and operate automations.
    AutomationManage,
    /// Install and grant plugin capabilities.
    PluginManage,
    /// Read audit history.
    AuditRead,
    /// Operate every organization.
    PlatformManage,
}

/// Named reusable permission bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Role {
    /// Stable role key.
    pub key: String,
    /// Human-readable label.
    pub name: String,
    /// Permissions granted by the role.
    pub permissions: BTreeSet<Permission>,
}

impl Role {
    /// Built-in player role.
    pub fn player() -> Self {
        Self {
            key: "player".into(),
            name: "Player".into(),
            permissions: BTreeSet::from([
                Permission::EventRead,
                Permission::ChallengeRead,
                Permission::SubmissionCreate,
                Permission::ScoreboardRead,
            ]),
        }
    }

    /// Built-in organizer role.
    pub fn organizer() -> Self {
        Self {
            key: "organizer".into(),
            name: "Organizer".into(),
            permissions: Permission::all_except_platform(),
        }
    }
}

impl Permission {
    fn all_except_platform() -> BTreeSet<Self> {
        [
            Self::EventRead,
            Self::EventManage,
            Self::ChallengeRead,
            Self::ChallengeManage,
            Self::SubmissionCreate,
            Self::SubmissionManage,
            Self::ScoreboardRead,
            Self::ScoreboardManage,
            Self::TeamManage,
            Self::IdentityManage,
            Self::InstanceManage,
            Self::AutomationManage,
            Self::PluginManage,
            Self::AuditRead,
        ]
        .into_iter()
        .collect()
    }
}

/// Optional scope attached to a role assignment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GrantScope {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Optional event narrowing.
    pub event_id: Option<EventId>,
    /// Optional team narrowing.
    pub team_id: Option<TeamId>,
}

/// Materialized assignment used by an authorization check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoleGrant {
    /// Principal.
    pub user_id: UserId,
    /// Named role.
    pub role: Role,
    /// Scope in which the role applies.
    pub scope: GrantScope,
}

/// Resource scope for the requested operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuthorizationTarget {
    /// Organization boundary.
    pub organization_id: OrganizationId,
    /// Event boundary when applicable.
    pub event_id: Option<EventId>,
    /// Team boundary when applicable.
    pub team_id: Option<TeamId>,
}

/// Returns true when at least one grant includes the permission and target.
pub fn is_allowed(
    actor: UserId,
    grants: &[RoleGrant],
    permission: Permission,
    target: AuthorizationTarget,
) -> bool {
    grants.iter().any(|grant| {
        grant.user_id == actor
            && grant.role.permissions.contains(&permission)
            && grant.scope.organization_id == target.organization_id
            && grant
                .scope
                .event_id
                .is_none_or(|event| Some(event) == target.event_id)
            && grant
                .scope
                .team_id
                .is_none_or(|team| Some(team) == target.team_id)
    }) || grants.iter().any(|grant| {
        grant.user_id == actor && grant.role.permissions.contains(&Permission::PlatformManage)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_grant_does_not_escape_its_event() {
        let user = UserId::new();
        let organization = OrganizationId::new();
        let event = EventId::new();
        let grant = RoleGrant {
            user_id: user,
            role: Role::organizer(),
            scope: GrantScope {
                organization_id: organization,
                event_id: Some(event),
                team_id: None,
            },
        };
        assert!(is_allowed(
            user,
            std::slice::from_ref(&grant),
            Permission::ChallengeManage,
            AuthorizationTarget {
                organization_id: organization,
                event_id: Some(event),
                team_id: None,
            }
        ));
        assert!(!is_allowed(
            user,
            &[grant],
            Permission::ChallengeManage,
            AuthorizationTarget {
                organization_id: organization,
                event_id: Some(EventId::new()),
                team_id: None,
            }
        ));
    }
}
