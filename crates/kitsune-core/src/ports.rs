//! Escape-hatch contracts for infrastructure owned outside the domain core.

use std::{collections::BTreeMap, pin::Pin, time::Duration};

use async_trait::async_trait;
use futures::Stream;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{DomainResult, EventEnvelope, events::AuditEntry};

/// Async stream returned by event subscriptions.
pub type EventStream = Pin<Box<dyn Stream<Item = EventEnvelope> + Send>>;

/// Authoritative persistence boundary. Feature repositories build on these
/// transaction/outbox primitives without leaking SQL into the domain.
#[async_trait]
pub trait DataStore: Send + Sync {
    /// Applies one serialized command atomically and appends its events to the
    /// durable outbox. Reusing an idempotency key returns the prior result.
    async fn transact(&self, command: PersistedCommand) -> DomainResult<CommandResult>;
    /// Loads an immutable audit page after an optional cursor.
    async fn audit_page(
        &self,
        organization: Uuid,
        after: Option<Uuid>,
        limit: u32,
    ) -> DomainResult<Vec<AuditEntry>>;
    /// Marks an outbox event delivered by one consumer.
    async fn acknowledge_event(&self, event_id: Uuid, consumer: &str) -> DomainResult<()>;
}

/// Transport-neutral atomic write request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PersistedCommand {
    /// Idempotency key.
    pub idempotency_key: Uuid,
    /// Optimistic aggregate version.
    pub expected_version: Option<u64>,
    /// Domain command key.
    pub kind: String,
    /// Versioned payload.
    pub payload: serde_json::Value,
    /// Events committed with the write.
    pub events: Vec<EventEnvelope>,
    /// Audit record committed with the write.
    pub audit: AuditEntry,
}

/// Persisted command receipt.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandResult {
    /// New aggregate version.
    pub version: u64,
    /// Safe response body.
    pub response: serde_json::Value,
    /// True when returned from an earlier identical request.
    pub replayed: bool,
}

/// Cache, session, and rate-limit store.
#[async_trait]
pub trait Cache: Send + Sync {
    /// Reads bytes by a namespaced key.
    async fn get(&self, key: &str) -> DomainResult<Option<Vec<u8>>>;
    /// Writes bytes with a required TTL.
    async fn put(&self, key: &str, value: Vec<u8>, ttl: Duration) -> DomainResult<()>;
    /// Removes a key.
    async fn remove(&self, key: &str) -> DomainResult<()>;
    /// Atomically increments a TTL-bound counter and returns its value.
    async fn increment(&self, key: &str, ttl: Duration) -> DomainResult<u64>;
}

/// Typed publish/subscribe backbone.
#[async_trait]
pub trait EventBus: Send + Sync {
    /// Publishes one envelope. Implementations must preserve its ID.
    async fn publish(&self, event: EventEnvelope) -> DomainResult<()>;
    /// Subscribes to matching stable event keys. Empty means all events.
    async fn subscribe(&self, kinds: &[String]) -> DomainResult<EventStream>;
}

/// Object metadata returned without loading the body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectMetadata {
    /// Byte length.
    pub size: u64,
    /// Media type.
    pub content_type: String,
    /// SHA-256 hex digest.
    pub sha256: String,
    /// Extension-defined safe attributes.
    pub attributes: BTreeMap<String, String>,
}

/// Local disk and S3-compatible blob boundary.
#[async_trait]
pub trait ObjectStore: Send + Sync {
    /// Writes a complete object using a normalized namespaced key.
    async fn put(
        &self,
        key: &str,
        body: Vec<u8>,
        content_type: &str,
    ) -> DomainResult<ObjectMetadata>;
    /// Reads a complete object. HTTP adapters apply range and response limits.
    async fn get(&self, key: &str) -> DomainResult<Option<Vec<u8>>>;
    /// Deletes an object idempotently.
    async fn delete(&self, key: &str) -> DomainResult<()>;
}

/// Notification delivery request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Notification {
    /// Stable template key.
    pub template: String,
    /// Recipient identity key.
    pub recipient: String,
    /// Safe template data.
    pub data: BTreeMap<String, String>,
    /// Deduplication key.
    pub idempotency_key: Uuid,
}

/// In-app, email, Discord, or composite notification delivery.
#[async_trait]
pub trait Notifier: Send + Sync {
    /// Delivers or durably queues a notification.
    async fn notify(&self, notification: Notification) -> DomainResult<()>;
}
