//! Fail-open, revisioned scoreboard snapshots over the shared Cache adapter.

use std::{sync::Arc, time::Duration};

use kitsune_automation::scoreboard_revision_key;
use kitsune_core::{
    identity::{DivisionId, EventId, OrganizationId},
    ports::Cache,
};
use serde::{Serialize, de::DeserializeOwned};

const SNAPSHOT_TTL: Duration = Duration::from_millis(750);
const MAX_SNAPSHOT_BYTES: usize = 4 * 1024 * 1024;

/// Cache-safe distinction between public concealment and organizer truth.
#[derive(Debug, Clone, Copy)]
pub enum ScoreboardAudience {
    /// Honors public hide and freeze controls.
    Public,
    /// Includes organizer-visible frozen or hidden state.
    Organizer,
}

impl ScoreboardAudience {
    const fn key(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Organizer => "organizer",
        }
    }
}

/// Builds a revision-scoped scoreboard or history key.
pub async fn snapshot_key(
    cache: &Arc<dyn Cache>,
    organization_id: OrganizationId,
    event_id: EventId,
    division_id: Option<DivisionId>,
    audience: ScoreboardAudience,
    projection: &str,
) -> String {
    let revision = revision(cache, organization_id, event_id).await;
    let division = division_id.map_or_else(|| "all".to_owned(), |id| id.to_string());
    format!(
        "scoreboard:snapshot:{organization_id}:{event_id}:{revision}:{}:{division}:{projection}",
        audience.key()
    )
}

/// Reads a valid typed snapshot and treats cache failures as misses.
pub async fn read<T>(cache: &Arc<dyn Cache>, key: &str) -> Option<T>
where
    T: DeserializeOwned,
{
    let bytes = match cache.get(key).await {
        Ok(bytes) => bytes?,
        Err(error) => {
            tracing::warn!(%error, %key, "scoreboard cache read failed");
            return None;
        }
    };
    match serde_json::from_slice(&bytes) {
        Ok(snapshot) => Some(snapshot),
        Err(error) => {
            tracing::warn!(%error, %key, "scoreboard cache contained an invalid snapshot");
            if let Err(remove_error) = cache.remove(key).await {
                tracing::warn!(%remove_error, %key, "invalid scoreboard cache entry could not be removed");
            }
            None
        }
    }
}

/// Writes a bounded typed snapshot and treats cache failures as non-fatal.
pub async fn write<T>(cache: &Arc<dyn Cache>, key: &str, snapshot: &T)
where
    T: Serialize,
{
    let bytes = match serde_json::to_vec(snapshot) {
        Ok(bytes) => bytes,
        Err(error) => {
            tracing::warn!(%error, %key, "scoreboard snapshot serialization failed");
            return;
        }
    };
    if bytes.len() > MAX_SNAPSHOT_BYTES {
        tracing::warn!(
            bytes = bytes.len(),
            %key,
            "scoreboard snapshot exceeded the cache byte budget"
        );
        return;
    }
    if let Err(error) = cache.put(key, bytes, SNAPSHOT_TTL).await {
        tracing::warn!(%error, %key, "scoreboard cache write failed");
    }
}

async fn revision(
    cache: &Arc<dyn Cache>,
    organization_id: OrganizationId,
    event_id: EventId,
) -> u64 {
    let key = scoreboard_revision_key(organization_id, event_id);
    let bytes = match cache.get(&key).await {
        Ok(Some(bytes)) => bytes,
        Ok(None) => return 0,
        Err(error) => {
            tracing::warn!(%error, %key, "scoreboard revision read failed");
            return 0;
        }
    };
    let Ok(bytes) = <[u8; 8]>::try_from(bytes) else {
        tracing::warn!(%key, "scoreboard revision contained invalid bytes");
        if let Err(error) = cache.remove(&key).await {
            tracing::warn!(%error, %key, "invalid scoreboard revision could not be removed");
        }
        return 0;
    };
    u64::from_be_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use kitsune_automation::InProcessCache;
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
    struct Snapshot {
        score: i64,
    }

    #[tokio::test]
    async fn snapshots_are_typed_revisioned_and_fail_open() {
        let cache: Arc<dyn Cache> = Arc::new(InProcessCache::new(16).expect("cache"));
        let organization_id = OrganizationId::new();
        let event_id = EventId::new();
        let key = snapshot_key(
            &cache,
            organization_id,
            event_id,
            None,
            ScoreboardAudience::Public,
            "ranked",
        )
        .await;
        write(&cache, &key, &Snapshot { score: 900 }).await;
        assert_eq!(
            read::<Snapshot>(&cache, &key).await,
            Some(Snapshot { score: 900 })
        );

        let revision_key = scoreboard_revision_key(organization_id, event_id);
        cache
            .increment(&revision_key, Duration::from_mins(1))
            .await
            .expect("increment revision");
        let next_key = snapshot_key(
            &cache,
            organization_id,
            event_id,
            None,
            ScoreboardAudience::Public,
            "ranked",
        )
        .await;
        assert_ne!(key, next_key);
        assert_eq!(read::<Snapshot>(&cache, &next_key).await, None);
    }
}
