//! Signed, capability-secured Wasmtime Component Model plugin host.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use dashmap::DashMap;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use kitsune_core::{DomainError, DomainResult};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tokio::sync::Semaphore;
use wasmtime::component::{Component, Linker};
use wasmtime::{Config, Engine, Store, StoreLimits, StoreLimitsBuilder};

wasmtime::component::bindgen!({
    path: "../../wit",
    world: "challenge-verifier-plugin",
    exports: { default: async },
});

const SIGNATURE_DOMAIN: &[u8] = b"kitsune.plugin.manifest.v1\0";
const MAXIMUM_ARTIFACT_BYTES: usize = 32 * 1024 * 1024;
const MAXIMUM_ANSWER_BYTES: usize = 4 * 1024;
const MAXIMUM_JSON_BYTES: usize = 64 * 1024;

/// Explicit capabilities understood by the v1 plugin host.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PluginCapability {
    /// Register and execute challenge answer verifiers.
    ChallengeVerify,
    /// Read an explicitly scoped event projection through a future host import.
    EventRead,
    /// Use namespaced plugin storage through a future host import.
    Storage,
    /// Send HTTP only to an operator allow-list through a future host import.
    HttpEgress,
}

/// Ed25519 signature attached to a plugin manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestSignature {
    /// Operator trust-store key identifier.
    pub key_id: String,
    /// URL-safe unpadded Ed25519 signature bytes.
    pub signature: String,
}

/// Signed plugin manifest used by local, Git, and registry installation paths.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginManifest {
    /// Stable package name.
    pub name: String,
    /// Semantic version.
    pub version: Version,
    /// Lowercase SHA-256 digest of the component bytes.
    pub artifact_sha256: String,
    /// Declared capabilities subject to operator grants.
    pub capabilities: BTreeSet<PluginCapability>,
    /// Challenge kinds implemented by the verifier world.
    pub challenge_kinds: BTreeSet<String>,
    /// Publisher signature.
    pub signature: ManifestSignature,
}

impl PluginManifest {
    /// Returns the domain-separated canonical bytes publishers sign.
    pub fn signing_payload(&self) -> DomainResult<Vec<u8>> {
        signed_manifest_payload(self)
    }
}

#[derive(Serialize)]
struct UnsignedManifest<'a> {
    name: &'a str,
    version: &'a Version,
    artifact_sha256: &'a str,
    capabilities: &'a BTreeSet<PluginCapability>,
    challenge_kinds: &'a BTreeSet<String>,
}

/// Operator-controlled publisher trust store.
#[derive(Debug, Clone, Default)]
pub struct PluginTrustStore {
    keys: BTreeMap<String, VerifyingKey>,
}

impl PluginTrustStore {
    /// Adds or replaces one publisher key.
    pub fn insert(&mut self, key_id: impl Into<String>, key: VerifyingKey) -> DomainResult<()> {
        let key_id = key_id.into();
        validate_key(&key_id, "publisher key", 120)?;
        self.keys.insert(key_id, key);
        Ok(())
    }

    fn verify(&self, manifest: &PluginManifest) -> DomainResult<()> {
        let key = self
            .keys
            .get(&manifest.signature.key_id)
            .ok_or(DomainError::Forbidden)?;
        let signature_bytes = URL_SAFE_NO_PAD
            .decode(&manifest.signature.signature)
            .map_err(|_| {
                DomainError::Validation("plugin signature is not valid base64url".into())
            })?;
        let signature = Signature::from_slice(&signature_bytes).map_err(|_| {
            DomainError::Validation("plugin signature has an invalid length".into())
        })?;
        let payload = manifest.signing_payload()?;
        key.verify(&payload, &signature)
            .map_err(|_| DomainError::Forbidden)
    }
}

/// Runtime budgets applied independently to every component invocation.
#[derive(Debug, Clone, Copy)]
pub struct PluginBudgets {
    /// Maximum linear-memory bytes per memory.
    pub memory_bytes: usize,
    /// Wasmtime fuel available to one verifier call.
    pub fuel: u64,
    /// Wall-clock ceiling enforced through engine epochs.
    pub timeout: Duration,
    /// Concurrent calls admitted for one installed plugin.
    pub concurrency: usize,
}

impl Default for PluginBudgets {
    fn default() -> Self {
        Self {
            memory_bytes: 16 * 1024 * 1024,
            fuel: 5_000_000,
            timeout: Duration::from_millis(100),
            concurrency: 32,
        }
    }
}

impl PluginBudgets {
    fn validate(self) -> DomainResult<Self> {
        if !(64 * 1024..=256 * 1024 * 1024).contains(&self.memory_bytes)
            || !(10_000..=1_000_000_000).contains(&self.fuel)
            || !(Duration::from_millis(5)..=Duration::from_secs(30)).contains(&self.timeout)
            || !(1..=1_024).contains(&self.concurrency)
        {
            return Err(DomainError::Validation(
                "plugin runtime budgets are outside safe bounds".into(),
            ));
        }
        Ok(self)
    }
}

/// Typed request passed to a capability-bound challenge verifier.
pub struct VerifyChallengeAnswer<'a> {
    /// Installed plugin name.
    pub plugin: &'a str,
    /// Registered challenge kind within that plugin.
    pub kind: &'a str,
    /// Player answer.
    pub answer: &'a str,
    /// Bounded, versioned public verification context.
    pub context: &'a serde_json::Value,
    /// Bounded organizer-authored plugin configuration.
    pub config: &'a serde_json::Value,
}

/// Plugin verifier decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerificationDecision {
    /// Answer is not valid.
    Incorrect,
    /// Answer is valid.
    Correct,
}

struct InstalledPlugin {
    manifest: PluginManifest,
    component: Component,
    concurrency: Arc<Semaphore>,
}

struct StoreState {
    limits: StoreLimits,
}

/// In-process Component Model host. Installed components have no ambient imports.
#[derive(Clone)]
pub struct PluginHost {
    engine: Engine,
    trust: PluginTrustStore,
    budgets: PluginBudgets,
    plugins: Arc<DashMap<String, Arc<InstalledPlugin>>>,
    epoch_ticker: Arc<EpochTicker>,
}

struct EpochTicker {
    stop: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    interval: Duration,
}

impl EpochTicker {
    fn start(engine: Engine) -> DomainResult<Self> {
        let interval = Duration::from_millis(5);
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let worker = std::thread::Builder::new()
            .name("kitsune-plugin-epoch".into())
            .spawn(move || {
                while !worker_stop.load(Ordering::Acquire) {
                    std::thread::sleep(interval);
                    engine.increment_epoch();
                }
            })
            .map_err(|error| {
                DomainError::Unavailable(format!("start plugin epoch ticker: {error}"))
            })?;
        Ok(Self {
            stop,
            worker: Some(worker),
            interval,
        })
    }

    fn deadline_ticks(&self, timeout: Duration) -> u64 {
        let timeout_nanos = timeout.as_nanos();
        let interval_nanos = self.interval.as_nanos();
        let ticks = timeout_nanos.div_ceil(interval_nanos).max(1);
        u64::try_from(ticks).unwrap_or(u64::MAX)
    }
}

impl Drop for EpochTicker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl std::fmt::Debug for PluginHost {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PluginHost")
            .field("budgets", &self.budgets)
            .field("installed_plugins", &self.plugins.len())
            .finish_non_exhaustive()
    }
}

impl PluginHost {
    /// Builds a deterministic runtime with component, fuel, and epoch support.
    pub fn new(trust: PluginTrustStore, budgets: PluginBudgets) -> DomainResult<Self> {
        let budgets = budgets.validate()?;
        let mut config = Config::new();
        config.wasm_component_model(true);
        config.consume_fuel(true);
        config.epoch_interruption(true);
        let engine = Engine::new(&config)
            .map_err(|error| DomainError::Unavailable(format!("plugin engine: {error}")))?;
        let epoch_ticker = Arc::new(EpochTicker::start(engine.clone())?);
        Ok(Self {
            engine,
            trust,
            budgets,
            plugins: Arc::new(DashMap::new()),
            epoch_ticker,
        })
    }

    /// Verifies and compiles one signed component before atomically installing it.
    pub fn install(&self, manifest: PluginManifest, artifact: &[u8]) -> DomainResult<()> {
        validate_manifest(&manifest)?;
        if artifact.is_empty() || artifact.len() > MAXIMUM_ARTIFACT_BYTES {
            return Err(DomainError::LimitExceeded(
                "plugin artifact must contain 1 byte to 32 MiB".into(),
            ));
        }
        let artifact_sha256 = hex::encode(Sha256::digest(artifact));
        if !bool::from(
            artifact_sha256
                .as_bytes()
                .ct_eq(manifest.artifact_sha256.as_bytes()),
        ) {
            return Err(DomainError::Validation(
                "plugin artifact digest does not match its manifest".into(),
            ));
        }
        self.trust.verify(&manifest)?;
        let component = Component::new(&self.engine, artifact)
            .map_err(|error| DomainError::Validation(format!("plugin component: {error}")))?;
        let key = manifest.name.clone();
        let installed = InstalledPlugin {
            manifest,
            component,
            concurrency: Arc::new(Semaphore::new(self.budgets.concurrency)),
        };
        self.plugins.insert(key, Arc::new(installed));
        Ok(())
    }

    /// Removes an installed component from new invocations.
    pub fn remove(&self, name: &str) -> DomainResult<bool> {
        validate_key(name, "plugin name", 120)?;
        Ok(self.plugins.remove(name).is_some())
    }

    /// Executes an installed verifier under its declared capability and budgets.
    pub async fn verify(
        &self,
        request: VerifyChallengeAnswer<'_>,
    ) -> DomainResult<VerificationDecision> {
        validate_key(request.plugin, "plugin", 120)?;
        validate_key(request.kind, "challenge kind", 120)?;
        if request.answer.is_empty() || request.answer.len() > MAXIMUM_ANSWER_BYTES {
            return Err(DomainError::Validation(
                "plugin answer must contain 1 to 4096 bytes".into(),
            ));
        }
        let context = bounded_json(request.context, "plugin context")?;
        let plugin_config = bounded_json(request.config, "plugin configuration")?;
        let plugin = self
            .plugins
            .get(request.plugin)
            .map(|entry| Arc::clone(entry.value()))
            .ok_or(DomainError::NotFound)?;
        if !plugin
            .manifest
            .capabilities
            .contains(&PluginCapability::ChallengeVerify)
            || !plugin.manifest.challenge_kinds.contains(request.kind)
        {
            return Err(DomainError::Forbidden);
        }
        let _permit = plugin
            .concurrency
            .clone()
            .try_acquire_owned()
            .map_err(|_| DomainError::LimitExceeded("plugin concurrency is saturated".into()))?;

        let linker = Linker::new(&self.engine);
        let mut store = Store::new(
            &self.engine,
            StoreState {
                limits: StoreLimitsBuilder::new()
                    .memory_size(self.budgets.memory_bytes)
                    .instances(8)
                    .tables(8)
                    .memories(4)
                    .trap_on_grow_failure(true)
                    .build(),
            },
        );
        store.limiter(|state| &mut state.limits);
        store
            .set_fuel(self.budgets.fuel)
            .map_err(plugin_unavailable)?;
        store.set_epoch_deadline(self.epoch_ticker.deadline_ticks(self.budgets.timeout));
        store.epoch_deadline_trap();

        let bindings =
            ChallengeVerifierPlugin::instantiate_async(&mut store, &plugin.component, &linker)
                .await
                .map_err(plugin_unavailable)?;
        let result = bindings
            .kitsune_plugin_challenge_verifier()
            .call_verify(
                &mut store,
                request.answer.as_bytes(),
                &context,
                &plugin_config,
            )
            .await
            .map_err(plugin_unavailable)?;

        Ok(match result {
            exports::kitsune::plugin::challenge_verifier::Verification::Incorrect => {
                VerificationDecision::Incorrect
            }
            exports::kitsune::plugin::challenge_verifier::Verification::Correct => {
                VerificationDecision::Correct
            }
        })
    }
}

fn validate_manifest(manifest: &PluginManifest) -> DomainResult<()> {
    validate_key(&manifest.name, "plugin name", 120)?;
    validate_key(&manifest.signature.key_id, "publisher key", 120)?;
    if manifest.artifact_sha256.len() != 64
        || !manifest
            .artifact_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(DomainError::Validation(
            "plugin artifact digest must be lowercase SHA-256 hex".into(),
        ));
    }
    if !manifest
        .capabilities
        .contains(&PluginCapability::ChallengeVerify)
        || manifest.challenge_kinds.is_empty()
        || manifest.challenge_kinds.len() > 64
    {
        return Err(DomainError::Validation(
            "challenge plugins must declare verification and at least one bounded kind".into(),
        ));
    }
    for kind in &manifest.challenge_kinds {
        validate_key(kind, "challenge kind", 120)?;
    }
    Ok(())
}

fn signed_manifest_payload(manifest: &PluginManifest) -> DomainResult<Vec<u8>> {
    let unsigned = UnsignedManifest {
        name: &manifest.name,
        version: &manifest.version,
        artifact_sha256: &manifest.artifact_sha256,
        capabilities: &manifest.capabilities,
        challenge_kinds: &manifest.challenge_kinds,
    };
    let encoded = serde_json::to_vec(&unsigned)
        .map_err(|error| DomainError::Validation(format!("plugin manifest: {error}")))?;
    let mut payload = Vec::with_capacity(SIGNATURE_DOMAIN.len() + encoded.len());
    payload.extend_from_slice(SIGNATURE_DOMAIN);
    payload.extend_from_slice(&encoded);
    Ok(payload)
}

fn bounded_json(value: &serde_json::Value, field: &str) -> DomainResult<Vec<u8>> {
    let encoded = serde_json::to_vec(value)
        .map_err(|error| DomainError::Validation(format!("{field}: {error}")))?;
    if encoded.len() > MAXIMUM_JSON_BYTES {
        return Err(DomainError::LimitExceeded(format!(
            "{field} exceeds 64 KiB"
        )));
    }
    Ok(encoded)
}

fn validate_key(value: &str, field: &str, maximum: usize) -> DomainResult<()> {
    let valid = !value.is_empty()
        && value.len() <= maximum
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
    if valid {
        Ok(())
    } else {
        Err(DomainError::Validation(format!(
            "{field} contains unsupported characters or exceeds its bound"
        )))
    }
}

fn plugin_unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("plugin invocation: {error}"))
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, time::Duration};

    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    use ed25519_dalek::{Signer, SigningKey};
    use kitsune_core::DomainError;
    use semver::Version;
    use sha2::{Digest, Sha256};

    use super::{
        ManifestSignature, PluginBudgets, PluginCapability, PluginHost, PluginManifest,
        PluginTrustStore, VerificationDecision, VerifyChallengeAnswer,
    };

    const VERIFY_COMPONENT: &str = include_str!("../../../plugins/foxfire-verifier/component.wat");

    const LOOP_COMPONENT: &str = r#"
        (component
            (type $verification (enum "incorrect" "correct"))
            (type $verify (func
                (param "answer" (list u8))
                (param "context-json" (list u8))
                (param "config-json" (list u8))
                (result $verification)))
            (core module $module
                (memory (export "memory") 1 256)
                (global $heap (mut i32) (i32.const 1024))
                (func (export "cabi_realloc")
                    (param i32 i32 i32 i32)
                    (result i32)
                    global.get $heap)
                (func (export "verify")
                    (param i32 i32 i32 i32 i32 i32)
                    (result i32)
                    loop $forever
                        br $forever
                    end
                    i32.const 0))
            (core instance $instance (instantiate $module))
            (alias core export $instance "memory" (core memory $memory))
            (alias core export $instance "cabi_realloc" (core func $realloc))
            (alias core export $instance "verify" (core func $verify-core))
            (func $verify (type $verify)
                (canon lift (core func $verify-core)
                    (memory $memory)
                    (realloc $realloc)))
            (instance $verifier
                (export "verification" (type $verification))
                (export "verify" (func $verify)))
            (export "kitsune:plugin/challenge-verifier@0.1.0"
                (instance $verifier)))
    "#;

    #[tokio::test]
    async fn signed_component_verifies_answers_without_ambient_capabilities() {
        let signing_key = signing_key();
        let mut trust = PluginTrustStore::default();
        trust
            .insert("first-party", signing_key.verifying_key())
            .expect("trust publisher");
        let host = PluginHost::new(trust, PluginBudgets::default()).expect("plugin host");
        let manifest = signed_manifest(
            "foxfire-verifier",
            "memory-corruption",
            VERIFY_COMPONENT.as_bytes(),
            &signing_key,
        );
        host.install(manifest, VERIFY_COMPONENT.as_bytes())
            .expect("install signed component");

        for (answer, expected) in [
            ("kit{component-verified}", VerificationDecision::Correct),
            ("kit{component-rejected}", VerificationDecision::Incorrect),
        ] {
            let decision = host
                .verify(VerifyChallengeAnswer {
                    plugin: "foxfire-verifier",
                    kind: "memory-corruption",
                    answer,
                    context: &serde_json::json!({"event_schema": 1}),
                    config: &serde_json::json!({"strict": true}),
                })
                .await
                .expect("verify answer");
            assert_eq!(decision, expected);
        }
    }

    #[tokio::test]
    async fn signatures_digests_kinds_and_execution_time_fail_closed() {
        let signing_key = signing_key();
        let mut trust = PluginTrustStore::default();
        trust
            .insert("first-party", signing_key.verifying_key())
            .expect("trust publisher");
        let host = PluginHost::new(
            trust,
            PluginBudgets {
                fuel: 100_000,
                timeout: Duration::from_millis(20),
                ..PluginBudgets::default()
            },
        )
        .expect("plugin host");

        let manifest = signed_manifest(
            "bounded-verifier",
            "loop-test",
            LOOP_COMPONENT.as_bytes(),
            &signing_key,
        );
        let mut tampered = LOOP_COMPONENT.as_bytes().to_vec();
        tampered.push(b' ');
        assert!(matches!(
            host.install(manifest.clone(), &tampered),
            Err(DomainError::Validation(_))
        ));
        host.install(manifest, LOOP_COMPONENT.as_bytes())
            .expect("install loop component");

        assert_eq!(
            host.verify(VerifyChallengeAnswer {
                plugin: "bounded-verifier",
                kind: "undeclared-kind",
                answer: "kit{bounded-answer}",
                context: &serde_json::json!({}),
                config: &serde_json::json!({}),
            })
            .await,
            Err(DomainError::Forbidden)
        );
        let started = std::time::Instant::now();
        let trapped = host
            .verify(VerifyChallengeAnswer {
                plugin: "bounded-verifier",
                kind: "loop-test",
                answer: "kit{bounded-answer}",
                context: &serde_json::json!({}),
                config: &serde_json::json!({}),
            })
            .await;
        assert!(matches!(trapped, Err(DomainError::Unavailable(_))));
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    fn signing_key() -> SigningKey {
        let mut bytes = [0_u8; 32];
        rand::fill(&mut bytes);
        SigningKey::from_bytes(&bytes)
    }

    fn signed_manifest(
        name: &str,
        kind: &str,
        artifact: &[u8],
        signing_key: &SigningKey,
    ) -> PluginManifest {
        let mut manifest = PluginManifest {
            name: name.into(),
            version: Version::new(1, 0, 0),
            artifact_sha256: hex::encode(Sha256::digest(artifact)),
            capabilities: BTreeSet::from([PluginCapability::ChallengeVerify]),
            challenge_kinds: BTreeSet::from([kind.into()]),
            signature: ManifestSignature {
                key_id: "first-party".into(),
                signature: String::new(),
            },
        };
        let payload = manifest.signing_payload().expect("manifest payload");
        manifest.signature.signature =
            URL_SAFE_NO_PAD.encode(signing_key.sign(&payload).to_bytes());
        manifest
    }
}
