//! Event adapters, typed automation execution, safe egress, and signed webhooks.

pub mod automation;
pub mod egress;
pub mod local;
pub mod scoreboard_cache;
pub mod webhook;

pub use automation::{AutomationEngine, AutomationGraph, AutomationRun};
pub use egress::EgressPolicy;
pub use local::{InProcessCache, InProcessEventBus};
pub use scoreboard_cache::{ScoreboardInvalidatingEventBus, scoreboard_revision_key};
pub use webhook::{WebhookDelivery, WebhookDispatcher, WebhookEndpoint};
