//! Dynamic challenge instance lifecycle rules.

use serde::{Deserialize, Serialize};

use crate::{DomainError, DomainResult};

/// Provider-independent lifecycle for a challenge instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstanceState {
    /// Accepted by Kitsune but not yet sent to a provider.
    Requested,
    /// Provider resources are being created.
    Provisioning,
    /// Connection and flag are ready for the competitor.
    Ready,
    /// The lease exists but its most recent health check failed.
    Unhealthy,
    /// Deprovisioning has begun and new connections are blocked.
    Stopping,
    /// Provider resources are gone.
    Deleted,
    /// Provisioning or cleanup failed and needs reconciliation.
    Failed,
}

impl InstanceState {
    /// Stable persistence and event key.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Requested => "requested",
            Self::Provisioning => "provisioning",
            Self::Ready => "ready",
            Self::Unhealthy => "unhealthy",
            Self::Stopping => "stopping",
            Self::Deleted => "deleted",
            Self::Failed => "failed",
        }
    }

    /// Whether a previously issued flag remains eligible for submission.
    pub const fn accepts_flags(self) -> bool {
        matches!(self, Self::Ready | Self::Unhealthy)
    }

    /// Validates one provider-independent lifecycle transition.
    pub fn transition(self, next: Self) -> DomainResult<Self> {
        let allowed = matches!(
            (self, next),
            (Self::Requested, Self::Provisioning | Self::Failed)
                | (
                    Self::Provisioning | Self::Unhealthy,
                    Self::Ready | Self::Failed | Self::Stopping
                )
                | (Self::Ready, Self::Unhealthy | Self::Stopping | Self::Failed)
                | (Self::Stopping, Self::Deleted | Self::Failed)
                | (
                    Self::Failed,
                    Self::Provisioning | Self::Stopping | Self::Deleted
                )
        );
        if allowed {
            Ok(next)
        } else {
            Err(DomainError::Conflict(format!(
                "instance cannot transition from {} to {}",
                self.as_str(),
                next.as_str()
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::InstanceState;

    #[test]
    fn lifecycle_requires_cleanup_before_deletion() {
        assert_eq!(
            InstanceState::Ready.transition(InstanceState::Unhealthy),
            Ok(InstanceState::Unhealthy)
        );
        assert!(
            InstanceState::Ready
                .transition(InstanceState::Deleted)
                .is_err()
        );
        assert_eq!(
            InstanceState::Stopping.transition(InstanceState::Deleted),
            Ok(InstanceState::Deleted)
        );
    }
}
