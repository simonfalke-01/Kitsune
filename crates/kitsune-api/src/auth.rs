//! Local account bootstrap and opaque encrypted-cookie sessions.

use std::{sync::Arc, time::Duration as StdDuration};

use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
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
}

impl AuthService {
    /// Constructs Argon2id with OWASP-aligned memory/time/parallelism defaults.
    pub fn new() -> Result<Self, DomainError> {
        let params = Params::new(19 * 1_024, 2, 1, Some(32))
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let dummy_hash = hash_with(&argon2, "kitsune-dummy-password-never-accepted")?;
        Ok(Self {
            argon2,
            dummy_hash: Arc::new(dummy_hash),
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
        .increment("auth:setup", StdDuration::from_secs(60))
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
            StdDuration::from_secs(300),
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
    publish_auth_event(&state.event_bus, Some(&account), &identity_hash, true).await?;
    let (jar, response) = issue_session(&state, jar, &account).await?;
    Ok((jar, Json(response)))
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
        true,
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
        expires_at,
    };
    Ok((
        jar,
        session_response(&session, csrf_token, permissions, account.email_verified),
    ))
}

fn session_response(
    account: &SessionAccount,
    csrf_token: String,
    permissions: Vec<String>,
    email_verified: bool,
) -> SessionResponse {
    SessionResponse {
        user: UserResponse {
            id: account.user_id.0,
            organization_id: account.organization_id.0,
            display_name: account.display_name.clone(),
            email: account.email.clone(),
            email_verified,
        },
        csrf_token,
        permissions,
        expires_at: account.expires_at,
    }
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
    if organization_name.trim().is_empty()
        || organization_name.chars().count() > 120
        || display_name.trim().is_empty()
        || display_name.chars().count() > 80
        || email.len() > 254
        || !email
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.'))
        || organization_slug.is_empty()
        || organization_slug.len() > 63
        || !organization_slug
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        || organization_slug.starts_with('-')
        || organization_slug.ends_with('-')
    {
        return Err(ApiError::from(DomainError::Validation(
            "organization, name, slug, or email is invalid".into(),
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
}
