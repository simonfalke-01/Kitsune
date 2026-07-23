//! Durable NATS JetStream publishing and cross-node live event fanout.

use std::{fmt::Display, future::IntoFuture, time::Duration};

use async_nats::{HeaderMap, header::NATS_MESSAGE_ID, jetstream};
use async_trait::async_trait;
use futures::StreamExt;
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    ports::{EventBus, EventStream},
};
use tracing::warn;

const DEFAULT_NAMESPACE: &str = "kitsune";
const OPERATION_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_EVENT_BYTES: usize = 256 * 1024;
const MAX_STREAM_BYTES: i64 = 1024 * 1024 * 1024;
const MAX_STREAM_MESSAGES: i64 = 1_000_000;
const STREAM_MAX_AGE: Duration = Duration::from_hours(168);
const DEDUPLICATION_WINDOW: Duration = Duration::from_mins(2);

/// Bounded JetStream retention configuration for one Kitsune installation.
#[derive(Debug, Clone)]
pub struct NatsEventBusConfig {
    /// Installation namespace used in subjects and the stream name.
    pub namespace: String,
    /// Maximum retained bytes across the event stream.
    pub max_stream_bytes: i64,
    /// Maximum retained event count.
    pub max_stream_messages: i64,
    /// Maximum event retention age.
    pub max_stream_age: Duration,
}

impl Default for NatsEventBusConfig {
    fn default() -> Self {
        Self {
            namespace: DEFAULT_NAMESPACE.into(),
            max_stream_bytes: MAX_STREAM_BYTES,
            max_stream_messages: MAX_STREAM_MESSAGES,
            max_stream_age: STREAM_MAX_AGE,
        }
    }
}

/// JetStream-backed event bus for durable publication and replica fanout.
#[derive(Clone)]
pub struct NatsEventBus {
    client: async_nats::Client,
    jetstream: jetstream::Context,
    namespace: String,
    subject_prefix: String,
}

impl std::fmt::Debug for NatsEventBus {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("NatsEventBus")
            .field("namespace", &self.namespace)
            .finish_non_exhaustive()
    }
}

impl NatsEventBus {
    /// Connects to NATS and ensures the bounded durable event stream exists.
    pub async fn connect(url: &str, namespace: Option<&str>) -> DomainResult<Self> {
        let config = NatsEventBusConfig {
            namespace: namespace.unwrap_or(DEFAULT_NAMESPACE).to_owned(),
            ..NatsEventBusConfig::default()
        };
        Self::connect_with_config(url, config).await
    }

    /// Connects with explicit validated stream retention bounds.
    pub async fn connect_with_config(url: &str, config: NatsEventBusConfig) -> DomainResult<Self> {
        validate_config(&config)?;
        let namespace = validate_namespace(&config.namespace)?;
        let subject_prefix = format!("{namespace}.events");
        let client = bounded("connect", async_nats::connect(url)).await?;
        let jetstream = jetstream::new(client.clone());
        let stream_name = format!("{}_EVENTS", namespace.to_ascii_uppercase());
        let stream = jetstream::stream::Config {
            name: stream_name,
            subjects: vec![format!("{subject_prefix}.>")],
            storage: jetstream::stream::StorageType::File,
            max_bytes: config.max_stream_bytes,
            max_messages: config.max_stream_messages,
            max_age: config.max_stream_age,
            max_message_size: i32::try_from(MAX_EVENT_BYTES)
                .expect("event byte limit fits in an i32"),
            duplicate_window: DEDUPLICATION_WINDOW,
            ..Default::default()
        };
        bounded(
            "initialize event stream",
            jetstream.get_or_create_stream(stream),
        )
        .await?;

        Ok(Self {
            client,
            jetstream,
            namespace,
            subject_prefix,
        })
    }

    fn subject(&self, kind: &str) -> DomainResult<String> {
        validate_kind(kind)?;
        Ok(format!("{}.{kind}", self.subject_prefix))
    }
}

fn validate_config(config: &NatsEventBusConfig) -> DomainResult<()> {
    if config.max_stream_bytes <= 0
        || config.max_stream_messages <= 0
        || config.max_stream_age.is_zero()
    {
        return Err(DomainError::Validation(
            "NATS stream byte, message, and age bounds must be positive".into(),
        ));
    }
    Ok(())
}

#[async_trait]
impl EventBus for NatsEventBus {
    async fn publish(&self, event: EventEnvelope) -> DomainResult<()> {
        let subject = self.subject(event.kind())?;
        let payload = serde_json::to_vec(&event)
            .map_err(|error| DomainError::Conflict(format!("serialize event: {error}")))?;
        if payload.len() > MAX_EVENT_BYTES {
            return Err(DomainError::LimitExceeded(format!(
                "serialized event exceeds {MAX_EVENT_BYTES} bytes"
            )));
        }

        let mut headers = HeaderMap::new();
        headers.insert(NATS_MESSAGE_ID, event.id.to_string());
        let acknowledgement = bounded(
            "publish event",
            self.jetstream
                .publish_with_headers(subject, headers, payload.into()),
        )
        .await?;
        bounded("acknowledge event", acknowledgement.into_future()).await?;
        Ok(())
    }

    async fn subscribe(&self, kinds: &[String]) -> DomainResult<EventStream> {
        for kind in kinds {
            validate_kind(kind)?;
        }
        let kinds = kinds.to_vec();
        let subject_prefix = self.subject_prefix.clone();
        let subscriber = bounded(
            "subscribe to events",
            self.client.subscribe(format!("{subject_prefix}.>")),
        )
        .await?;
        bounded("flush event subscription", self.client.flush()).await?;

        let stream = subscriber.filter_map(move |message| {
            let kinds = kinds.clone();
            let subject_prefix = subject_prefix.clone();
            async move {
                if message.payload.len() > MAX_EVENT_BYTES {
                    warn!(
                        payload_bytes = message.payload.len(),
                        "discarding oversized NATS event"
                    );
                    return None;
                }
                let event = match serde_json::from_slice::<EventEnvelope>(&message.payload) {
                    Ok(event) => event,
                    Err(error) => {
                        warn!(error = %error, "discarding malformed NATS event");
                        return None;
                    }
                };
                let expected_subject = format!("{subject_prefix}.{}", event.kind());
                if message.subject.as_str() != expected_subject {
                    warn!(
                        subject = %message.subject,
                        event_kind = event.kind(),
                        "discarding NATS event whose subject does not match its envelope"
                    );
                    return None;
                }
                if kinds.is_empty() || kinds.iter().any(|kind| kind == event.kind()) {
                    Some(event)
                } else {
                    None
                }
            }
        });
        Ok(Box::pin(stream))
    }
}

fn validate_namespace(namespace: &str) -> DomainResult<String> {
    let namespace = namespace.trim();
    if namespace.is_empty()
        || namespace.len() > 48
        || !namespace.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
    {
        return Err(DomainError::Validation(
            "NATS namespace must contain 1 to 48 lowercase ASCII letters, digits, hyphens, or underscores"
                .into(),
        ));
    }
    Ok(namespace.to_owned())
}

fn validate_kind(kind: &str) -> DomainResult<()> {
    if kind.is_empty()
        || kind.len() > 160
        || kind.split('.').any(|part| {
            part.is_empty()
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        })
    {
        return Err(DomainError::Validation(
            "event kind must be a dotted sequence of safe ASCII tokens".into(),
        ));
    }
    Ok(())
}

async fn bounded<T, E>(
    operation: &str,
    future: impl Future<Output = Result<T, E>>,
) -> DomainResult<T>
where
    E: Display,
{
    tokio::time::timeout(OPERATION_TIMEOUT, future)
        .await
        .map_err(|_| DomainError::Unavailable(format!("NATS event bus: {operation} timed out")))?
        .map_err(|error| DomainError::Unavailable(format!("NATS event bus: {error}")))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use chrono::Utc;
    use futures::StreamExt;
    use kitsune_core::{
        EventEnvelope,
        events::DomainEvent,
        identity::{OrganizationId, UserId},
        ports::EventBus,
    };
    use testcontainers::{
        GenericImage, ImageExt,
        core::{IntoContainerPort, WaitFor},
        runners::AsyncRunner,
    };
    use uuid::Uuid;

    use super::{NatsEventBus, NatsEventBusConfig};

    fn test_config(namespace: &str) -> NatsEventBusConfig {
        NatsEventBusConfig {
            namespace: namespace.into(),
            max_stream_bytes: 16 * 1024 * 1024,
            max_stream_messages: 10_000,
            max_stream_age: Duration::from_hours(1),
        }
    }

    #[tokio::test]
    async fn jetstream_events_fan_out_across_nodes_and_namespaces() {
        let container = GenericImage::new("nats", "2.12-alpine")
            .with_exposed_port(4222.tcp())
            .with_wait_for(WaitFor::message_on_stderr("Server is ready"))
            .with_cmd(["--jetstream"])
            .start()
            .await
            .expect("start NATS test container");
        let port = container
            .get_host_port_ipv4(4222.tcp())
            .await
            .expect("mapped NATS port");
        let url = format!("nats://127.0.0.1:{port}");
        let publisher = NatsEventBus::connect_with_config(&url, test_config("test-a"))
            .await
            .expect("publisher event bus");
        let subscriber = NatsEventBus::connect_with_config(&url, test_config("test-a"))
            .await
            .expect("subscriber event bus");
        let isolated = NatsEventBus::connect_with_config(&url, test_config("test-b"))
            .await
            .expect("isolated event bus");
        let mut matching = subscriber
            .subscribe(&["identity.user.created".into()])
            .await
            .expect("matching subscription");
        let mut isolated_stream = isolated
            .subscribe(&[])
            .await
            .expect("isolated subscription");

        let raw_client = async_nats::connect(&url).await.expect("raw NATS client");
        raw_client
            .publish("test-a.events.identity.user.created", "not-json".into())
            .await
            .expect("publish malformed event");
        raw_client.flush().await.expect("flush malformed event");
        publisher
            .publish(EventEnvelope::new_platform(
                Uuid::now_v7(),
                Utc::now(),
                DomainEvent::AuthenticationFailed {
                    identity_hint: "redacted".into(),
                    method: "local".into(),
                },
            ))
            .await
            .expect("publish filtered event");

        let event = EventEnvelope::new(
            OrganizationId::new(),
            None,
            None,
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::UserCreated {
                user_id: UserId::new(),
            },
        );
        publisher
            .publish(event.clone())
            .await
            .expect("publish event");

        let received = tokio::time::timeout(Duration::from_secs(2), matching.next())
            .await
            .expect("cross-node event timeout")
            .expect("cross-node event");
        assert_eq!(received, event);
        assert!(
            tokio::time::timeout(Duration::from_millis(150), isolated_stream.next())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn nats_namespaces_and_event_kinds_are_validated_before_connection() {
        assert!(
            NatsEventBus::connect("not a NATS URL", Some("unsafe namespace"))
                .await
                .is_err()
        );
        let mut config = test_config("test");
        config.max_stream_bytes = 0;
        assert!(
            NatsEventBus::connect_with_config("not a NATS URL", config)
                .await
                .is_err()
        );
    }
}
