//! Tenant-scoped OIDC provider management and browser authorization routes.

use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Redirect,
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use chrono::{Duration, Utc};
use kitsune_core::DomainError;
use kitsune_db::oidc::{
    NewOidcFlow, NewOidcProvider, OidcProviderRecord, OidcRepository, UpdateOidcProvider,
    VerifiedOidcIdentity,
};
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    Actor, ApiError, ApiResult, AppState, ErrorBody,
    auth::{SessionPrincipal, issue_session, random_token, validate_slug},
};

const OIDC_FLOW_COOKIE: &str = "kit_oidc_flow";
const OIDC_FLOW_MINUTES: i64 = 10;

/// Provider creation input. Callback URLs are derived from the server's
/// canonical public origin rather than accepted from browser input.
#[derive(Deserialize, ToSchema)]
pub struct CreateOidcProviderRequest {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// Exact OpenID issuer identifier.
    pub issuer_url: String,
    /// OAuth client identifier.
    pub client_id: String,
    /// OAuth client secret, encrypted before persistence.
    #[schema(value_type = String, format = Password)]
    pub client_secret: String,
    /// Expose the provider on the login page.
    pub enabled: bool,
    /// Create a canonical player on first login.
    pub auto_provision: bool,
    /// Link to an existing verified local account by matching email.
    pub allow_email_link: bool,
}

/// Complete provider replacement input.
#[derive(Deserialize, ToSchema)]
pub struct UpdateOidcProviderRequest {
    /// Human-readable login button label.
    pub display_name: String,
    /// Exact OpenID issuer identifier.
    pub issuer_url: String,
    /// OAuth client identifier.
    pub client_id: String,
    /// Replacement secret. Omit to retain the current encrypted value.
    #[schema(value_type = Option<String>, format = Password)]
    pub client_secret: Option<String>,
    /// Expose the provider on the login page.
    pub enabled: bool,
    /// Create a canonical player on first login.
    pub auto_provision: bool,
    /// Link to an existing verified local account by matching email.
    pub allow_email_link: bool,
}

/// Safe organizer provider projection.
#[derive(Serialize, ToSchema)]
pub struct OidcProviderResponse {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// Exact OpenID issuer identifier.
    pub issuer_url: String,
    /// OAuth client identifier.
    pub client_id: String,
    /// Server-derived authorization-code callback.
    pub redirect_uri: String,
    /// Provider availability.
    pub enabled: bool,
    /// First-login provisioning policy.
    pub auto_provision: bool,
    /// Explicit verified-email linking policy.
    pub allow_email_link: bool,
    /// Creation time.
    pub created_at: chrono::DateTime<Utc>,
    /// Last update time.
    pub updated_at: chrono::DateTime<Utc>,
}

/// Public login-page provider projection.
#[derive(Serialize, ToSchema)]
pub struct PublicOidcProviderResponse {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// Same-origin route that begins the authorization flow.
    pub start_path: String,
}

#[derive(Deserialize, IntoParams)]
pub struct PublicProvidersQuery {
    /// Organization slug entered on the login page.
    pub organization: String,
}

#[derive(Deserialize, IntoParams)]
pub struct OidcStartQuery {
    /// Application-local page to open after authentication.
    pub return_to: Option<String>,
}

#[derive(Deserialize, IntoParams)]
pub struct OidcCallbackQuery {
    /// One-time authorization code.
    pub code: Option<String>,
    /// One-time callback state.
    pub state: Option<String>,
    /// Provider cancellation or protocol error key.
    pub error: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/oidc/providers",
    tag = "auth",
    responses(
        (status = 200, body = [OidcProviderResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_oidc_providers(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<OidcProviderResponse>>> {
    require_provider_management(&state, &actor, None)?;
    let records = OidcRepository::new(state.db.pool().clone())
        .list_providers(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(records.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/oidc/providers",
    tag = "auth",
    request_body = CreateOidcProviderRequest,
    responses(
        (status = 201, body = OidcProviderResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_oidc_provider(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateOidcProviderRequest>,
) -> ApiResult<(StatusCode, Json<OidcProviderResponse>)> {
    require_provider_management(&state, &actor, Some(&headers))?;
    validate_provider_input(
        &request.key,
        &request.display_name,
        &request.issuer_url,
        &request.client_id,
        Some(&request.client_secret),
    )?;
    let repository = OidcRepository::new(state.db.pool().clone());
    let organization_id = actor.session.account.organization_id;
    let organization_slug = repository
        .organization_slug(organization_id)
        .await
        .map_err(ApiError::from)?;
    let redirect_uri = callback_uri(&state.public_origin, &organization_slug, request.key.trim());
    let encrypted_secret = state
        .auth
        .seal(request.client_secret.as_bytes())
        .map_err(ApiError::from)?;
    let mutation = repository
        .create_provider(NewOidcProvider {
            id: Uuid::now_v7(),
            organization_id,
            actor_id: actor.session.account.user_id,
            key: request.key.trim(),
            display_name: request.display_name.trim(),
            issuer_url: request.issuer_url.trim(),
            client_id: request.client_id.trim(),
            encrypted_client_secret: &encrypted_secret,
            redirect_uri: redirect_uri.as_str(),
            enabled: request.enabled,
            auto_provision: request.auto_provision,
            allow_email_link: request.allow_email_link,
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
    Ok((StatusCode::CREATED, Json(mutation.record.into())))
}

#[utoipa::path(
    put,
    path = "/api/v1/auth/oidc/providers/{provider_id}",
    tag = "auth",
    params(("provider_id" = Uuid, Path, description = "OIDC provider ID")),
    request_body = UpdateOidcProviderRequest,
    responses(
        (status = 200, body = OidcProviderResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_oidc_provider(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(provider_id): Path<Uuid>,
    Json(request): Json<UpdateOidcProviderRequest>,
) -> ApiResult<Json<OidcProviderResponse>> {
    require_provider_management(&state, &actor, Some(&headers))?;
    validate_provider_input(
        "provider-key",
        &request.display_name,
        &request.issuer_url,
        &request.client_id,
        request.client_secret.as_deref(),
    )?;
    let encrypted_secret = request
        .client_secret
        .as_deref()
        .map(|secret| state.auth.seal(secret.as_bytes()))
        .transpose()
        .map_err(ApiError::from)?;
    let redirect_uri = existing_redirect_uri(&state, &actor, provider_id).await?;
    let mutation = OidcRepository::new(state.db.pool().clone())
        .update_provider(UpdateOidcProvider {
            id: provider_id,
            organization_id: actor.session.account.organization_id,
            actor_id: actor.session.account.user_id,
            display_name: request.display_name.trim(),
            issuer_url: request.issuer_url.trim(),
            client_id: request.client_id.trim(),
            encrypted_client_secret: encrypted_secret.as_deref(),
            redirect_uri: &redirect_uri,
            enabled: request.enabled,
            auto_provision: request.auto_provision,
            allow_email_link: request.allow_email_link,
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
    Ok(Json(mutation.record.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/oidc/providers/public",
    tag = "auth",
    params(PublicProvidersQuery),
    responses((status = 200, body = [PublicOidcProviderResponse]))
)]
pub(crate) async fn public_oidc_providers(
    State(state): State<AppState>,
    Query(query): Query<PublicProvidersQuery>,
) -> ApiResult<Json<Vec<PublicOidcProviderResponse>>> {
    validate_slug(&query.organization)?;
    if !state.external_auth_enabled {
        return Ok(Json(Vec::new()));
    }
    let records = OidcRepository::new(state.db.pool().clone())
        .public_providers(query.organization.trim())
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        records
            .into_iter()
            .map(|record| PublicOidcProviderResponse {
                start_path: format!(
                    "/api/v1/auth/oidc/{}/{}/start",
                    query.organization.trim(),
                    record.key,
                ),
                key: record.key,
                display_name: record.display_name,
            })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/oidc/{organization}/{provider_key}/start",
    tag = "auth",
    params(
        ("organization" = String, Path, description = "Organization slug"),
        ("provider_key" = String, Path, description = "OIDC provider key"),
        OidcStartQuery
    ),
    responses(
        (status = 303, description = "Redirect to the provider"),
        (status = 404, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn start_oidc(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path((organization, provider_key)): Path<(String, String)>,
    Query(query): Query<OidcStartQuery>,
) -> ApiResult<(PrivateCookieJar, Redirect)> {
    require_external_auth(&state)?;
    validate_slug(&organization)?;
    validate_slug(&provider_key)?;
    let return_path = normalize_return_path(query.return_to.as_deref())?;
    let rate_key = format!("auth:oidc:start:{organization}:{provider_key}");
    if state
        .cache
        .increment(&rate_key, std::time::Duration::from_mins(1))
        .await
        .map_err(ApiError::from)?
        > 120
    {
        return Err(ApiError::rate_limited());
    }
    let repository = OidcRepository::new(state.db.pool().clone());
    let provider = repository
        .active_provider(&organization, &provider_key)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::from(DomainError::NotFound))?;
    let client_secret = open_secret(&state, &provider.encrypted_client_secret)?;
    let authorization = state
        .oidc
        .authorization_url(&provider, &client_secret)
        .await
        .map_err(ApiError::from)?;
    let browser_binding = random_token(32);
    let encrypted_pkce = state
        .auth
        .seal(authorization.pkce_verifier.as_bytes())
        .map_err(ApiError::from)?;
    let encrypted_nonce = state
        .auth
        .seal(authorization.nonce.as_bytes())
        .map_err(ApiError::from)?;
    let now = Utc::now();
    repository
        .begin_flow(NewOidcFlow {
            id: Uuid::now_v7(),
            provider_id: provider.id,
            organization_id: provider.organization_id,
            state_digest: Sha256::digest(authorization.state.as_bytes()).as_slice(),
            browser_binding_digest: Sha256::digest(browser_binding.as_bytes()).as_slice(),
            encrypted_pkce_verifier: &encrypted_pkce,
            encrypted_nonce: &encrypted_nonce,
            return_path: &return_path,
            expires_at: now + Duration::minutes(OIDC_FLOW_MINUTES),
            now,
        })
        .await
        .map_err(ApiError::from)?;
    let jar = jar.add(flow_cookie(browser_binding, state.secure_cookies));
    Ok((jar, Redirect::to(authorization.url.as_str())))
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/oidc/{organization}/{provider_key}/callback",
    tag = "auth",
    params(
        ("organization" = String, Path, description = "Organization slug"),
        ("provider_key" = String, Path, description = "OIDC provider key"),
        OidcCallbackQuery
    ),
    responses((status = 303, description = "Return to the Kitsune application"))
)]
pub(crate) async fn oidc_callback(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path((organization, provider_key)): Path<(String, String)>,
    Query(query): Query<OidcCallbackQuery>,
) -> (PrivateCookieJar, Redirect) {
    match complete_callback(&state, jar.clone(), &organization, &provider_key, query).await {
        Ok(result) => result,
        Err(_) => (
            jar.remove(flow_removal_cookie(state.secure_cookies)),
            Redirect::to("/login?oidc_error=authentication_failed"),
        ),
    }
}

async fn complete_callback(
    state: &AppState,
    jar: PrivateCookieJar,
    organization: &str,
    provider_key: &str,
    query: OidcCallbackQuery,
) -> ApiResult<(PrivateCookieJar, Redirect)> {
    require_external_auth(state)?;
    validate_slug(organization)?;
    validate_slug(provider_key)?;
    if query.error.is_some() {
        return Err(ApiError::unauthorized());
    }
    let state_value = query
        .state
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(ApiError::unauthorized)?;
    let code = query
        .code
        .filter(|value| !value.is_empty() && value.len() <= 4096)
        .ok_or_else(ApiError::unauthorized)?;
    let browser_binding = jar
        .get(OIDC_FLOW_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(ApiError::unauthorized)?;
    let repository = OidcRepository::new(state.db.pool().clone());
    let flow = repository
        .resolve_flow(
            Sha256::digest(state_value.as_bytes()).as_slice(),
            Sha256::digest(browser_binding.as_bytes()).as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?
        .ok_or_else(ApiError::unauthorized)?;
    if flow.provider.organization_slug != organization || flow.provider.key != provider_key {
        return Err(ApiError::unauthorized());
    }
    let client_secret = open_secret(state, &flow.provider.encrypted_client_secret)?;
    let pkce_verifier = open_utf8(state, &flow.encrypted_pkce_verifier)?;
    let nonce = open_utf8(state, &flow.encrypted_nonce)?;
    let claims = state
        .oidc
        .exchange_code(&flow.provider, &client_secret, code, pkce_verifier, nonce)
        .await
        .map_err(ApiError::from)?;
    let mutation = repository
        .complete_login(
            &flow,
            VerifiedOidcIdentity {
                subject: &claims.subject,
                email: &claims.email,
                display_name: &claims.display_name,
            },
            Uuid::now_v7(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    for event in mutation.events {
        state
            .event_bus
            .publish(event)
            .await
            .map_err(ApiError::from)?;
    }
    let principal = SessionPrincipal {
        user_id: mutation.account.user_id,
        organization_id: mutation.account.organization_id,
        display_name: mutation.account.display_name,
        email: mutation.account.email,
        email_verified: mutation.account.email_verified,
    };
    let jar = jar.remove(flow_removal_cookie(state.secure_cookies));
    let (jar, _) = issue_session(state, jar, &principal).await?;
    Ok((jar, Redirect::to(&flow.return_path)))
}

fn require_provider_management(
    state: &AppState,
    actor: &Actor,
    headers: Option<&HeaderMap>,
) -> ApiResult<()> {
    require_external_auth(state)?;
    actor.require("identity_manage")?;
    actor.require_interactive_session()?;
    if let Some(headers) = headers {
        actor.require_csrf(headers)?;
    }
    Ok(())
}

fn require_external_auth(state: &AppState) -> ApiResult<()> {
    if state.external_auth_enabled {
        Ok(())
    } else {
        Err(ApiError::from(DomainError::NotFound))
    }
}

fn validate_provider_input(
    key: &str,
    display_name: &str,
    issuer_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
) -> ApiResult<()> {
    validate_slug(key.trim())?;
    if display_name.trim().is_empty() || display_name.chars().count() > 80 {
        return Err(ApiError::from(DomainError::Validation(
            "OIDC provider display name is invalid".into(),
        )));
    }
    if client_id.trim().is_empty() || client_id.len() > 512 {
        return Err(ApiError::from(DomainError::Validation(
            "OIDC client ID is invalid".into(),
        )));
    }
    if client_secret.is_some_and(|secret| secret.len() < 16 || secret.len() > 2048) {
        return Err(ApiError::from(DomainError::Validation(
            "OIDC client secret must contain 16 to 2048 bytes".into(),
        )));
    }
    let issuer = url::Url::parse(issuer_url.trim()).map_err(|_| {
        ApiError::from(DomainError::Validation("OIDC issuer URL is invalid".into()))
    })?;
    if !matches!(issuer.scheme(), "http" | "https")
        || issuer.host().is_none()
        || !issuer.username().is_empty()
        || issuer.password().is_some()
        || issuer.query().is_some()
        || issuer.fragment().is_some()
    {
        return Err(ApiError::from(DomainError::Validation(
            "OIDC issuer URL is invalid".into(),
        )));
    }
    Ok(())
}

fn callback_uri(public_origin: &url::Url, organization: &str, provider_key: &str) -> url::Url {
    let mut callback = public_origin.clone();
    callback.set_path(&format!(
        "/api/v1/auth/oidc/{organization}/{provider_key}/callback"
    ));
    callback.set_query(None);
    callback.set_fragment(None);
    callback
}

async fn existing_redirect_uri(
    state: &AppState,
    actor: &Actor,
    provider_id: Uuid,
) -> ApiResult<String> {
    let providers = OidcRepository::new(state.db.pool().clone())
        .list_providers(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    providers
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .map(|provider| provider.redirect_uri)
        .ok_or_else(|| ApiError::from(DomainError::NotFound))
}

fn normalize_return_path(return_to: Option<&str>) -> ApiResult<String> {
    let return_to = return_to.unwrap_or("/");
    if !return_to.starts_with('/') || return_to.starts_with("//") || return_to.len() > 2048 {
        return Err(ApiError::from(DomainError::Validation(
            "OIDC return path must stay inside Kitsune".into(),
        )));
    }
    Ok(return_to.to_owned())
}

fn open_secret(state: &AppState, encrypted: &[u8]) -> ApiResult<SecretString> {
    open_utf8(state, encrypted).map(SecretString::from)
}

fn open_utf8(state: &AppState, encrypted: &[u8]) -> ApiResult<String> {
    String::from_utf8(state.auth.open(encrypted).map_err(ApiError::from)?).map_err(|_| {
        ApiError::from(DomainError::Validation(
            "sealed OIDC value is invalid".into(),
        ))
    })
}

fn flow_cookie(binding: String, secure: bool) -> Cookie<'static> {
    Cookie::build((OIDC_FLOW_COOKIE, binding))
        .path("/api/v1/auth/oidc/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::minutes(OIDC_FLOW_MINUTES))
        .build()
}

fn flow_removal_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build(OIDC_FLOW_COOKIE)
        .path("/api/v1/auth/oidc/")
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .max_age(time::Duration::ZERO)
        .build()
}

impl From<OidcProviderRecord> for OidcProviderResponse {
    fn from(record: OidcProviderRecord) -> Self {
        Self {
            id: record.id,
            key: record.key,
            display_name: record.display_name,
            issuer_url: record.issuer_url,
            client_id: record.client_id,
            redirect_uri: record.redirect_uri,
            enabled: record.enabled,
            auto_provision: record.auto_provision,
            allow_email_link: record.allow_email_link,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}
