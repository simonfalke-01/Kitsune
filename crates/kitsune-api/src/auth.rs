//! Local account bootstrap and opaque encrypted-cookie sessions.

use std::{sync::Arc, time::Duration as StdDuration};

use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json,
    extract::{FromRequestParts, Path, State},
    http::{HeaderMap, StatusCode, request::Parts},
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit},
};
use chrono::{Duration, Utc};
use kitsune_core::{
    DomainError, EventEnvelope,
    events::DomainEvent,
    identity::{OrganizationId, UserId},
    ports::EventBus,
};
use kitsune_db::auth::{AuthRepository, LocalAccount, SessionAccount};
use rand::Rng as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use totp_rs::{Algorithm as TotpAlgorithm, Secret, TOTP};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, ErrorBody};

const SESSION_COOKIE: &str = "kit_session";
const CSRF_COOKIE: &str = "kit_csrf";
const SESSION_HOURS: i64 = 12;

/// Argon2id and token service with production parameter floors.
#[derive(Clone)]
pub struct AuthService {
    argon2: Argon2<'static>,
    dummy_hash: Arc<String>,
    data_key: Arc<[u8; 32]>,
}

impl AuthService {
    /// Constructs Argon2id with OWASP-aligned memory/time/parallelism defaults.
    pub fn new() -> Result<Self, DomainError> {
        let mut master = [0_u8; 64];
        rand::rng().fill(&mut master);
        Self::from_master_key(&master)
    }

    /// Constructs the service from stable installation key material so sealed
    /// MFA secrets survive process restarts.
    pub fn from_master_key(master: &[u8]) -> Result<Self, DomainError> {
        if master.len() < 32 {
            return Err(DomainError::Validation(
                "authentication master key must be at least 32 bytes".into(),
            ));
        }
        let params = Params::new(19 * 1_024, 2, 1, Some(32))
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let dummy_hash = hash_with(&argon2, "kitsune-dummy-password-never-accepted")?;
        let mut data_key = [0_u8; 32];
        data_key.copy_from_slice(&Sha256::digest(master));
        Ok(Self {
            argon2,
            dummy_hash: Arc::new(dummy_hash),
            data_key: Arc::new(data_key),
        })
    }

    /// Hashes a policy-valid password on a blocking worker.
    pub async fn hash_password(&self, password: String) -> Result<String, DomainError> {
        validate_password(&password)?;
        let argon2 = self.argon2.clone();
        tokio::task::spawn_blocking(move || hash_with(&argon2, &password))
            .await
            .map_err(|_| DomainError::Unavailable("password worker failed".into()))?
    }

    /// Performs a timing-shaped verification even when the identity is absent.
    pub async fn verify_password(
        &self,
        account: Option<&LocalAccount>,
        password: String,
    ) -> Result<bool, DomainError> {
        let argon2 = self.argon2.clone();
        let encoded = account.map_or_else(
            || (*self.dummy_hash).clone(),
            |account| account.password_hash.clone(),
        );
        let eligible = account.is_some_and(|account| !account.disabled);
        let verified = tokio::task::spawn_blocking(move || {
            PasswordHash::new(&encoded)
                .ok()
                .is_some_and(|hash| argon2.verify_password(password.as_bytes(), &hash).is_ok())
        })
        .await
        .map_err(|_| DomainError::Unavailable("password worker failed".into()))?;
        Ok(eligible && verified)
    }

    /// Authenticated-encrypts sensitive database material with an installation
    /// key and a fresh extended nonce.
    pub fn seal(&self, plaintext: &[u8]) -> Result<Vec<u8>, DomainError> {
        let cipher = XChaCha20Poly1305::new(self.data_key.as_ref().into());
        let mut nonce = [0_u8; 24];
        rand::rng().fill(&mut nonce);
        let ciphertext = cipher
            .encrypt(XNonce::from_slice(&nonce), plaintext)
            .map_err(|_| DomainError::Unavailable("secret encryption failed".into()))?;
        let mut sealed = nonce.to_vec();
        sealed.extend(ciphertext);
        Ok(sealed)
    }

    /// Opens authenticated database material and rejects tampering.
    pub fn open(&self, sealed: &[u8]) -> Result<Vec<u8>, DomainError> {
        let (nonce, ciphertext) = sealed
            .split_at_checked(24)
            .ok_or_else(|| DomainError::Validation("sealed secret is malformed".into()))?;
        XChaCha20Poly1305::new(self.data_key.as_ref().into())
            .decrypt(XNonce::from_slice(nonce), ciphertext)
            .map_err(|_| DomainError::Validation("sealed secret authentication failed".into()))
    }
}

impl Default for AuthService {
    fn default() -> Self {
        Self::new().expect("static Argon2 parameters are valid")
    }
}

/// First-run state.
#[derive(Debug, Serialize, ToSchema)]
pub struct SetupStatusResponse {
    /// True when no user exists and setup can be completed.
    pub required: bool,
}

/// First organization and administrator input.
#[derive(Deserialize, ToSchema)]
pub struct SetupRequest {
    /// Organization display name.
    pub organization_name: String,
    /// URL-safe organization key.
    pub organization_slug: String,
    /// Administrator display name.
    pub display_name: String,
    /// Administrator email.
    pub email: String,
    /// Administrator password (12–128 characters).
    #[schema(value_type = String, format = Password)]
    pub password: String,
}

/// Local login input.
#[derive(Deserialize, ToSchema)]
pub struct LoginRequest {
    /// Organization slug.
    pub organization: String,
    /// Account email.
    pub email: String,
    /// Account password.
    #[schema(value_type = String, format = Password)]
    pub password: String,
    /// Six-digit TOTP or a single-use recovery code when MFA is enabled.
    pub mfa_code: Option<String>,
}

/// Local self-registration input.
#[derive(Deserialize, ToSchema)]
pub struct RegisterRequest {
    /// Organization slug to join.
    pub organization: String,
    /// Public display name.
    pub display_name: String,
    /// Account email.
    pub email: String,
    /// Account password (12–128 characters).
    #[schema(value_type = String, format = Password)]
    pub password: String,
}

/// One opaque token input.
#[derive(Deserialize, ToSchema)]
pub struct TokenRequest {
    /// URL-safe one-time token.
    pub token: String,
}

/// Begin recovery without revealing whether an identity exists.
#[derive(Deserialize, ToSchema)]
pub struct RecoveryStartRequest {
    /// Organization slug.
    pub organization: String,
    /// Account email.
    pub email: String,
}

/// Complete recovery with a new password.
#[derive(Deserialize, ToSchema)]
pub struct RecoveryCompleteRequest {
    /// URL-safe one-time token.
    pub token: String,
    /// Replacement password.
    #[schema(value_type = String, format = Password)]
    pub password: String,
}

/// TOTP enrollment data for an authenticator application.
#[derive(Serialize, ToSchema)]
pub struct TotpEnrollmentResponse {
    /// Base32 secret for manual entry.
    pub secret: String,
    /// Standard `otpauth://` provisioning URI.
    pub provisioning_uri: String,
}

/// TOTP setup proof.
#[derive(Deserialize, ToSchema)]
pub struct TotpConfirmRequest {
    /// Current six-digit authenticator code.
    pub code: String,
}

/// Recovery codes are returned exactly once.
#[derive(Serialize, ToSchema)]
pub struct RecoveryCodesResponse {
    /// Single-use codes. The operator must store these safely.
    pub codes: Vec<String>,
}

/// One active login session.
#[derive(Serialize, ToSchema)]
pub struct SessionSummaryResponse {
    /// Session ID.
    pub id: Uuid,
    /// Whether this is the calling session.
    pub current: bool,
    /// Creation timestamp.
    pub created_at: chrono::DateTime<Utc>,
    /// Last request timestamp.
    pub last_seen_at: chrono::DateTime<Utc>,
    /// Expiry timestamp.
    pub expires_at: chrono::DateTime<Utc>,
}

/// Safe account projection.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserResponse {
    /// User ID.
    pub id: Uuid,
    /// Organization ID.
    pub organization_id: Uuid,
    /// Display name.
    pub display_name: String,
    /// Normalized email.
    pub email: String,
    /// Email ownership state.
    pub email_verified: bool,
}

/// Session bootstrap used by the Svelte client.
#[derive(Debug, Serialize, ToSchema)]
pub struct SessionResponse {
    /// Current account.
    pub user: UserResponse,
    /// CSRF value required in `x-csrf-token` on mutations.
    pub csrf_token: String,
    /// Applicable permission keys.
    pub permissions: Vec<String>,
    /// Session expiry.
    pub expires_at: chrono::DateTime<Utc>,
}

/// Authenticated session plus stored CSRF digest.
pub struct SessionIdentity {
    /// Account/session projection.
    pub account: SessionAccount,
    csrf_digest: Vec<u8>,
}

/// Deny-by-default authenticated actor extractor for protected resources.
/// Handlers must additionally name the fine-grained permission they require.
pub struct Actor {
    /// Account and session scope.
    pub session: SessionIdentity,
    permissions: std::collections::HashSet<String>,
}

impl Actor {
    /// Rejects the request unless the resolved scoped grants contain `key`.
    pub fn require(&self, key: &str) -> ApiResult<()> {
        if self.permissions.contains(key) {
            Ok(())
        } else {
            Err(ApiError::from(DomainError::Forbidden))
        }
    }

    /// Enforces CSRF on cookie-authenticated mutations.
    pub fn require_csrf(&self, headers: &HeaderMap) -> ApiResult<()> {
        self.session.require_csrf(headers)
    }

    /// Returns true for a granted permission without weakening handler checks.
    pub fn can(&self, key: &str) -> bool {
        self.permissions.contains(key)
    }
}

impl FromRequestParts<AppState> for Actor {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let jar = PrivateCookieJar::from_request_parts(parts, state)
            .await
            .map_err(|_| ApiError::unauthorized())?;
        let session = SessionIdentity::require(&state.auth_repository, &jar).await?;
        let permissions = state
            .auth_repository
            .permission_keys(
                session.account.user_id,
                session.account.organization_id,
                None,
            )
            .await
            .map_err(ApiError::from)?
            .into_iter()
            .collect();
        Ok(Self {
            session,
            permissions,
        })
    }
}

impl SessionIdentity {
    /// Requires a valid encrypted session cookie.
    pub async fn require(repository: &AuthRepository, jar: &PrivateCookieJar) -> ApiResult<Self> {
        let token = jar
            .get(SESSION_COOKIE)
            .map(|cookie| cookie.value().to_owned())
            .ok_or_else(ApiError::unauthorized)?;
        let digest = Sha256::digest(token.as_bytes());
        repository
            .session_by_token(digest.as_slice(), Utc::now())
            .await
            .map_err(ApiError::from)?
            .map(|(account, csrf_digest)| Self {
                account,
                csrf_digest,
            })
            .ok_or_else(ApiError::unauthorized)
    }

    /// Verifies the header token against the server-side digest in constant time.
    pub fn require_csrf(&self, headers: &HeaderMap) -> ApiResult<()> {
        let submitted = headers
            .get("x-csrf-token")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(ApiError::csrf)?;
        let digest = Sha256::digest(submitted.as_bytes());
        if self.csrf_digest.ct_eq(digest.as_slice()).into() {
            Ok(())
        } else {
            Err(ApiError::csrf())
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/setup",
    tag = "auth",
    responses((status = 200, body = SetupStatusResponse), (status = 503, body = ErrorBody))
)]
pub(crate) async fn setup_status(
    State(state): State<AppState>,
) -> ApiResult<Json<SetupStatusResponse>> {
    let required = state
        .auth_repository
        .needs_setup()
        .await
        .map_err(ApiError::from)?;
    Ok(Json(SetupStatusResponse { required }))
}

#[utoipa::path(
    post,
    path = "/api/v1/setup",
    tag = "auth",
    request_body = SetupRequest,
    responses(
        (status = 201, body = SessionResponse),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn setup(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(request): Json<SetupRequest>,
) -> ApiResult<(StatusCode, PrivateCookieJar, Json<SessionResponse>)> {
    if state
        .cache
        .increment("auth:setup", StdDuration::from_mins(1))
        .await
        .map_err(ApiError::from)?
        > 10
    {
        return Err(ApiError::rate_limited());
    }
    validate_identity_fields(
        &request.organization_name,
        &request.organization_slug,
        &request.display_name,
        &request.email,
    )?;
    let password_hash = state
        .auth
        .hash_password(request.password)
        .await
        .map_err(ApiError::from)?;
    let organization_id = OrganizationId::new();
    let user_id = UserId::new();
    let now = Utc::now();
    state
        .auth_repository
        .create_first_admin(
            organization_id,
            request.organization_name.trim(),
            request.organization_slug.trim(),
            user_id,
            request.email.trim(),
            request.display_name.trim(),
            &password_hash,
            now,
        )
        .await
        .map_err(ApiError::from)?;
    let event = EventEnvelope::new(
        organization_id,
        None,
        Some(user_id),
        Uuid::now_v7(),
        now,
        DomainEvent::UserCreated { user_id },
    );
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    let account = LocalAccount {
        user_id,
        organization_id,
        display_name: request.display_name.trim().into(),
        email: request.email.trim().to_lowercase(),
        password_hash,
        disabled: false,
        email_verified: true,
    };
    let (jar, response) = issue_session(&state, jar, &account).await?;
    Ok((StatusCode::CREATED, jar, Json(response)))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses(
        (status = 200, body = SessionResponse),
        (status = 401, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn login(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(request): Json<LoginRequest>,
) -> ApiResult<(PrivateCookieJar, Json<SessionResponse>)> {
    let identity_hash =
        hex_digest(format!("{}:{}", request.organization, request.email).as_bytes());
    let attempts = state
        .cache
        .increment(
            &format!("auth:login:{identity_hash}"),
            StdDuration::from_mins(5),
        )
        .await
        .map_err(ApiError::from)?;
    if attempts > 10 {
        return Err(ApiError::rate_limited());
    }
    let account = state
        .auth_repository
        .local_account(&request.organization, &request.email)
        .await
        .map_err(ApiError::from)?;
    if !state
        .auth
        .verify_password(account.as_ref(), request.password)
        .await
        .map_err(ApiError::from)?
    {
        publish_auth_event(&state.event_bus, account.as_ref(), &identity_hash, false).await?;
        return Err(ApiError::unauthorized());
    }
    let account = account.expect("successful verification requires an account");
    verify_second_factor(&state, &account, request.mfa_code.as_deref()).await?;
    publish_auth_event(&state.event_bus, Some(&account), &identity_hash, true).await?;
    let (jar, response) = issue_session(&state, jar, &account).await?;
    Ok((jar, Json(response)))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    tag = "auth",
    request_body = RegisterRequest,
    responses(
        (status = 201, body = SessionResponse),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn register(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Json(request): Json<RegisterRequest>,
) -> ApiResult<(StatusCode, PrivateCookieJar, Json<SessionResponse>)> {
    validate_user_fields(&request.display_name, &request.email)?;
    validate_slug(&request.organization)?;
    let identity_hash =
        hex_digest(format!("{}:{}", request.organization, request.email).as_bytes());
    if state
        .cache
        .increment(
            &format!("auth:register:{identity_hash}"),
            StdDuration::from_mins(10),
        )
        .await
        .map_err(ApiError::from)?
        > 5
    {
        return Err(ApiError::rate_limited());
    }
    let password_hash = state
        .auth
        .hash_password(request.password)
        .await
        .map_err(ApiError::from)?;
    let verification_token = random_token(32);
    let now = Utc::now();
    let account = state
        .auth_repository
        .create_local_player(
            request.organization.trim(),
            UserId::new(),
            request.email.trim(),
            request.display_name.trim(),
            &password_hash,
            Sha256::digest(verification_token.as_bytes()).as_slice(),
            now + Duration::hours(24),
            now,
        )
        .await
        .map_err(ApiError::from)?;
    // Delivery is routed through the mailer adapter when enabled. Local
    // accounts remain usable while unverified in zero-config lean mode.
    let event = EventEnvelope::new(
        account.organization_id,
        None,
        Some(account.user_id),
        Uuid::now_v7(),
        now,
        DomainEvent::UserCreated {
            user_id: account.user_id,
        },
    );
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    let (jar, response) = issue_session(&state, jar, &account).await?;
    Ok((StatusCode::CREATED, jar, Json(response)))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/email/verify",
    tag = "auth",
    request_body = TokenRequest,
    responses((status = 204), (status = 404, body = ErrorBody))
)]
pub(crate) async fn verify_email(
    State(state): State<AppState>,
    Json(request): Json<TokenRequest>,
) -> ApiResult<StatusCode> {
    validate_opaque_token(&request.token)?;
    state
        .auth_repository
        .consume_email_verification(
            Sha256::digest(request.token.as_bytes()).as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/recovery",
    tag = "auth",
    request_body = RecoveryStartRequest,
    responses((status = 202), (status = 422, body = ErrorBody), (status = 429, body = ErrorBody))
)]
pub(crate) async fn start_recovery(
    State(state): State<AppState>,
    Json(request): Json<RecoveryStartRequest>,
) -> ApiResult<StatusCode> {
    validate_slug(&request.organization)?;
    validate_user_fields("recovery", &request.email)?;
    let identity_hash =
        hex_digest(format!("{}:{}", request.organization, request.email).as_bytes());
    if state
        .cache
        .increment(
            &format!("auth:recovery:{identity_hash}"),
            StdDuration::from_mins(15),
        )
        .await
        .map_err(ApiError::from)?
        > 5
    {
        return Err(ApiError::rate_limited());
    }
    let token = random_token(32);
    let now = Utc::now();
    let _recipient = state
        .auth_repository
        .begin_account_recovery(
            request.organization.trim(),
            request.email.trim(),
            Sha256::digest(token.as_bytes()).as_slice(),
            now + Duration::minutes(30),
            now,
        )
        .await
        .map_err(ApiError::from)?;
    // Delivery is intentionally delegated to the optional mailer adapter. The
    // response is invariant to prevent identity enumeration.
    Ok(StatusCode::ACCEPTED)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/recovery/complete",
    tag = "auth",
    request_body = RecoveryCompleteRequest,
    responses((status = 204), (status = 404, body = ErrorBody), (status = 422, body = ErrorBody))
)]
pub(crate) async fn complete_recovery(
    State(state): State<AppState>,
    Json(request): Json<RecoveryCompleteRequest>,
) -> ApiResult<StatusCode> {
    validate_opaque_token(&request.token)?;
    let password_hash = state
        .auth
        .hash_password(request.password)
        .await
        .map_err(ApiError::from)?;
    state
        .auth_repository
        .complete_account_recovery(
            Sha256::digest(request.token.as_bytes()).as_slice(),
            &password_hash,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/totp/start",
    tag = "auth",
    responses(
        (status = 200, body = TotpEnrollmentResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn start_totp(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    headers: HeaderMap,
) -> ApiResult<Json<TotpEnrollmentResponse>> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    identity.require_csrf(&headers)?;
    let mut secret = vec![0_u8; 20];
    rand::rng().fill(secret.as_mut_slice());
    state
        .cache
        .put(
            &totp_pending_key(identity.account.session_id),
            secret.clone(),
            StdDuration::from_mins(10),
        )
        .await
        .map_err(ApiError::from)?;
    let encoded_secret = Secret::Raw(secret.clone()).to_encoded();
    let encoded = match &encoded_secret {
        Secret::Encoded(encoded) => encoded.clone(),
        Secret::Raw(_) => unreachable!("encoding returns an encoded secret"),
    };
    let totp = totp(&secret, &identity.account.email)?;
    Ok(Json(TotpEnrollmentResponse {
        secret: encoded,
        provisioning_uri: totp.get_url(),
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/mfa/totp/confirm",
    tag = "auth",
    request_body = TotpConfirmRequest,
    responses(
        (status = 200, body = RecoveryCodesResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn confirm_totp(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    headers: HeaderMap,
    Json(request): Json<TotpConfirmRequest>,
) -> ApiResult<Json<RecoveryCodesResponse>> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    identity.require_csrf(&headers)?;
    let key = totp_pending_key(identity.account.session_id);
    let secret = state
        .cache
        .get(&key)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::from(DomainError::Validation("TOTP setup expired".into())))?;
    if !totp(&secret, &identity.account.email)?
        .check_current(request.code.trim())
        .map_err(|error| ApiError::from(DomainError::Validation(error.to_string())))?
    {
        return Err(ApiError::from(DomainError::Validation(
            "authenticator code is invalid".into(),
        )));
    }
    let codes = generate_recovery_codes();
    let digests = codes
        .iter()
        .map(|code| Sha256::digest(code.as_bytes()).to_vec())
        .collect::<Vec<_>>();
    let sealed = state.auth.seal(&secret).map_err(ApiError::from)?;
    state
        .auth_repository
        .enable_totp(identity.account.user_id, &sealed, &digests, Utc::now())
        .await
        .map_err(ApiError::from)?;
    state.cache.remove(&key).await.map_err(ApiError::from)?;
    Ok(Json(RecoveryCodesResponse { codes }))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/sessions",
    tag = "auth",
    responses((status = 200, body = [SessionSummaryResponse]), (status = 401, body = ErrorBody))
)]
pub(crate) async fn list_sessions(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
) -> ApiResult<Json<Vec<SessionSummaryResponse>>> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    let rows = state
        .auth_repository
        .active_sessions(identity.account.user_id, Utc::now())
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        rows.into_iter()
            .map(|row| SessionSummaryResponse {
                id: row.id,
                current: row.id == identity.account.session_id,
                created_at: row.created_at,
                last_seen_at: row.last_seen_at,
                expires_at: row.expires_at,
            })
            .collect(),
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/auth/sessions/{session_id}",
    tag = "auth",
    params(("session_id" = Uuid, Path, description = "Session ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn revoke_session(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    headers: HeaderMap,
    Path(session_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    identity.require_csrf(&headers)?;
    if !state
        .auth_repository
        .revoke_owned_session(identity.account.user_id, session_id, Utc::now())
        .await
        .map_err(ApiError::from)?
    {
        return Err(ApiError::from(DomainError::NotFound));
    }
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/session",
    tag = "auth",
    responses((status = 200, body = SessionResponse), (status = 401, body = ErrorBody))
)]
pub(crate) async fn current_session(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
) -> ApiResult<Json<SessionResponse>> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    let csrf_token = jar
        .get(CSRF_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(ApiError::csrf)?;
    let permissions = state
        .auth_repository
        .permission_keys(
            identity.account.user_id,
            identity.account.organization_id,
            None,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(session_response(
        &identity.account,
        csrf_token,
        permissions,
    )))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "auth",
    responses((status = 204), (status = 401, body = ErrorBody), (status = 403, body = ErrorBody))
)]
pub(crate) async fn logout(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    headers: HeaderMap,
) -> ApiResult<(PrivateCookieJar, StatusCode)> {
    let identity = SessionIdentity::require(&state.auth_repository, &jar).await?;
    identity.require_csrf(&headers)?;
    let token = jar
        .get(SESSION_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(ApiError::unauthorized)?;
    state
        .auth_repository
        .revoke_session(Sha256::digest(token.as_bytes()).as_slice(), Utc::now())
        .await
        .map_err(ApiError::from)?;
    let jar = jar
        .remove(removal_cookie(SESSION_COOKIE, state.secure_cookies))
        .remove(removal_cookie(CSRF_COOKIE, state.secure_cookies));
    Ok((jar, StatusCode::NO_CONTENT))
}

async fn issue_session(
    state: &AppState,
    jar: PrivateCookieJar,
    account: &LocalAccount,
) -> ApiResult<(PrivateCookieJar, SessionResponse)> {
    let session_token = random_token(32);
    let csrf_token = random_token(32);
    let now = Utc::now();
    let expires_at = now + Duration::hours(SESSION_HOURS);
    state
        .auth_repository
        .create_session(
            Uuid::now_v7(),
            account.user_id,
            Sha256::digest(session_token.as_bytes()).as_slice(),
            Sha256::digest(csrf_token.as_bytes()).as_slice(),
            None,
            expires_at,
            now,
        )
        .await
        .map_err(ApiError::from)?;
    let jar = jar
        .add(session_cookie(
            SESSION_COOKIE,
            session_token,
            true,
            state.secure_cookies,
        ))
        .add(session_cookie(
            CSRF_COOKIE,
            csrf_token.clone(),
            true,
            state.secure_cookies,
        ));
    let permissions = state
        .auth_repository
        .permission_keys(account.user_id, account.organization_id, None)
        .await
        .map_err(ApiError::from)?;
    let session = SessionAccount {
        session_id: Uuid::nil(),
        user_id: account.user_id,
        organization_id: account.organization_id,
        display_name: account.display_name.clone(),
        email: account.email.clone(),
        email_verified: account.email_verified,
        expires_at,
    };
    Ok((jar, session_response(&session, csrf_token, permissions)))
}

fn session_response(
    account: &SessionAccount,
    csrf_token: String,
    permissions: Vec<String>,
) -> SessionResponse {
    SessionResponse {
        user: UserResponse {
            id: account.user_id.0,
            organization_id: account.organization_id.0,
            display_name: account.display_name.clone(),
            email: account.email.clone(),
            email_verified: account.email_verified,
        },
        csrf_token,
        permissions,
        expires_at: account.expires_at,
    }
}

async fn verify_second_factor(
    state: &AppState,
    account: &LocalAccount,
    submitted: Option<&str>,
) -> ApiResult<()> {
    let Some(credential) = state
        .auth_repository
        .totp_credential(account.user_id)
        .await
        .map_err(ApiError::from)?
    else {
        return Ok(());
    };
    let code = submitted
        .map(str::trim)
        .filter(|code| !code.is_empty())
        .ok_or_else(ApiError::mfa_required)?;
    let secret = state
        .auth
        .open(&credential.encrypted_secret)
        .map_err(ApiError::from)?;
    let generator = totp(&secret, &account.email)?;
    let current_counter = Utc::now().timestamp().unsigned_abs() / 30;
    let accepted_counter = [
        current_counter.saturating_sub(1),
        current_counter,
        current_counter.saturating_add(1),
    ]
    .into_iter()
    .find(|counter| generator.check(code, counter.saturating_mul(30)));
    if let Some(counter) = accepted_counter
        && i64::try_from(counter).ok().is_some_and(|counter| {
            credential
                .last_counter
                .is_none_or(|previous| counter > previous)
        })
    {
        let counter = i64::try_from(counter).map_err(|_| ApiError::mfa_required())?;
        if state
            .auth_repository
            .accept_totp_counter(account.user_id, counter)
            .await
            .map_err(ApiError::from)?
        {
            return Ok(());
        }
    }
    let recovery = code.trim().to_ascii_uppercase();
    if state
        .auth_repository
        .consume_recovery_code(
            account.user_id,
            Sha256::digest(recovery.as_bytes()).as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?
    {
        return Ok(());
    }
    Err(ApiError::mfa_required())
}

fn totp(secret: &[u8], account_name: &str) -> ApiResult<TOTP> {
    TOTP::new(
        TotpAlgorithm::SHA1,
        6,
        1,
        30,
        secret.to_vec(),
        Some("Kitsune".into()),
        account_name.to_owned(),
    )
    .map_err(|error| ApiError::from(DomainError::Validation(error.to_string())))
}

fn totp_pending_key(session_id: Uuid) -> String {
    format!("auth:totp:pending:{session_id}")
}

fn generate_recovery_codes() -> Vec<String> {
    (0..10)
        .map(|_| {
            let raw = random_token(9).to_ascii_uppercase();
            format!("{}-{}", &raw[..6], &raw[6..12])
        })
        .collect()
}

fn session_cookie(
    name: &'static str,
    value: String,
    http_only: bool,
    secure: bool,
) -> Cookie<'static> {
    Cookie::build((name, value))
        .path("/")
        .http_only(http_only)
        .secure(secure)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::hours(SESSION_HOURS))
        .build()
}

fn removal_cookie(name: &'static str, secure: bool) -> Cookie<'static> {
    Cookie::build(name)
        .path("/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Strict)
        .max_age(time::Duration::ZERO)
        .build()
}

fn hash_with(argon2: &Argon2<'_>, password: &str) -> Result<String, DomainError> {
    let mut salt_bytes = [0_u8; 16];
    rand::rng().fill(&mut salt_bytes);
    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|error| DomainError::Validation(error.to_string()))?;
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| DomainError::Validation(error.to_string()))
}

fn random_token(length: usize) -> String {
    let mut bytes = vec![0_u8; length];
    rand::rng().fill(bytes.as_mut_slice());
    URL_SAFE_NO_PAD.encode(bytes)
}

fn validate_password(password: &str) -> Result<(), DomainError> {
    if password.chars().count() < 12 || password.chars().count() > 128 {
        return Err(DomainError::Validation(
            "password must contain 12 to 128 characters".into(),
        ));
    }
    Ok(())
}

fn validate_identity_fields(
    organization_name: &str,
    organization_slug: &str,
    display_name: &str,
    email: &str,
) -> ApiResult<()> {
    if organization_name.trim().is_empty() || organization_name.chars().count() > 120 {
        return Err(ApiError::from(DomainError::Validation(
            "organization name is invalid".into(),
        )));
    }
    validate_slug(organization_slug)?;
    validate_user_fields(display_name, email)?;
    Ok(())
}

fn validate_user_fields(display_name: &str, email: &str) -> ApiResult<()> {
    if display_name.trim().is_empty()
        || display_name.chars().count() > 80
        || email.len() > 254
        || !email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
    {
        return Err(ApiError::from(DomainError::Validation(
            "display name or email is invalid".into(),
        )));
    }
    Ok(())
}

pub(crate) fn validate_slug(slug: &str) -> ApiResult<()> {
    if slug.is_empty()
        || slug.len() > 63
        || !slug
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || slug.starts_with('-')
        || slug.ends_with('-')
    {
        return Err(ApiError::from(DomainError::Validation(
            "organization slug is invalid".into(),
        )));
    }
    Ok(())
}

fn validate_opaque_token(token: &str) -> ApiResult<()> {
    if token.len() < 32
        || token.len() > 128
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ApiError::from(DomainError::Validation(
            "token is malformed".into(),
        )));
    }
    Ok(())
}

fn hex_digest(value: &[u8]) -> String {
    hex::encode(Sha256::digest(value))
}

async fn publish_auth_event(
    bus: &Arc<dyn EventBus>,
    account: Option<&LocalAccount>,
    identity_hash: &str,
    success: bool,
) -> ApiResult<()> {
    let event = if success {
        DomainEvent::AuthenticationSucceeded {
            user_id: account.expect("successful auth has account").user_id,
            method: "local".into(),
        }
    } else {
        DomainEvent::AuthenticationFailed {
            identity_hint: identity_hash.into(),
            method: "local".into(),
        }
    };
    let envelope = if let Some(account) = account {
        EventEnvelope::new(
            account.organization_id,
            None,
            Some(account.user_id),
            Uuid::now_v7(),
            Utc::now(),
            event,
        )
    } else {
        EventEnvelope::new_platform(Uuid::now_v7(), Utc::now(), event)
    };
    bus.publish(envelope).await.map_err(ApiError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn password_hashes_are_argon2id_and_verify() {
        let service = AuthService::new().expect("service");
        let password = "correct horse foxfire battery".to_owned();
        let hash = service.hash_password(password.clone()).await.expect("hash");
        assert!(hash.starts_with("$argon2id$"));
        let account = LocalAccount {
            user_id: UserId::new(),
            organization_id: OrganizationId::new(),
            display_name: "Kon".into(),
            email: "kon@example.test".into(),
            password_hash: hash,
            disabled: false,
            email_verified: true,
        };
        assert!(
            service
                .verify_password(Some(&account), password)
                .await
                .expect("verify")
        );
        assert!(
            !service
                .verify_password(Some(&account), "wrong password".into())
                .await
                .expect("verify")
        );
    }

    #[test]
    fn setup_fields_reject_ambiguous_slugs_and_emails() {
        assert!(validate_identity_fields("Org", "valid-org", "Admin", "a@b.test").is_ok());
        assert!(validate_identity_fields("Org", "Bad_Slug", "Admin", "not-mail").is_err());
    }

    #[test]
    fn sealed_secrets_round_trip_and_reject_tampering() {
        let service = AuthService::from_master_key(&[7_u8; 64]).expect("service");
        let sealed = service.seal(b"foxfire-secret").expect("seal");
        assert_eq!(service.open(&sealed).expect("open"), b"foxfire-secret");

        let mut tampered = sealed;
        let last = tampered.len() - 1;
        tampered[last] ^= 1;
        assert!(service.open(&tampered).is_err());
    }

    #[test]
    fn recovery_codes_are_unique_and_well_formed() {
        let codes = generate_recovery_codes();
        let unique = codes.iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(codes.len(), 10);
        assert_eq!(unique.len(), codes.len());
        assert!(
            codes
                .iter()
                .all(|code| code.len() == 13 && code.as_bytes()[6] == b'-')
        );
    }
}
