//! Optional Kitsune integrations.

pub mod smtp;

pub use smtp::{SmtpConfig, SmtpNotifier, SmtpSecurity};

/// Crate readiness marker used while adapters are composed.
pub const CRATE_NAME: &str = "kitsune-integrations";
