//! Bounded, TLS-first SMTP notification delivery.

use std::{fmt, time::Duration};

use async_trait::async_trait;
use kitsune_core::{
    DomainError, DomainResult,
    ports::{Notification, Notifier},
};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, MultiPart, header::MessageId},
    transport::smtp::{PoolConfig, authentication::Credentials},
};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

const DELIVERY_ATTEMPTS: u8 = 3;
const INITIAL_RETRY_DELAY: Duration = Duration::from_millis(100);
const MAX_CONNECTIONS: u32 = 8;

/// SMTP transport security policy.
#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SmtpSecurity {
    /// SMTP over implicit TLS, normally port 465.
    ImplicitTls,
    /// Plain connection upgraded with mandatory STARTTLS, normally port 587.
    #[default]
    StartTls,
    /// Unencrypted local relay. Rejected for non-loopback hosts.
    PlainLocal,
}

/// Explicit optional SMTP configuration.
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SmtpConfig {
    /// Relay hostname or loopback address.
    pub relay: String,
    /// Relay port.
    pub port: u16,
    /// Transport security policy.
    #[serde(default)]
    pub security: SmtpSecurity,
    /// Optional authentication username.
    pub username: Option<String>,
    /// Optional authentication password. Debug output remains redacted.
    pub password: Option<SecretString>,
    /// RFC-compatible sender mailbox.
    pub from: String,
    /// Per-command timeout in seconds.
    #[serde(default = "default_timeout_seconds")]
    pub timeout_seconds: u64,
}

impl fmt::Debug for SmtpConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SmtpConfig")
            .field("relay", &self.relay)
            .field("port", &self.port)
            .field("security", &self.security)
            .field("username", &self.username)
            .field("password", &self.password.as_ref().map(|_| "[REDACTED]"))
            .field("from", &self.from)
            .field("timeout_seconds", &self.timeout_seconds)
            .finish()
    }
}

const fn default_timeout_seconds() -> u64 {
    10
}

/// Tokio SMTP adapter for the core `Notifier` port.
#[derive(Clone)]
pub struct SmtpNotifier {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
}

impl fmt::Debug for SmtpNotifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SmtpNotifier")
            .field("from", &self.from)
            .finish_non_exhaustive()
    }
}

impl SmtpNotifier {
    /// Validates configuration and constructs a pooled async transport.
    pub fn new(config: &SmtpConfig) -> DomainResult<Self> {
        validate_config(config)?;
        let mut builder = match config.security {
            SmtpSecurity::ImplicitTls => {
                AsyncSmtpTransport::<Tokio1Executor>::relay(config.relay.trim())
                    .map_err(configuration_error)?
            }
            SmtpSecurity::StartTls => {
                AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(config.relay.trim())
                    .map_err(configuration_error)?
            }
            SmtpSecurity::PlainLocal => {
                AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(config.relay.trim())
            }
        }
        .port(config.port)
        .timeout(Some(Duration::from_secs(config.timeout_seconds)))
        .pool_config(PoolConfig::new().max_size(MAX_CONNECTIONS));

        if let (Some(username), Some(password)) = (&config.username, &config.password) {
            builder = builder.credentials(Credentials::new(
                username.clone(),
                password.expose_secret().to_owned(),
            ));
        }

        let from = config
            .from
            .parse::<Mailbox>()
            .map_err(configuration_error)?;
        Ok(Self {
            transport: builder.build(),
            from,
        })
    }

    async fn deliver(&self, notification: &Notification) -> DomainResult<()> {
        let rendered = render(notification)?;
        let recipient = notification.recipient.parse::<Mailbox>().map_err(|_| {
            DomainError::Validation("notification recipient is not a mailbox".into())
        })?;
        let message_id = format!("<{}@notifications.kitsune>", notification.idempotency_key);
        let message = Message::builder()
            .from(self.from.clone())
            .to(recipient)
            .subject(rendered.subject)
            .header(MessageId::from(message_id))
            .multipart(MultiPart::alternative_plain_html(
                rendered.plain,
                rendered.html,
            ))
            .map_err(|error| {
                DomainError::Validation(format!("notification message is invalid: {error}"))
            })?;

        let mut delay = INITIAL_RETRY_DELAY;
        for attempt in 1..=DELIVERY_ATTEMPTS {
            match self.transport.send(message.clone()).await {
                Ok(_) => return Ok(()),
                Err(error) if attempt < DELIVERY_ATTEMPTS => {
                    tracing::warn!(
                        attempt,
                        notification_id = %notification.idempotency_key,
                        %error,
                        "SMTP delivery attempt failed"
                    );
                    tokio::time::sleep(delay).await;
                    delay = delay.saturating_mul(2);
                }
                Err(error) => {
                    tracing::warn!(
                        attempt,
                        notification_id = %notification.idempotency_key,
                        %error,
                        "SMTP delivery exhausted its retry budget"
                    );
                    return Err(DomainError::Unavailable(
                        "SMTP relay rejected the notification".into(),
                    ));
                }
            }
        }
        Err(DomainError::Unavailable(
            "SMTP delivery exhausted its retry budget".into(),
        ))
    }
}

#[async_trait]
impl Notifier for SmtpNotifier {
    async fn notify(&self, notification: Notification) -> DomainResult<()> {
        self.deliver(&notification).await
    }
}

fn validate_config(config: &SmtpConfig) -> DomainResult<()> {
    if config.relay.trim().is_empty() {
        return Err(DomainError::Validation(
            "SMTP relay must not be empty".into(),
        ));
    }
    if config.port == 0 {
        return Err(DomainError::Validation("SMTP port must be positive".into()));
    }
    if !(1..=120).contains(&config.timeout_seconds) {
        return Err(DomainError::Validation(
            "SMTP timeout must be between 1 and 120 seconds".into(),
        ));
    }
    if config.username.is_some() != config.password.is_some() {
        return Err(DomainError::Validation(
            "SMTP username and password must be configured together".into(),
        ));
    }
    if config.security == SmtpSecurity::PlainLocal && !is_loopback_relay(&config.relay) {
        return Err(DomainError::Validation(
            "unencrypted SMTP is restricted to loopback relays".into(),
        ));
    }
    Ok(())
}

fn is_loopback_relay(relay: &str) -> bool {
    matches!(relay.trim(), "localhost" | "127.0.0.1" | "::1" | "[::1]")
}

struct RenderedNotification {
    subject: &'static str,
    plain: String,
    html: String,
}

fn render(notification: &Notification) -> DomainResult<RenderedNotification> {
    let display_name = required_data(notification, "display_name")?;
    let action_url = required_data(notification, "action_url")?;
    let expires = required_data(notification, "expires")?;
    let escaped_name = escape_html(display_name);
    let escaped_url = escape_html(action_url);
    let escaped_expires = escape_html(expires);

    let (subject, purpose) = match notification.template.as_str() {
        "auth.email_verification" => (
            "Verify your Kitsune email",
            "Confirm this email address for your Kitsune account",
        ),
        "auth.account_recovery" => (
            "Recover your Kitsune account",
            "Choose a new password for your Kitsune account",
        ),
        _ => {
            return Err(DomainError::Validation(
                "SMTP notification template is not supported".into(),
            ));
        }
    };
    let plain = format!(
        "Hello {display_name},\n\n{purpose}:\n{action_url}\n\nThis link expires {expires}. If you did not request this, you can ignore this message.\n"
    );
    let html = format!(
        concat!(
            "<!doctype html><html>",
            "<body style=\"font-family:system-ui,sans-serif;color:#171717;line-height:1.5\">",
            "<main style=\"max-width:560px;margin:0 auto;padding:32px\">",
            "<p>Hello {escaped_name},</p>",
            "<p>{purpose}.</p>",
            "<p><a href=\"{escaped_url}\" style=\"display:inline-block;padding:12px 18px;",
            "border-radius:10px;background:#c2410c;color:white;text-decoration:none;",
            "font-weight:700\">Continue to Kitsune</a></p>",
            "<p style=\"color:#666;font-size:14px\">This link expires {escaped_expires}. ",
            "If you did not request this, you can ignore this message.</p>",
            "</main></body></html>"
        ),
        escaped_name = escaped_name,
        purpose = purpose,
        escaped_url = escaped_url,
        escaped_expires = escaped_expires,
    );
    Ok(RenderedNotification {
        subject,
        plain,
        html,
    })
}

fn required_data<'a>(notification: &'a Notification, key: &str) -> DomainResult<&'a str> {
    notification
        .data
        .get(key)
        .filter(|value| !value.is_empty())
        .map(String::as_str)
        .ok_or_else(|| DomainError::Validation(format!("notification data requires {key}")))
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn configuration_error(error: impl fmt::Display) -> DomainError {
    DomainError::Validation(format!("invalid SMTP configuration: {error}"))
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, fmt::Write as _, sync::Arc};

    use kitsune_core::ports::Notifier;
    use secrecy::SecretString;
    use tokio::{
        io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
        net::TcpListener,
        sync::Mutex,
    };
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn configuration_requires_tls_away_from_loopback_and_complete_credentials() {
        let mut config = test_config(2525);
        config.relay = "mail.example.test".into();
        assert!(SmtpNotifier::new(&config).is_err());

        config.security = SmtpSecurity::StartTls;
        config.username = Some("kitsune".into());
        assert!(SmtpNotifier::new(&config).is_err());

        config.password = Some(SecretString::from("secret".to_owned()));
        assert!(SmtpNotifier::new(&config).is_ok());
        let debug = format!("{config:?}");
        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("secret"));
    }

    #[test]
    fn templates_escape_untrusted_display_values() {
        let notification = test_notification("Fox <script>");
        let rendered = render(&notification).expect("render notification");
        assert!(rendered.html.contains("Fox &lt;script&gt;"));
        assert!(!rendered.html.contains("Fox <script>"));
        assert!(
            rendered
                .plain
                .contains("https://ctf.example.test/verify-email")
        );
    }

    #[tokio::test]
    async fn smtp_adapter_delivers_a_multipart_message_to_a_local_relay() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind SMTP fixture");
        let port = listener.local_addr().expect("SMTP fixture address").port();
        let transcript = Arc::new(Mutex::new(String::new()));
        let server_transcript = Arc::clone(&transcript);
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept SMTP client");
            let (reader, mut writer) = stream.into_split();
            let mut lines = BufReader::new(reader).lines();
            writer
                .write_all(b"220 localhost ESMTP\r\n")
                .await
                .expect("greeting");
            let mut data = false;
            while let Some(line) = lines.next_line().await.expect("read SMTP line") {
                writeln!(server_transcript.lock().await, "{line}").expect("record SMTP transcript");
                if data {
                    if line == "." {
                        data = false;
                        writer.write_all(b"250 queued\r\n").await.expect("queued");
                    }
                    continue;
                }
                let command = line.split_whitespace().next().unwrap_or_default();
                match command.to_ascii_uppercase().as_str() {
                    "EHLO" => writer
                        .write_all(b"250-localhost\r\n250 PIPELINING\r\n")
                        .await
                        .expect("EHLO"),
                    "MAIL" | "RCPT" => writer.write_all(b"250 ok\r\n").await.expect("envelope"),
                    "DATA" => {
                        data = true;
                        writer
                            .write_all(b"354 end with dot\r\n")
                            .await
                            .expect("DATA");
                    }
                    "QUIT" => {
                        writer.write_all(b"221 bye\r\n").await.expect("QUIT");
                        break;
                    }
                    _ => writer.write_all(b"250 ok\r\n").await.expect("command"),
                }
            }
        });
        let notifier = SmtpNotifier::new(&test_config(port)).expect("SMTP notifier");

        notifier
            .notify(test_notification("Fox Player"))
            .await
            .expect("deliver notification");
        drop(notifier);
        server.await.expect("SMTP fixture task");

        let transcript = transcript.lock().await;
        assert!(transcript.contains("Subject: Verify your Kitsune email"));
        assert!(transcript.contains("Content-Type: multipart/alternative"));
        assert!(transcript.contains("verify-email?token"));
        assert!(transcript.contains("opaque"));
    }

    fn test_config(port: u16) -> SmtpConfig {
        SmtpConfig {
            relay: "127.0.0.1".into(),
            port,
            security: SmtpSecurity::PlainLocal,
            username: None,
            password: None,
            from: "Kitsune <kitsune@example.test>".into(),
            timeout_seconds: 2,
        }
    }

    fn test_notification(display_name: &str) -> Notification {
        Notification {
            template: "auth.email_verification".into(),
            recipient: "player@example.test".into(),
            data: BTreeMap::from([
                ("display_name".into(), display_name.into()),
                (
                    "action_url".into(),
                    "https://ctf.example.test/verify-email?token=opaque".into(),
                ),
                ("expires".into(), "in 24 hours".into()),
            ]),
            idempotency_key: Uuid::now_v7(),
        }
    }
}
