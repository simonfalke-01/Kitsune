//! Redis-backed shared cache, counter, rate-limit, and ephemeral state adapter.

use std::time::Duration;

use async_trait::async_trait;
use kitsune_core::{DomainError, DomainResult, ports::Cache};
use redis::aio::{ConnectionManager, ConnectionManagerConfig};

const DEFAULT_NAMESPACE: &str = "kitsune";
const MAX_KEY_BYTES: usize = 512;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(2);

/// Reconnecting Redis implementation of the shared `Cache` contract.
#[derive(Clone)]
pub struct RedisCache {
    connection: ConnectionManager,
    namespace: String,
}

impl std::fmt::Debug for RedisCache {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RedisCache")
            .field("namespace", &self.namespace)
            .finish_non_exhaustive()
    }
}

impl RedisCache {
    /// Connects to Redis with bounded command and reconnect behavior.
    pub async fn connect(url: &str, namespace: Option<&str>) -> DomainResult<Self> {
        let namespace = validate_namespace(namespace.unwrap_or(DEFAULT_NAMESPACE))?;
        let client = redis::Client::open(url).map_err(redis_error)?;
        let manager_config = ConnectionManagerConfig::new()
            .set_connection_timeout(Some(COMMAND_TIMEOUT))
            .set_response_timeout(Some(COMMAND_TIMEOUT))
            .set_number_of_retries(3);
        let mut connection = client
            .get_connection_manager_with_config(manager_config)
            .await
            .map_err(redis_error)?;
        redis::cmd("PING")
            .query_async::<String>(&mut connection)
            .await
            .map_err(redis_error)?;
        Ok(Self {
            connection,
            namespace,
        })
    }

    fn key(&self, key: &str) -> DomainResult<String> {
        validate_key(key)?;
        Ok(format!("{}:{key}", self.namespace))
    }
}

#[async_trait]
impl Cache for RedisCache {
    async fn get(&self, key: &str) -> DomainResult<Option<Vec<u8>>> {
        redis::cmd("GET")
            .arg(self.key(key)?)
            .query_async::<Option<Vec<u8>>>(&mut self.connection.clone())
            .await
            .map_err(redis_error)
    }

    async fn put(&self, key: &str, value: Vec<u8>, ttl: Duration) -> DomainResult<()> {
        redis::cmd("SET")
            .arg(self.key(key)?)
            .arg(value)
            .arg("PX")
            .arg(ttl_millis(ttl)?)
            .query_async::<()>(&mut self.connection.clone())
            .await
            .map_err(redis_error)
    }

    async fn remove(&self, key: &str) -> DomainResult<()> {
        redis::cmd("DEL")
            .arg(self.key(key)?)
            .query_async::<u64>(&mut self.connection.clone())
            .await
            .map(|_| ())
            .map_err(redis_error)
    }

    async fn increment(&self, key: &str, ttl: Duration) -> DomainResult<u64> {
        let script = redis::Script::new(
            r"
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
                redis.call('PEXPIRE', KEYS[1], ARGV[1])
            end
            return current
            ",
        );
        script
            .key(self.key(key)?)
            .arg(ttl_millis(ttl)?)
            .invoke_async::<u64>(&mut self.connection.clone())
            .await
            .map_err(redis_error)
    }
}

fn validate_namespace(namespace: &str) -> DomainResult<String> {
    let namespace = namespace.trim();
    if namespace.is_empty()
        || namespace.len() > 80
        || !namespace
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':'))
    {
        return Err(DomainError::Validation(
            "Redis namespace must contain 1 to 80 safe ASCII characters".into(),
        ));
    }
    Ok(namespace.to_owned())
}

fn validate_key(key: &str) -> DomainResult<()> {
    if key.is_empty() || key.len() > MAX_KEY_BYTES || key.as_bytes().contains(&0) {
        return Err(DomainError::Validation(
            "cache key must contain 1 to 512 non-NUL bytes".into(),
        ));
    }
    Ok(())
}

fn ttl_millis(ttl: Duration) -> DomainResult<u64> {
    if ttl.is_zero() {
        return Err(DomainError::Validation("cache TTL must be positive".into()));
    }
    u64::try_from(ttl.as_millis())
        .map_err(|_| DomainError::Validation("cache TTL exceeds Redis limits".into()))
}

fn redis_error(error: redis::RedisError) -> DomainError {
    DomainError::Unavailable(format!("Redis cache: {error}"))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use kitsune_core::ports::Cache;
    use testcontainers::{
        GenericImage,
        core::{IntoContainerPort, WaitFor},
        runners::AsyncRunner,
    };

    use super::RedisCache;

    #[tokio::test]
    async fn redis_cache_is_shared_atomic_expiring_and_namespaced() {
        let container = GenericImage::new("redis", "8.2-alpine")
            .with_exposed_port(6379.tcp())
            .with_wait_for(WaitFor::message_on_stdout("Ready to accept connections"))
            .start()
            .await
            .expect("start Redis test container");
        let port = container
            .get_host_port_ipv4(6379.tcp())
            .await
            .expect("mapped Redis port");
        let url = format!("redis://127.0.0.1:{port}/");
        let first = RedisCache::connect(&url, Some("test-a"))
            .await
            .expect("first Redis cache");
        let second = RedisCache::connect(&url, Some("test-a"))
            .await
            .expect("second Redis cache");
        let isolated = RedisCache::connect(&url, Some("test-b"))
            .await
            .expect("isolated Redis cache");

        first
            .put("session:one", vec![1, 2, 3], Duration::from_secs(2))
            .await
            .expect("put shared value");
        assert_eq!(
            second.get("session:one").await.expect("get shared value"),
            Some(vec![1, 2, 3])
        );
        assert_eq!(
            isolated
                .get("session:one")
                .await
                .expect("get isolated value"),
            None
        );

        let increments = futures::future::join_all((0..24).map(|_| {
            let cache = second.clone();
            async move {
                cache
                    .increment("rate:one", Duration::from_millis(120))
                    .await
                    .expect("increment shared counter")
            }
        }))
        .await;
        let mut increments = increments;
        increments.sort_unstable();
        assert_eq!(increments, (1..=24).collect::<Vec<_>>());

        tokio::time::sleep(Duration::from_millis(150)).await;
        assert_eq!(
            first
                .increment("rate:one", Duration::from_secs(1))
                .await
                .expect("increment expired counter"),
            1
        );
        first.remove("session:one").await.expect("remove value");
        assert_eq!(second.get("session:one").await.expect("get removed"), None);
    }

    #[tokio::test]
    async fn redis_cache_rejects_ambiguous_keys_before_network_access() {
        assert!(
            RedisCache::connect("not a Redis URL", Some("unsafe space"))
                .await
                .is_err()
        );
    }
}
