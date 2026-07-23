//! Kitsune dependency composition and server process.

use std::{collections::BTreeSet, net::SocketAddr, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use axum_extra::extract::cookie::Key;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use kitsune_api::{
    AppState, AuthService, OidcService, PasskeyService, SamlCredentials, SamlService, TokenService,
};
use kitsune_automation::{InProcessCache, InProcessEventBus, NatsEventBus, RedisCache};
use kitsune_core::{
    config::{FeatureFlags, RuntimeProfile},
    ports::{Cache, EventBus},
};
use kitsune_db::{PostgresStore, auth::AuthRepository};
use kitsune_integrations::{SmtpConfig, SmtpNotifier};
use kitsune_plugins::{PluginBudgets, PluginHost, PluginTrustStore};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

/// Layered runtime configuration. Every field has a bootable default for the
/// blessed Compose topology.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
struct ServerConfig {
    profile: RuntimeProfile,
    features: Option<FeatureFlags>,
    database_url: String,
    listen: SocketAddr,
    database_max_connections: u32,
    data_dir: PathBuf,
    secure_cookies: bool,
    auto_migrate: bool,
    public_origin: String,
    oidc_trusted_origins: BTreeSet<String>,
    saml_trusted_origins: BTreeSet<String>,
    redis_url: Option<SecretString>,
    redis_namespace: String,
    nats_url: Option<SecretString>,
    nats_namespace: String,
    smtp: Option<SmtpConfig>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            profile: RuntimeProfile::Lean,
            features: None,
            database_url: "postgres://kitsune:kitsune@127.0.0.1:5432/kitsune".into(),
            listen: "0.0.0.0:3000".parse().expect("static listen address"),
            database_max_connections: 20,
            data_dir: PathBuf::from("data"),
            secure_cookies: false,
            auto_migrate: true,
            public_origin: "http://localhost:3000".into(),
            oidc_trusted_origins: BTreeSet::new(),
            saml_trusted_origins: BTreeSet::new(),
            redis_url: None,
            redis_namespace: "kitsune".into(),
            nats_url: None,
            nats_namespace: "kitsune".into(),
            smtp: None,
        }
    }
}

impl ServerConfig {
    fn load() -> Result<Self> {
        let defaults = Self::default();
        let builder = config::Config::builder()
            .set_default("profile", "lean")?
            .set_default("database_url", defaults.database_url)?
            .set_default("listen", defaults.listen.to_string())?
            .set_default(
                "database_max_connections",
                i64::from(defaults.database_max_connections),
            )?
            .set_default("data_dir", defaults.data_dir.to_string_lossy().to_string())?
            .set_default("secure_cookies", defaults.secure_cookies)?
            .set_default("auto_migrate", defaults.auto_migrate)?
            .set_default("public_origin", defaults.public_origin)?
            .set_default("redis_namespace", defaults.redis_namespace)?
            .set_default("nats_namespace", defaults.nats_namespace)?
            .add_source(config::File::with_name("kit.toml").required(false))
            .add_source(config::File::with_name("config").required(false))
            .add_source(
                config::Environment::with_prefix("KITSUNE")
                    .prefix_separator("__")
                    .separator("__")
                    .try_parsing(true),
            );
        builder
            .build()?
            .try_deserialize()
            .context("invalid Kitsune configuration")
    }

    fn effective_features(&self) -> FeatureFlags {
        self.features
            .clone()
            .unwrap_or_else(|| FeatureFlags::for_profile(self.profile))
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .json()
        .with_current_span(true)
        .with_span_list(true)
        .init();

    let config = ServerConfig::load()?;
    let features = config.effective_features();
    let cookie_key = load_or_generate_cookie_key(&config.data_dir).await?;
    let store = PostgresStore::connect(&config.database_url, config.database_max_connections)
        .await
        .context("connect PostgreSQL")?;
    if config.auto_migrate {
        store.migrate().await.context("apply database migrations")?;
    }
    store.ready().await.context("database readiness")?;

    let cache: Arc<dyn Cache> = if let Some(redis_url) = &config.redis_url {
        Arc::new(
            RedisCache::connect(redis_url.expose_secret(), Some(&config.redis_namespace))
                .await
                .context("connect Redis cache")?,
        )
    } else {
        Arc::new(InProcessCache::new(100_000).context("lean cache")?)
    };
    let event_bus: Arc<dyn EventBus> = if let Some(nats_url) = &config.nats_url {
        Arc::new(
            NatsEventBus::connect(nats_url.expose_secret(), Some(&config.nats_namespace))
                .await
                .context("connect NATS event bus")?,
        )
    } else {
        Arc::new(InProcessEventBus::new(16_384).context("lean event bus")?)
    };
    let auth_repository = AuthRepository::new(store.pool().clone());
    let auth =
        AuthService::from_master_key(cookie_key.master()).context("authentication service")?;
    let tokens =
        TokenService::from_master_key(cookie_key.master()).context("programmatic token service")?;
    let public_origin = parse_public_origin(&config.public_origin, config.secure_cookies)?;
    let oidc = OidcService::new(config.oidc_trusted_origins.clone())
        .context("OIDC egress configuration")?;
    let passkeys =
        PasskeyService::new(&public_origin).context("passkey relying-party configuration")?;
    let saml_credentials = load_or_generate_saml_credentials(&config.data_dir).await?;
    let saml = SamlService::new(saml_credentials, config.saml_trusted_origins.clone())
        .context("SAML service-provider configuration")?;
    let mut state = AppState::new(
        store,
        auth_repository,
        auth,
        tokens,
        cache,
        event_bus,
        cookie_key,
        config.secure_cookies,
    )
    .with_oidc(oidc, features.external_auth, public_origin)
    .with_passkeys(passkeys)
    .with_saml(saml);
    if features.plugins {
        let plugins = PluginHost::new(PluginTrustStore::default(), PluginBudgets::default())
            .context("initialize Component Model plugin host")?;
        state = state.with_plugins(Arc::new(plugins));
    }
    if features.smtp {
        if let Some(smtp) = &config.smtp {
            let notifier = SmtpNotifier::new(smtp).context("SMTP notifier configuration")?;
            state = state.with_notifier(Arc::new(notifier));
        } else {
            warn!("SMTP is enabled without configuration; external email delivery is inactive");
        }
    } else if config.smtp.is_some() {
        warn!("SMTP configuration is present while the feature is disabled; configuration ignored");
    }
    let app = kitsune_api::router(state);
    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .with_context(|| format!("bind {}", config.listen))?;
    info!(
        address = %config.listen,
        profile = ?config.profile,
        features = ?features,
        "Kitsune is ready"
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("serve HTTP")
}

fn parse_public_origin(value: &str, secure_cookies: bool) -> Result<url::Url> {
    let origin = url::Url::parse(value).context("public_origin must be an absolute URL")?;
    if !matches!(origin.scheme(), "http" | "https")
        || origin.host().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
        || (secure_cookies && origin.scheme() != "https")
    {
        anyhow::bail!(
            "public_origin must contain only an HTTP(S) scheme, host, and optional port; HTTPS is required with secure cookies"
        );
    }
    Ok(origin)
}

async fn load_or_generate_cookie_key(data_dir: &std::path::Path) -> Result<Key> {
    let path = data_dir.join("secrets").join("cookie.key");
    match tokio::fs::read_to_string(&path).await {
        Ok(encoded) => {
            let bytes = URL_SAFE_NO_PAD
                .decode(encoded.trim())
                .context("decode cookie key")?;
            if bytes.len() < 64 {
                anyhow::bail!("cookie key must contain at least 64 bytes");
            }
            Ok(Key::from(&bytes))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = path.parent().context("cookie key parent")?;
            tokio::fs::create_dir_all(parent).await?;
            let mut bytes = [0_u8; 64];
            rand::fill(&mut bytes);
            let encoded = URL_SAFE_NO_PAD.encode(bytes);
            let mut options = tokio::fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                options.mode(0o600);
            }
            match options.open(&path).await {
                Ok(mut file) => {
                    use tokio::io::AsyncWriteExt;
                    file.write_all(encoded.as_bytes()).await?;
                    file.sync_all().await?;
                    info!(path = %path.display(), "generated cookie encryption key");
                    Ok(Key::from(&bytes))
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    warn!("another process generated the cookie key; reloading it");
                    let encoded = tokio::fs::read_to_string(&path).await?;
                    let bytes = URL_SAFE_NO_PAD.decode(encoded.trim())?;
                    Ok(Key::from(&bytes))
                }
                Err(error) => Err(error.into()),
            }
        }
        Err(error) => Err(error.into()),
    }
}

#[derive(Deserialize, Serialize)]
struct PersistedSamlCredentials {
    private_key_pem: String,
    certificate_pem: String,
}

async fn load_or_generate_saml_credentials(data_dir: &std::path::Path) -> Result<SamlCredentials> {
    let path = data_dir.join("secrets").join("saml-signing.json");
    match tokio::fs::read(&path).await {
        Ok(bytes) => decode_saml_credentials(&bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let generated = tokio::task::spawn_blocking(SamlCredentials::generate)
                .await
                .context("join SAML signing-key generation")?
                .context("generate SAML signing credentials")?;
            let persisted = PersistedSamlCredentials {
                private_key_pem: generated.private_key_pem().to_owned(),
                certificate_pem: generated.certificate_pem().to_owned(),
            };
            let encoded = serde_json::to_vec(&persisted).context("encode SAML credentials")?;
            let parent = path.parent().context("SAML credential parent")?;
            tokio::fs::create_dir_all(parent).await?;
            let mut options = tokio::fs::OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                options.mode(0o600);
            }
            match options.open(&path).await {
                Ok(mut file) => {
                    use tokio::io::AsyncWriteExt;
                    file.write_all(&encoded).await?;
                    file.sync_all().await?;
                    info!(path = %path.display(), "generated SAML signing credentials");
                    Ok(generated)
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    warn!("another process generated SAML credentials; reloading them");
                    decode_saml_credentials(&tokio::fs::read(&path).await?)
                }
                Err(error) => Err(error.into()),
            }
        }
        Err(error) => Err(error.into()),
    }
}

fn decode_saml_credentials(bytes: &[u8]) -> Result<SamlCredentials> {
    let persisted: PersistedSamlCredentials =
        serde_json::from_slice(bytes).context("decode SAML credentials")?;
    SamlCredentials::new(persisted.private_key_pem, persisted.certificate_pem)
        .context("validate SAML credentials")
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    info!("graceful shutdown requested");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lean_defaults_keep_heavy_features_off() {
        let config = ServerConfig::default();
        let features = config.effective_features();
        assert!(features.jeopardy);
        assert!(!features.attack_defense);
        assert!(!features.orchestration);
        assert!(!features.smtp);
        assert!(config.oidc_trusted_origins.is_empty());
        assert!(config.redis_url.is_none());
        assert!(config.nats_url.is_none());
    }

    #[test]
    fn scaled_adapter_credentials_are_redacted_from_configuration_debug() {
        let config = ServerConfig {
            redis_url: Some(SecretString::from(
                "rediss://user:never-log-me@example.test".to_owned(),
            )),
            nats_url: Some(SecretString::from(
                "tls://user:also-never-log-me@example.test".to_owned(),
            )),
            ..ServerConfig::default()
        };
        let debug = format!("{config:?}");
        assert!(!debug.contains("never-log-me"));
        assert!(!debug.contains("also-never-log-me"));
        assert!(debug.contains("REDACTED"));
    }

    #[test]
    fn public_origin_is_canonical_and_secure_when_cookies_are_secure() {
        assert!(parse_public_origin("http://localhost:3000", false).is_ok());
        assert!(parse_public_origin("https://ctf.example.test", true).is_ok());
        assert!(parse_public_origin("http://ctf.example.test", true).is_err());
        assert!(parse_public_origin("https://ctf.example.test/path", true).is_err());
    }

    #[tokio::test]
    async fn cookie_key_is_generated_once_and_reloaded() {
        let path = std::env::temp_dir().join(format!("kitsune-key-{}", uuid::Uuid::now_v7()));
        let first = load_or_generate_cookie_key(&path).await.expect("first key");
        let second = load_or_generate_cookie_key(&path)
            .await
            .expect("second key");
        assert_eq!(first.master(), second.master());
        tokio::fs::remove_dir_all(path).await.expect("cleanup");
    }
}
