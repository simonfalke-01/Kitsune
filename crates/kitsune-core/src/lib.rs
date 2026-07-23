//! Domain rules for Kitsune.
//!
//! This crate is intentionally independent of HTTP, SQL, and concrete runtime
//! adapters so commands can be replayed and tested deterministically.

pub mod authz;
pub mod challenge;
pub mod config;
pub mod events;
pub mod identity;
pub mod instances;
pub mod modes;
pub mod ports;
pub mod scoring;

pub use challenge::{Challenge, ChallengeKind, ChallengeState};
pub use events::{DomainEvent, EventEnvelope};
pub use identity::{Bracket, Division, Event, Organization, Team, User};

use thiserror::Error;

/// Stable domain error vocabulary shared by all transports.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DomainError {
    /// A requested entity does not exist or is deliberately undisclosed.
    #[error("resource not found")]
    NotFound,
    /// The caller is authenticated but not authorized.
    #[error("permission denied")]
    Forbidden,
    /// The command conflicts with current aggregate state.
    #[error("state conflict: {0}")]
    Conflict(String),
    /// One or more input fields violate domain rules.
    #[error("invalid input: {0}")]
    Validation(String),
    /// A bounded resource or attempt budget has been exhausted.
    #[error("limit exceeded: {0}")]
    LimitExceeded(String),
    /// An optional capability is unavailable in the active configuration.
    #[error("capability unavailable: {0}")]
    Unavailable(String),
}

/// Result type for deterministic domain operations.
pub type DomainResult<T> = Result<T, DomainError>;
