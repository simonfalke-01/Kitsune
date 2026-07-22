//! Replay-safe WebAuthn passkey enrollment, login, and account management.

use std::{sync::Arc, time::Duration as StdDuration};

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use kitsune_core::{DomainError, EventEnvelope, events::DomainEvent};
use kitsune_db::passkeys::{
    NewPasskey, NewPasskeyFlow, PasskeyAccount, PasskeyFlowContext, PasskeyFlowKind, PasskeyRecord,
    PasskeyRepository, StoredPasskey, VerifiedPasskeyAuthentication,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyAuthentication, PasskeyRegistration,
    PublicKeyCredential, RegisterPublicKeyCredential, RequestChallengeResponse, Webauthn,
    WebauthnBuilder,
};

use crate::{
    Actor, ApiError, ApiResult, AppState, ErrorBody,
    auth::{SessionPrincipal, SessionResponse, issue_session, random_token, validate_slug},
};

const PASSKEY_FLOW_COOKIE: &str = "kit_passkey_flow";
const PASSKEY_FLOW_MINUTES: i64 = 5;
const MAX_CEREMONY_BYTES: usize = 128 * 1_024;
const MAX_CREDENTIAL_BYTES: usize = 64 * 1_024;

/// Exact-origin WebAuthn verifier.
#[derive(Clone)]
pub struct PasskeyService {
    webauthn: Arc<Webauthn>,
}

impl std::fmt::Debug for PasskeyService {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PasskeyService")
            .field("allowed_origins", &self.webauthn.get_allowed_origins())
            .finish()
    }
}

impl PasskeyService {
    /// Builds a required-user-verification relying party for one canonical
    /// browser origin.
    pub fn new(public_origin: &url::Url) -> Result<Self, DomainError> {
        let rp_id = public_origin.host_str().ok_or_else(|| {
            DomainError::Validation("passkey public origin must include a host".into())
        })?;
        let webauthn = WebauthnBuilder::new(rp_id, public_origin)
            .map_err(protocol_configuration)?
            .rp_name("Kitsune")
            .timeout(StdDuration::from_mins(5))
            .build()
            .map_err(protocol_configuration)?;
        Ok(Self {
            webauthn: Arc::new(webauthn),
        })
    }

    fn start_registration(
        &self,
        account: &PasskeyAccount,
        excluded: Vec<webauthn_rs::prelude::CredentialID>,
    ) -> ApiResult<(CreationChallengeResponse, PasskeyRegistration)> {
        self.webauthn
            .start_passkey_registration(
                account.user_id.0,
                &account.email,
                &account.display_name,
                Some(excluded),
            )
            .map_err(|_| ApiError::unauthorized())
    }

    fn finish_registration(
        &self,
        credential: &RegisterPublicKeyCredential,
        state: &PasskeyRegistration,
    ) -> ApiResult<Passkey> {
        self.webauthn
            .finish_passkey_registration(credential, state)
            .map_err(|_| ApiError::unauthorized())
    }

    fn start_authentication(
        &self,
        credentials: &[Passkey],
    ) -> ApiResult<(RequestChallengeResponse, PasskeyAuthentication)> {
        self.webauthn
            .start_passkey_authentication(credentials)
            .map_err(|_| ApiError::unauthorized())
    }

    fn finish_authentication(
        &self,
        credential: &PublicKeyCredential,
        state: &PasskeyAuthentication,
    ) -> ApiResult<webauthn_rs::prelude::AuthenticationResult> {
        self.webauthn
            .finish_passkey_authentication(credential, state)
            .map_err(|_| ApiError::unauthorized())
    }
}

impl Default for PasskeyService {
    fn default() -> Self {
        let origin = url::Url::parse("http://localhost:3000")
            .expect("static passkey development origin is valid");
        Self::new(&origin).expect("static passkey relying party is valid")
    }
}

/// Authenticated passkey enrollment input.
#[derive(Deserialize, ToSchema)]
pub struct StartPasskeyRegistrationRequest {
    /// Human-readable device label shown in account security.
    pub name: String,
}

/// Email-first, passwordless login input.
#[derive(Deserialize, ToSchema)]
pub struct StartPasskeyLoginRequest {
    /// Organization slug.
    pub organization: String,
    /// Account email.
    pub email: String,
    /// Optional application-local destination after login.
    pub return_to: Option<String>,
}

/// Browser-ready PublicKeyCredential options.
#[derive(Serialize, ToSchema)]
pub struct PasskeyCeremonyResponse {
    /// One-time flow identifier. Verification also requires the private,
    /// encrypted browser-binding cookie.
    pub flow_id: Uuid,
    /// WebAuthn creation or request options.
    #[schema(value_type = Object)]
    pub options: serde_json::Value,
}

/// Browser credential returned from `navigator.credentials.create` or
/// `navigator.credentials.get`.
#[derive(Deserialize, ToSchema)]
pub struct FinishPasskeyRequest {
    /// JSON-encoded WebAuthn PublicKeyCredential.
    pub credential: PasskeyBrowserCredential,
}

/// Browser-produced WebAuthn credential envelope.
#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyBrowserCredential {
    /// Base64url credential identifier.
    pub id: String,
    /// Base64url raw credential identifier.
    pub raw_id: String,
    /// WebAuthn credential kind, always `public-key`.
    #[serde(rename = "type")]
    pub kind: String,
    /// Authenticator registration or assertion response.
    pub response: PasskeyAuthenticatorResponse,
    /// Browser-processed extension outputs.
    #[serde(default)]
    #[schema(value_type = Object)]
    pub client_extension_results: serde_json::Value,
}

/// Union of attestation and assertion response fields. Registration and login
/// handlers pass the appropriate subset to the protocol verifier.
#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyAuthenticatorResponse {
    /// Signed client data.
    #[serde(rename = "clientDataJSON")]
    pub client_data_json: String,
    /// Registration attestation object.
    pub attestation_object: Option<String>,
    /// Login authenticator data.
    pub authenticator_data: Option<String>,
    /// Login assertion signature.
    pub signature: Option<String>,
    /// Optional discoverable-credential user handle.
    pub user_handle: Option<String>,
    /// Authenticator transports reported at registration.
    #[serde(default)]
    pub transports: Vec<String>,
}

/// Safe account-owned credential metadata.
#[derive(Serialize, ToSchema)]
pub struct PasskeyResponse {
    /// Credential database identifier.
    pub id: Uuid,
    /// Human-readable device label.
    pub name: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last successful use.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, Deserialize)]
struct RegistrationFlowState {
    ceremony: PasskeyRegistration,
    credential_name: String,
}

#[derive(Serialize, Deserialize)]
struct AuthenticationFlowState {
    ceremony: PasskeyAuthentication,
}

struct PendingPasskeyFlow<'a, T> {
    id: Uuid,
    account: &'a PasskeyAccount,
    kind: PasskeyFlowKind,
    browser_binding: &'a str,
    ceremony: &'a T,
    return_path: &'a str,
}

/// Begins an authenticated passkey enrollment.
#[utoipa::path(
    post,
    path = "/api/v1/auth/passkeys/register/start",
    tag = "auth",
    request_body = StartPasskeyRegistrationRequest,
    responses(
        (status = 200, body = PasskeyCeremonyResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn start_passkey_registration(
    State(state): State<AppState>,
    actor: Actor,
    jar: PrivateCookieJar,
    headers: HeaderMap,
    Json(request): Json<StartPasskeyRegistrationRequest>,
) -> ApiResult<(PrivateCookieJar, Json<PasskeyCeremonyResponse>)> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let name = validate_name(&request.name)?;
    enforce_flow_budget(
        &state,
        &format!("auth:passkey:register:{}", actor.session.account.user_id.0),
        8,
    )
    .await?;
    let repository = PasskeyRepository::new(state.db.pool().clone());
    let stored = repository
        .active_credentials(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    let passkeys = decode_passkeys(stored)?;
    let excluded = passkeys
        .iter()
        .map(|(_, passkey)| passkey.cred_id().clone())
        .collect();
    let account = passkey_account_from_actor(&actor);
    let (options, ceremony) = state.passkeys.start_registration(&account, excluded)?;
    let flow_id = Uuid::now_v7();
    let browser_binding = random_token(32);
    let flow_state = RegistrationFlowState {
        ceremony,
        credential_name: name.to_owned(),
    };
    persist_flow(
        &state,
        &repository,
        PendingPasskeyFlow {
            id: flow_id,
            account: &account,
            kind: PasskeyFlowKind::Registration,
            browser_binding: &browser_binding,
            ceremony: &flow_state,
            return_path: "/account/security",
        },
    )
    .await?;
    let response = ceremony_response(flow_id, &options)?;
    Ok((
        jar.add(flow_cookie(flow_id, browser_binding, state.secure_cookies)),
        Json(PasskeyCeremonyResponse {
            flow_id,
            options: response,
        }),
    ))
}

/// Completes an authenticated passkey enrollment.
#[utoipa::path(
    post,
    path = "/api/v1/auth/passkeys/register/finish",
    tag = "auth",
    request_body = FinishPasskeyRequest,
    responses(
        (status = 201, body = PasskeyResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn finish_passkey_registration(
    State(state): State<AppState>,
    actor: Actor,
    jar: PrivateCookieJar,
    headers: HeaderMap,
    Json(request): Json<FinishPasskeyRequest>,
) -> ApiResult<(StatusCode, PrivateCookieJar, Json<PasskeyResponse>)> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let (flow_id, binding) = flow_cookie_value(&jar)?;
    enforce_finish_budget(&state, flow_id).await?;
    let repository = PasskeyRepository::new(state.db.pool().clone());
    let flow = resolve_flow(
        &repository,
        flow_id,
        &binding,
        PasskeyFlowKind::Registration,
    )
    .await?;
    if flow.user_id != actor.session.account.user_id
        || flow.organization_id != actor.session.account.organization_id
    {
        return Err(ApiError::unauthorized());
    }
    let flow_state: RegistrationFlowState = open_state(&state, &flow)?;
    let browser_credential: RegisterPublicKeyCredential =
        decode_browser_credential(request.credential)?;
    let passkey = state
        .passkeys
        .finish_registration(&browser_credential, &flow_state.ceremony)?;
    let serialized = bounded_json(&passkey, MAX_CREDENTIAL_BYTES, "passkey credential")?;
    let credential_id = passkey.cred_id().as_ref();
    let mutation = repository
        .complete_registration(NewPasskey {
            id: Uuid::now_v7(),
            flow: &flow,
            credential_id,
            credential_subject: &URL_SAFE_NO_PAD.encode(credential_id),
            credential: &serialized,
            name: &flow_state.credential_name,
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(mutation.event)
        .await
        .map_err(ApiError::from)?;
    Ok((
        StatusCode::CREATED,
        jar.remove(flow_removal_cookie(state.secure_cookies)),
        Json(mutation.record.into()),
    ))
}

/// Begins an email-first passwordless passkey login.
#[utoipa::path(
    post,
    path = "/api/v1/auth/passkeys/login/start",
    tag = "auth",
    request_body = StartPasskeyLoginRequest,
    responses(
        (status = 200, body = PasskeyCeremonyResponse),
        (status = 401, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn start_passkey_login(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(request): Json<StartPasskeyLoginRequest>,
) -> ApiResult<(PrivateCookieJar, Json<PasskeyCeremonyResponse>)> {
    validate_slug(request.organization.trim())?;
    let identity_hint =
        hex_digest(format!("{}:{}", request.organization.trim(), request.email.trim()).as_bytes());
    enforce_flow_budget(&state, &format!("auth:passkey:login:{identity_hint}"), 10).await?;
    let repository = PasskeyRepository::new(state.db.pool().clone());
    let account = repository
        .account_by_email(request.organization.trim(), request.email.trim())
        .await
        .map_err(ApiError::from)?;
    let Some(account) = account else {
        publish_failed_login(&state, &identity_hint).await?;
        return Err(ApiError::unauthorized());
    };
    let stored = repository
        .active_credentials(account.organization_id, account.user_id)
        .await
        .map_err(ApiError::from)?;
    if stored.is_empty() {
        publish_failed_login(&state, &identity_hint).await?;
        return Err(ApiError::unauthorized());
    }
    let passkeys = decode_passkeys(stored)?;
    let credentials: Vec<Passkey> = passkeys
        .iter()
        .map(|(_, passkey)| passkey.clone())
        .collect();
    let (options, ceremony) = state.passkeys.start_authentication(&credentials)?;
    let flow_id = Uuid::now_v7();
    let browser_binding = random_token(32);
    let return_path = normalize_return_path(request.return_to.as_deref())?;
    let flow_state = AuthenticationFlowState { ceremony };
    persist_flow(
        &state,
        &repository,
        PendingPasskeyFlow {
            id: flow_id,
            account: &account,
            kind: PasskeyFlowKind::Authentication,
            browser_binding: &browser_binding,
            ceremony: &flow_state,
            return_path: &return_path,
        },
    )
    .await?;
    let response = ceremony_response(flow_id, &options)?;
    Ok((
        jar.add(flow_cookie(flow_id, browser_binding, state.secure_cookies)),
        Json(PasskeyCeremonyResponse {
            flow_id,
            options: response,
        }),
    ))
}

/// Completes passwordless passkey login and issues the standard Kitsune session.
#[utoipa::path(
    post,
    path = "/api/v1/auth/passkeys/login/finish",
    tag = "auth",
    request_body = FinishPasskeyRequest,
    responses(
        (status = 200, body = SessionResponse),
        (status = 401, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn finish_passkey_login(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(request): Json<FinishPasskeyRequest>,
) -> ApiResult<(PrivateCookieJar, Json<SessionResponse>)> {
    let (flow_id, binding) = flow_cookie_value(&jar)?;
    enforce_finish_budget(&state, flow_id).await?;
    let repository = PasskeyRepository::new(state.db.pool().clone());
    let flow = resolve_flow(
        &repository,
        flow_id,
        &binding,
        PasskeyFlowKind::Authentication,
    )
    .await?;
    let stored = repository
        .active_credentials(flow.organization_id, flow.user_id)
        .await
        .map_err(ApiError::from)?;
    let mut passkeys = decode_passkeys(stored)?;
    let flow_state: AuthenticationFlowState = open_state(&state, &flow)?;
    let browser_credential: PublicKeyCredential =
        match decode_browser_credential(request.credential) {
            Ok(credential) => credential,
            Err(_) => return reject_known_login(&state, &repository, &flow).await,
        };
    let Ok(result) = state
        .passkeys
        .finish_authentication(&browser_credential, &flow_state.ceremony)
    else {
        return reject_known_login(&state, &repository, &flow).await;
    };
    if !result.user_verified() {
        return reject_known_login(&state, &repository, &flow).await;
    }
    let result_credential_id = result.cred_id().as_ref();
    let Some(passkey_index) = passkeys
        .iter()
        .position(|(_, passkey)| passkey.cred_id().as_ref() == result_credential_id)
    else {
        return reject_known_login(&state, &repository, &flow).await;
    };
    let (_, passkey) = &mut passkeys[passkey_index];
    if passkey.update_credential(&result).is_none() {
        return reject_known_login(&state, &repository, &flow).await;
    }
    let serialized = bounded_json(passkey, MAX_CREDENTIAL_BYTES, "passkey credential")?;
    let mutation = repository
        .complete_authentication(VerifiedPasskeyAuthentication {
            flow: &flow,
            credential_id: result_credential_id,
            credential: &serialized,
            sign_count: i64::from(result.counter()),
            correlation_id: Uuid::now_v7(),
            now: Utc::now(),
        })
        .await
        .map_err(authentication_persistence_error)?;
    state
        .event_bus
        .publish(mutation.event)
        .await
        .map_err(ApiError::from)?;
    let principal = SessionPrincipal {
        user_id: mutation.account.user_id,
        organization_id: mutation.account.organization_id,
        display_name: mutation.account.display_name,
        email: mutation.account.email,
        email_verified: mutation.account.email_verified,
    };
    let jar = jar.remove(flow_removal_cookie(state.secure_cookies));
    let (jar, session) = issue_session(&state, jar, &principal).await?;
    Ok((jar, Json(session)))
}

/// Lists account-owned passkeys without exposing credential material.
#[utoipa::path(
    get,
    path = "/api/v1/auth/passkeys",
    tag = "auth",
    responses(
        (status = 200, body = [PasskeyResponse]),
        (status = 401, body = ErrorBody)
    )
)]
pub(crate) async fn list_passkeys(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<PasskeyResponse>>> {
    actor.require_interactive_session()?;
    let records = PasskeyRepository::new(state.db.pool().clone())
        .list(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(records.into_iter().map(Into::into).collect()))
}

/// Revokes one account-owned passkey.
#[utoipa::path(
    delete,
    path = "/api/v1/auth/passkeys/{credential_id}",
    tag = "auth",
    params(("credential_id" = Uuid, Path, description = "Passkey credential ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn revoke_passkey(
    State(state): State<AppState>,
    actor: Actor,
    Path(credential_id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<StatusCode> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let mutation = PasskeyRepository::new(state.db.pool().clone())
        .revoke(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            credential_id,
            Uuid::now_v7(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(mutation.event)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn persist_flow<T: Serialize>(
    state: &AppState,
    repository: &PasskeyRepository,
    flow: PendingPasskeyFlow<'_, T>,
) -> ApiResult<()> {
    let serialized = bounded_json(flow.ceremony, MAX_CEREMONY_BYTES, "passkey ceremony")?;
    let encrypted = state.auth.seal(&serialized).map_err(ApiError::from)?;
    let now = Utc::now();
    repository
        .begin_flow(NewPasskeyFlow {
            id: flow.id,
            user_id: flow.account.user_id,
            organization_id: flow.account.organization_id,
            kind: flow.kind,
            browser_binding_digest: Sha256::digest(flow.browser_binding.as_bytes()).as_slice(),
            encrypted_state: &encrypted,
            return_path: flow.return_path,
            expires_at: now + Duration::minutes(PASSKEY_FLOW_MINUTES),
            now,
        })
        .await
        .map_err(ApiError::from)
}

async fn resolve_flow(
    repository: &PasskeyRepository,
    flow_id: Uuid,
    browser_binding: &str,
    kind: PasskeyFlowKind,
) -> ApiResult<PasskeyFlowContext> {
    repository
        .resolve_flow(
            flow_id,
            Sha256::digest(browser_binding.as_bytes()).as_slice(),
            kind,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?
        .ok_or_else(ApiError::unauthorized)
}

fn decode_passkeys(stored: Vec<StoredPasskey>) -> ApiResult<Vec<(Uuid, Passkey)>> {
    stored
        .into_iter()
        .map(|stored| {
            if stored.credential.len() > MAX_CREDENTIAL_BYTES {
                return Err(ApiError::from(DomainError::Unavailable(
                    "stored passkey exceeds the credential budget".into(),
                )));
            }
            let passkey = serde_json::from_slice(&stored.credential).map_err(|_| {
                ApiError::from(DomainError::Unavailable(
                    "stored passkey cannot be decoded".into(),
                ))
            })?;
            Ok((stored.id, passkey))
        })
        .collect()
}

fn open_state<T: DeserializeOwned>(state: &AppState, flow: &PasskeyFlowContext) -> ApiResult<T> {
    let serialized = state
        .auth
        .open(&flow.encrypted_state)
        .map_err(ApiError::from)?;
    if serialized.len() > MAX_CEREMONY_BYTES {
        return Err(ApiError::unauthorized());
    }
    serde_json::from_slice(&serialized).map_err(|_| ApiError::unauthorized())
}

fn decode_browser_credential<T: DeserializeOwned, U: Serialize>(value: U) -> ApiResult<T> {
    let serialized = serde_json::to_vec(&value).map_err(|_| ApiError::unauthorized())?;
    if serialized.len() > MAX_CEREMONY_BYTES {
        return Err(ApiError::unauthorized());
    }
    serde_json::from_slice(&serialized).map_err(|_| ApiError::unauthorized())
}

fn bounded_json<T: Serialize>(value: &T, maximum: usize, description: &str) -> ApiResult<Vec<u8>> {
    let serialized = serde_json::to_vec(value).map_err(|_| {
        ApiError::from(DomainError::Unavailable(format!(
            "{description} cannot be encoded"
        )))
    })?;
    if serialized.len() > maximum {
        return Err(ApiError::from(DomainError::LimitExceeded(format!(
            "{description} exceeds its storage budget"
        ))));
    }
    Ok(serialized)
}

fn ceremony_response<T: Serialize>(flow_id: Uuid, options: &T) -> ApiResult<serde_json::Value> {
    let encoded = bounded_json(options, MAX_CEREMONY_BYTES, "passkey options")?;
    serde_json::from_slice(&encoded).map_err(|_| {
        ApiError::from(DomainError::Unavailable(format!(
            "passkey options for flow {flow_id} cannot be encoded"
        )))
    })
}

fn passkey_account_from_actor(actor: &Actor) -> PasskeyAccount {
    PasskeyAccount {
        user_id: actor.session.account.user_id,
        organization_id: actor.session.account.organization_id,
        display_name: actor.session.account.display_name.clone(),
        email: actor.session.account.email.clone(),
        email_verified: actor.session.account.email_verified,
    }
}

fn validate_name(name: &str) -> ApiResult<&str> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::from(DomainError::Validation(
            "passkey name must contain 1 to 80 characters".into(),
        )));
    }
    Ok(name)
}

fn normalize_return_path(return_to: Option<&str>) -> ApiResult<String> {
    let return_to = return_to.unwrap_or("/");
    if !return_to.starts_with('/') || return_to.starts_with("//") || return_to.len() > 2048 {
        return Err(ApiError::from(DomainError::Validation(
            "passkey return path must stay inside Kitsune".into(),
        )));
    }
    Ok(return_to.to_owned())
}

async fn enforce_flow_budget(state: &AppState, key: &str, maximum: u64) -> ApiResult<()> {
    let attempts = state
        .cache
        .increment(key, StdDuration::from_mins(5))
        .await
        .map_err(ApiError::from)?;
    if attempts > maximum {
        Err(ApiError::rate_limited())
    } else {
        Ok(())
    }
}

async fn enforce_finish_budget(state: &AppState, flow_id: Uuid) -> ApiResult<()> {
    enforce_flow_budget(state, &format!("auth:passkey:finish:{flow_id}"), 5).await
}

async fn publish_failed_login(state: &AppState, identity_hint: &str) -> ApiResult<()> {
    state
        .event_bus
        .publish(EventEnvelope::new_platform(
            Uuid::now_v7(),
            Utc::now(),
            DomainEvent::AuthenticationFailed {
                identity_hint: identity_hint.to_owned(),
                method: "webauthn_passkey".into(),
            },
        ))
        .await
        .map_err(ApiError::from)
}

async fn reject_known_login<T>(
    state: &AppState,
    repository: &PasskeyRepository,
    flow: &PasskeyFlowContext,
) -> ApiResult<T> {
    let identity_hint = hex_digest(flow.user_id.0.as_bytes());
    let event = repository
        .record_authentication_failure(flow, &identity_hint, Uuid::now_v7(), Utc::now())
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Err(ApiError::unauthorized())
}

fn flow_cookie(flow_id: Uuid, binding: String, secure: bool) -> Cookie<'static> {
    Cookie::build((PASSKEY_FLOW_COOKIE, format!("{flow_id}.{binding}")))
        .path("/api/v1/auth/passkeys/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::minutes(PASSKEY_FLOW_MINUTES))
        .build()
}

fn flow_cookie_value(jar: &PrivateCookieJar) -> ApiResult<(Uuid, String)> {
    let value = jar
        .get(PASSKEY_FLOW_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(ApiError::unauthorized)?;
    let (flow_id, binding) = value.split_once('.').ok_or_else(ApiError::unauthorized)?;
    let flow_id = Uuid::parse_str(flow_id).map_err(|_| ApiError::unauthorized())?;
    if binding.len() < 32 || binding.len() > 128 {
        return Err(ApiError::unauthorized());
    }
    Ok((flow_id, binding.to_owned()))
}

fn flow_removal_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build(PASSKEY_FLOW_COOKIE)
        .path("/api/v1/auth/passkeys/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::ZERO)
        .build()
}

fn hex_digest(value: &[u8]) -> String {
    hex::encode(Sha256::digest(value))
}

fn protocol_configuration(error: impl std::fmt::Display) -> DomainError {
    DomainError::Validation(format!("passkey relying party is invalid: {error}"))
}

fn authentication_persistence_error(error: DomainError) -> ApiError {
    match error {
        DomainError::NotFound | DomainError::Conflict(_) => ApiError::unauthorized(),
        error => ApiError::from(error),
    }
}

impl From<PasskeyRecord> for PasskeyResponse {
    fn from(record: PasskeyRecord) -> Self {
        Self {
            id: record.id,
            name: record.name,
            created_at: record.created_at,
            last_used_at: record.last_used_at,
            revoked_at: record.revoked_at,
        }
    }
}
