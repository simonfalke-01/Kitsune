//! Bounded scoreboard-cache invalidation driven by typed domain events.

use std::{collections::BTreeSet, sync::Arc, time::Duration};

use async_trait::async_trait;
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    identity::{EventId, OrganizationId},
    ports::{Cache, EventBus, EventStream},
};
use tokio::{sync::mpsc, time::MissedTickBehavior};

const REVISION_TTL: Duration = Duration::from_hours(24);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct ScoreboardScope {
    organization_id: OrganizationId,
    event_id: EventId,
}

/// EventBus decorator that coalesces score-cache revisions without delaying fanout.
pub struct ScoreboardInvalidatingEventBus {
    inner: Arc<dyn EventBus>,
    cache: Arc<dyn Cache>,
    invalidations: mpsc::Sender<ScoreboardScope>,
}

impl std::fmt::Debug for ScoreboardInvalidatingEventBus {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ScoreboardInvalidatingEventBus")
            .finish_non_exhaustive()
    }
}

impl ScoreboardInvalidatingEventBus {
    /// Starts a bounded coalescing worker around an existing bus.
    pub fn new(
        inner: Arc<dyn EventBus>,
        cache: Arc<dyn Cache>,
        flush_interval: Duration,
        queue_capacity: usize,
    ) -> DomainResult<Self> {
        if flush_interval.is_zero() || queue_capacity == 0 {
            return Err(DomainError::Validation(
                "scoreboard invalidation requires a positive interval and queue capacity".into(),
            ));
        }
        let (invalidations, receiver) = mpsc::channel(queue_capacity);
        tokio::spawn(run_invalidator(
            receiver,
            Arc::clone(&cache),
            flush_interval,
        ));
        Ok(Self {
            inner,
            cache,
            invalidations,
        })
    }

    fn scope(event: &EventEnvelope) -> Option<ScoreboardScope> {
        let event_id = event.event_id?;
        matches!(event.kind(), "score.changed" | "scoreboard.control_changed").then_some(
            ScoreboardScope {
                organization_id: event.organization_id?,
                event_id,
            },
        )
    }
}

#[async_trait]
impl EventBus for ScoreboardInvalidatingEventBus {
    async fn publish(&self, event: EventEnvelope) -> DomainResult<()> {
        let scope = Self::scope(&event);
        let requires_immediate_consistency = event.kind() == "scoreboard.control_changed";
        self.inner.publish(event).await?;
        if let Some(scope) = scope {
            if requires_immediate_consistency {
                increment_revision(&self.cache, scope).await;
            } else if let Err(error) = self.invalidations.try_send(scope) {
                tracing::warn!(%error, "scoreboard invalidation queue is saturated");
            }
        }
        Ok(())
    }

    async fn subscribe(&self, kinds: &[String]) -> DomainResult<EventStream> {
        self.inner.subscribe(kinds).await
    }
}

/// Stable shared-cache revision key for one tenant event.
pub fn scoreboard_revision_key(organization_id: OrganizationId, event_id: EventId) -> String {
    format!("scoreboard:revision:{organization_id}:{event_id}")
}

async fn run_invalidator(
    mut receiver: mpsc::Receiver<ScoreboardScope>,
    cache: Arc<dyn Cache>,
    flush_interval: Duration,
) {
    let mut pending = BTreeSet::new();
    let mut ticker = tokio::time::interval(flush_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
    ticker.tick().await;
    loop {
        tokio::select! {
            scope = receiver.recv() => {
                let Some(scope) = scope else {
                    flush(&cache, &mut pending).await;
                    return;
                };
                pending.insert(scope);
            }
            _ = ticker.tick() => flush(&cache, &mut pending).await,
        }
    }
}

async fn flush(cache: &Arc<dyn Cache>, pending: &mut BTreeSet<ScoreboardScope>) {
    for scope in std::mem::take(pending) {
        increment_revision(cache, scope).await;
    }
}

async fn increment_revision(cache: &Arc<dyn Cache>, scope: ScoreboardScope) {
    let key = scoreboard_revision_key(scope.organization_id, scope.event_id);
    if let Err(error) = cache.increment(&key, REVISION_TTL).await {
        tracing::warn!(%error, %key, "scoreboard cache invalidation failed");
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use kitsune_core::{
        events::DomainEvent,
        identity::{OrganizationId, UserId},
        ports::{Cache, EventBus},
        scoring::CompetitorId,
    };
    use uuid::Uuid;

    use super::*;
    use crate::{InProcessCache, InProcessEventBus};

    #[tokio::test]
    async fn score_bursts_coalesce_into_one_shared_revision() {
        let cache = Arc::new(InProcessCache::new(32).expect("cache"));
        let inner = Arc::new(InProcessEventBus::new(16).expect("event bus"));
        let bus = ScoreboardInvalidatingEventBus::new(
            inner,
            cache.clone(),
            Duration::from_millis(10),
            16,
        )
        .expect("invalidating bus");
        let organization_id = OrganizationId::new();
        let event_id = EventId::new();
        let competitor = CompetitorId::User(UserId::new());

        for _ in 0..10 {
            let event = EventEnvelope::new(
                organization_id,
                Some(event_id),
                None,
                Uuid::now_v7(),
                Utc::now(),
                DomainEvent::ScoreChanged {
                    competitor,
                    delta: 100,
                },
            );
            bus.publish(event).await.expect("publish score event");
        }

        tokio::time::sleep(Duration::from_millis(25)).await;
        let key = scoreboard_revision_key(organization_id, event_id);
        let revision = cache.get(&key).await.expect("revision read");
        assert_eq!(revision, Some(1_u64.to_be_bytes().to_vec()));
    }

    #[tokio::test]
    async fn scoreboard_controls_invalidate_synchronously() {
        let cache = Arc::new(InProcessCache::new(32).expect("cache"));
        let inner = Arc::new(InProcessEventBus::new(16).expect("event bus"));
        let bus =
            ScoreboardInvalidatingEventBus::new(inner, cache.clone(), Duration::from_secs(1), 16)
                .expect("invalidating bus");
        let organization_id = OrganizationId::new();
        let event_id = EventId::new();
        let event = EventEnvelope::new(
            organization_id,
            Some(event_id),
            None,
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::ScoreboardControlChanged {
                frozen: true,
                hidden: false,
            },
        );

        bus.publish(event).await.expect("publish control event");

        let key = scoreboard_revision_key(organization_id, event_id);
        let revision = cache.get(&key).await.expect("revision read");
        assert_eq!(revision, Some(1_u64.to_be_bytes().to_vec()));
    }
}
