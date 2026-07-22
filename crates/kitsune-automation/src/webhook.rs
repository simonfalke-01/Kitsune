//! HMAC-signed, redirect-safe webhook delivery with bounded retry semantics.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use hmac::{Hmac, Mac};
use kitsune_core::{DomainError, DomainResult, EventEnvelope};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use url::Url;
use uuid::Uuid;

use crate::egress::EgressPolicy;

/// Configured webhook endpoint. Secrets are redacted by `Debug`.
pub struct WebhookEndpoint {
    /// Identifier.
    pub id: Uuid,
    /// Display name.
    pub name: String,
    /// Target URL.
    pub url: Url,
    /// HMAC key.
    pub secret: SecretString,
    /// Empty subscribes to every domain event.
    pub event_kinds: Vec<String>,
    /// Delivery switch.
    pub enabled: bool,
}

impl std::fmt::Debug for WebhookEndpoint {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WebhookEndpoint")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("url", &self.url)
            .field("secret", &"[REDACTED]")
            .field("event_kinds", &self.event_kinds)
            .field("enabled", &self.enabled)
            .finish()
    }
}

impl WebhookEndpoint {
    /// Whether the endpoint subscribes to an event.
    pub fn accepts(&self, event: &EventEnvelope) -> bool {
        self.enabled
            && (self.event_kinds.is_empty()
                || self.event_kinds.iter().any(|kind| kind == event.kind()))
    }
}

/// Persistent delivery receipt suitable for execution history.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebhookDelivery {
    /// Delivery identifier.
    pub id: Uuid,
    /// Webhook identifier.
    pub webhook_id: Uuid,
    /// Event identifier.
    pub event_id: Uuid,
    /// One-based attempt count.
    pub attempts: u8,
    /// Final HTTP status, if a response was received.
    pub response_status: Option<u16>,
    /// True after a 2xx response.
    pub delivered: bool,
    /// Safe bounded error or response excerpt.
    pub detail: String,
}

/// HTTP webhook adapter.
#[derive(Clone)]
pub struct WebhookDispatcher {
    client: reqwest::Client,
    policy: Arc<EgressPolicy>,
    maximum_attempts: u8,
    request_timeout: Duration,
}

impl WebhookDispatcher {
    /// Constructs a redirect-disabled client. Redirect targets are followed
    /// manually so every hop is checked by the egress policy.
    pub fn new(policy: Arc<EgressPolicy>) -> DomainResult<Self> {
        let request_timeout = Duration::from_secs(8);
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .timeout(request_timeout)
            .user_agent(concat!("Kitsune/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|error| DomainError::Unavailable(format!("HTTP client: {error}")))?;
        Ok(Self {
            client,
            policy,
            maximum_attempts: 5,
            request_timeout,
        })
    }

    /// Delivers one subscribed event with exponential backoff. The same body,
    /// timestamp, event ID, and signature are used for every network attempt.
    pub async fn deliver(
        &self,
        endpoint: &WebhookEndpoint,
        event: &EventEnvelope,
    ) -> DomainResult<WebhookDelivery> {
        if !endpoint.accepts(event) {
            return Err(DomainError::Conflict(
                "webhook is disabled or not subscribed".into(),
            ));
        }
        self.policy.validate(&endpoint.url).await?;
        let body = serde_json::to_vec(event)
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        let timestamp = event.occurred_at.timestamp().to_string();
        let signature = sign(&endpoint.secret, &timestamp, &body)?;
        let mut final_status = None;
        let mut detail = String::new();
        let mut attempts = 0;

        for attempt in 1..=self.maximum_attempts {
            attempts = attempt;
            match self
                .send_checked(
                    endpoint.url.clone(),
                    event,
                    &timestamp,
                    &signature,
                    body.clone(),
                    0,
                )
                .await
            {
                Ok((status, response_detail)) => {
                    final_status = Some(status);
                    detail = response_detail;
                    if (200..300).contains(&status) {
                        return Ok(WebhookDelivery {
                            id: Uuid::now_v7(),
                            webhook_id: endpoint.id,
                            event_id: event.id,
                            attempts: attempt,
                            response_status: final_status,
                            delivered: true,
                            detail,
                        });
                    }
                    if status < 500 && status != 408 && status != 429 {
                        break;
                    }
                }
                Err(error) => detail = error.to_string(),
            }
            if attempt < self.maximum_attempts {
                let delay = 100_u64.saturating_mul(1_u64 << u32::from(attempt - 1));
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }

        Ok(WebhookDelivery {
            id: Uuid::now_v7(),
            webhook_id: endpoint.id,
            event_id: event.id,
            attempts,
            response_status: final_status,
            delivered: false,
            detail,
        })
    }

    #[allow(clippy::too_many_arguments)]
    async fn send_checked(
        &self,
        mut url: Url,
        event: &EventEnvelope,
        timestamp: &str,
        signature: &str,
        body: Vec<u8>,
        mut redirects: u8,
    ) -> DomainResult<(u16, String)> {
        loop {
            self.policy.validate(&url).await?;
            let response = self
                .client
                .post(url.clone())
                .header("content-type", "application/json")
                .header("x-kitsune-event", event.kind())
                .header("x-kitsune-event-id", event.id.to_string())
                .header("x-kitsune-timestamp", timestamp)
                .header("x-kitsune-signature", signature)
                .body(body.clone())
                .timeout(self.request_timeout)
                .send()
                .await
                .map_err(|error| DomainError::Unavailable(format!("webhook request: {error}")))?;
            if response.status().is_redirection() {
                redirects = redirects.saturating_add(1);
                if redirects > 3 {
                    return Err(DomainError::LimitExceeded("webhook redirect limit".into()));
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(|| DomainError::Validation("redirect has no location".into()))?;
                url = url
                    .join(location)
                    .map_err(|_| DomainError::Validation("invalid redirect location".into()))?;
                continue;
            }
            let status = response.status().as_u16();
            let bytes = response
                .bytes()
                .await
                .map_err(|error| DomainError::Unavailable(format!("webhook response: {error}")))?;
            let detail = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).into_owned();
            return Ok((status, detail));
        }
    }
}

/// HMAC-SHA256 signature over timestamp and exact request bytes.
pub fn sign(secret: &SecretString, timestamp: &str, body: &[u8]) -> DomainResult<String> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.expose_secret().as_bytes())
        .map_err(|_| DomainError::Validation("invalid webhook key".into()))?;
    mac.update(timestamp.as_bytes());
    mac.update(b".");
    mac.update(body);
    Ok(format!("v1={}", hex::encode(mac.finalize().into_bytes())))
}

/// Constant-time signature verification helper for receiver examples and tests.
pub fn verify_signature(
    secret: &SecretString,
    timestamp: &str,
    body: &[u8],
    signature: &str,
) -> bool {
    let Some(encoded) = signature.strip_prefix("v1=") else {
        return false;
    };
    let Ok(provided) = hex::decode(encoded) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.expose_secret().as_bytes()) else {
        return false;
    };
    mac.update(timestamp.as_bytes());
    mac.update(b".");
    mac.update(body);
    mac.verify_slice(&provided).is_ok()
}

/// Header schema used by OpenAPI and integration docs.
pub fn signature_headers(event: &EventEnvelope, signature: String) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("x-kitsune-event".into(), event.kind().into()),
        ("x-kitsune-event-id".into(), event.id.to_string()),
        (
            "x-kitsune-timestamp".into(),
            event.occurred_at.timestamp().to_string(),
        ),
        ("x-kitsune-signature".into(), signature),
    ])
}

#[cfg(test)]
mod tests {
    use secrecy::SecretString;

    use super::*;

    #[test]
    fn signatures_are_exact_and_constant_time_verifiable() {
        let secret = SecretString::from("this-is-a-test-secret-with-enough-entropy");
        let signature = sign(&secret, "1700000000", b"{\"ok\":true}").expect("sign");
        assert!(verify_signature(
            &secret,
            "1700000000",
            b"{\"ok\":true}",
            &signature
        ));
        assert!(!verify_signature(
            &secret,
            "1700000001",
            b"{\"ok\":true}",
            &signature
        ));
    }
}
