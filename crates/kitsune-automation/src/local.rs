//! Bounded zero-configuration cache and event adapters for lean mode.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, Instant},
};

use async_trait::async_trait;
use futures::{StreamExt, stream};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    ports::{Cache, EventBus, EventStream},
};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

#[derive(Debug, Clone)]
struct CacheEntry {
    value: Vec<u8>,
    expires_at: Instant,
}

/// Bounded process-local cache for lean and development deployments.
#[derive(Debug, Clone)]
pub struct InProcessCache {
    entries: Arc<Mutex<HashMap<String, CacheEntry>>>,
    capacity: usize,
}

impl InProcessCache {
    /// Constructs a cache with a hard entry bound.
    pub fn new(capacity: usize) -> DomainResult<Self> {
        if capacity == 0 {
            return Err(DomainError::Validation(
                "cache capacity must be positive".into(),
            ));
        }
        Ok(Self {
            entries: Arc::new(Mutex::new(HashMap::with_capacity(capacity))),
            capacity,
        })
    }

    fn entries(&self) -> DomainResult<MutexGuard<'_, HashMap<String, CacheEntry>>> {
        self.entries
            .lock()
            .map_err(|_| DomainError::Unavailable("local cache lock poisoned".into()))
    }

    fn prepare_insert(entries: &mut HashMap<String, CacheEntry>, capacity: usize, incoming: &str) {
        let now = Instant::now();
        entries.retain(|_, entry| entry.expires_at > now);
        if entries.len() >= capacity
            && !entries.contains_key(incoming)
            && let Some(oldest) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(key, _)| key.clone())
        {
            entries.remove(&oldest);
        }
    }
}

#[async_trait]
impl Cache for InProcessCache {
    async fn get(&self, key: &str) -> DomainResult<Option<Vec<u8>>> {
        let mut entries = self.entries()?;
        if entries
            .get(key)
            .is_some_and(|entry| entry.expires_at <= Instant::now())
        {
            entries.remove(key);
        }
        Ok(entries.get(key).map(|entry| entry.value.clone()))
    }

    async fn put(&self, key: &str, value: Vec<u8>, ttl: Duration) -> DomainResult<()> {
        if key.is_empty() || ttl.is_zero() {
            return Err(DomainError::Validation(
                "cache key and positive TTL are required".into(),
            ));
        }
        let mut entries = self.entries()?;
        Self::prepare_insert(&mut entries, self.capacity, key);
        entries.insert(
            key.into(),
            CacheEntry {
                value,
                expires_at: Instant::now() + ttl,
            },
        );
        Ok(())
    }

    async fn remove(&self, key: &str) -> DomainResult<()> {
        self.entries()?.remove(key);
        Ok(())
    }

    async fn increment(&self, key: &str, ttl: Duration) -> DomainResult<u64> {
        if key.is_empty() || ttl.is_zero() {
            return Err(DomainError::Validation(
                "cache key and positive TTL are required".into(),
            ));
        }
        let mut entries = self.entries()?;
        Self::prepare_insert(&mut entries, self.capacity, key);
        let now = Instant::now();
        let entry = entries.entry(key.into()).or_insert_with(|| CacheEntry {
            value: 0_u64.to_be_bytes().to_vec(),
            expires_at: now + ttl,
        });
        if entry.expires_at <= now {
            entry.value = 0_u64.to_be_bytes().to_vec();
            entry.expires_at = now + ttl;
        }
        let bytes: [u8; 8] = entry
            .value
            .as_slice()
            .try_into()
            .map_err(|_| DomainError::Conflict("cache counter has invalid encoding".into()))?;
        let value = u64::from_be_bytes(bytes).saturating_add(1);
        entry.value = value.to_be_bytes().to_vec();
        Ok(value)
    }
}

/// Tokio broadcast event bus for a lean single-node runtime.
#[derive(Debug, Clone)]
pub struct InProcessEventBus {
    sender: broadcast::Sender<EventEnvelope>,
}

impl InProcessEventBus {
    /// Creates a bus with bounded subscriber buffers.
    pub fn new(capacity: usize) -> DomainResult<Self> {
        if capacity < 16 {
            return Err(DomainError::Validation(
                "event buffer capacity must be at least 16".into(),
            ));
        }
        let (sender, _) = broadcast::channel(capacity);
        Ok(Self { sender })
    }
}

#[async_trait]
impl EventBus for InProcessEventBus {
    async fn publish(&self, event: EventEnvelope) -> DomainResult<()> {
        // No active subscriber is a valid state. PostgreSQL outbox persistence is
        // the durable source for consumers that require replay.
        let _ = self.sender.send(event);
        Ok(())
    }

    async fn subscribe(&self, kinds: &[String]) -> DomainResult<EventStream> {
        let kinds = kinds.to_vec();
        let stream = BroadcastStream::new(self.sender.subscribe()).filter_map(move |result| {
            let kinds = kinds.clone();
            async move {
                result.ok().filter(|event| {
                    kinds.is_empty() || kinds.iter().any(|kind| kind == event.kind())
                })
            }
        });
        Ok(Box::pin(stream::select(stream::empty(), stream)))
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use futures::StreamExt;
    use kitsune_core::{
        events::DomainEvent,
        identity::{OrganizationId, UserId},
        ports::{Cache, EventBus},
    };
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn cache_counters_are_atomic_and_ttl_bound() {
        let cache = InProcessCache::new(4).expect("cache");
        assert_eq!(
            cache
                .increment("login:a", Duration::from_secs(1))
                .await
                .expect("increment"),
            1
        );
        assert_eq!(
            cache
                .increment("login:a", Duration::from_secs(1))
                .await
                .expect("increment"),
            2
        );
        cache
            .put("value", vec![9], Duration::from_millis(1))
            .await
            .expect("put");
        tokio::time::sleep(Duration::from_millis(2)).await;
        assert_eq!(cache.get("value").await.expect("get"), None);
    }

    #[tokio::test]
    async fn bus_filters_by_stable_event_kind() {
        let bus = InProcessEventBus::new(16).expect("bus");
        let mut stream = bus
            .subscribe(&["identity.user.created".into()])
            .await
            .expect("subscribe");
        let organization = OrganizationId::new();
        let user = UserId::new();
        let event = EventEnvelope::new(
            organization,
            None,
            None,
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::UserCreated { user_id: user },
        );
        bus.publish(event.clone()).await.expect("publish");
        assert_eq!(stream.next().await.expect("event"), event);
    }
}
