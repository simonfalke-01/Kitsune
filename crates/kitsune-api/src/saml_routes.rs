//! Tenant-scoped SAML provider management and SP-initiated browser routes.

use std::fmt::Write as _;

use axum::{
    Form, Json,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Redirect, Response},
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use chrono::{Duration, Utc};
use kitsune_core::DomainError;
use kitsune_db::saml::{
    NewSamlFlow, NewSamlProvider, SamlProviderRecord, SamlRepository, UpdateSamlProvider,
    VerifiedSamlIdentity,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::{
    Actor, ApiError, ApiResult, AppState, ErrorBody,
    auth::{SessionPrincipal, issue_session, random_token, validate_slug},
    saml::{SamlAuthorization, SamlService, ValidatedSamlMetadata},
};

const SAML_FLOW_COOKIE: &str = "kit_saml_flow";
const SAML_FLOW_MINUTES: i64 = 10;
const MAX_ASSERTION_BYTES: usize = 2 * 1024 * 1024;

/// Provider creation input. Service-provider URLs are always derived from the
/// canonical browser origin rather than accepted from the browser.
#[derive(Deserialize, ToSchema)]
pub struct CreateSamlProviderRequest {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// Pasted IdP metadata XML. Exactly one metadata source is required.
    pub metadata_xml: Option<String>,
    /// HTTPS metadata URL fetched through Kitsune's SSRF policy.
    pub metadata_url: Option<String>,
    /// Optional pinned PEM certificate that must sign the metadata document.
    pub metadata_signing_certificate: Option<String>,
    /// Exact signed assertion attribute containing email.
    pub email_attribute: Option<String>,
    /// Exact signed assertion attribute containing display name.
    pub display_name_attribute: Option<String>,
    /// Expose the provider on the login page.
    pub enabled: bool,
    /// Create a player after the first valid assertion.
    pub auto_provision: bool,
    /// Link to an existing verified account by assertion email.
    pub allow_email_link: bool,
}

/// Complete provider replacement input.
#[derive(Deserialize, ToSchema)]
pub struct UpdateSamlProviderRequest {
    /// Human-readable login button label.
    pub display_name: String,
    /// Pasted IdP metadata XML. Exactly one metadata source is required.
    pub metadata_xml: Option<String>,
    /// HTTPS metadata URL fetched through Kitsune's SSRF policy.
    pub metadata_url: Option<String>,
    /// Optional pinned PEM certificate that must sign the metadata document.
    pub metadata_signing_certificate: Option<String>,
    /// Exact signed assertion attribute containing email.
    pub email_attribute: Option<String>,
    /// Exact signed assertion attribute containing display name.
    pub display_name_attribute: Option<String>,
    /// Expose the provider on the login page.
    pub enabled: bool,
    /// Create a player after the first valid assertion.
    pub auto_provision: bool,
    /// Link to an existing verified account by assertion email.
    pub allow_email_link: bool,
}

/// Safe organizer provider projection.
#[derive(Serialize, ToSchema)]
pub struct SamlProviderResponse {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// IdP entity ID parsed from metadata.
    pub idp_entity_id: String,
    /// Optional source URL used to ingest metadata.
    pub metadata_url: Option<String>,
    /// Whether a pinned certificate verified the metadata signature.
    pub metadata_verified: bool,
    /// Canonical Kitsune SP entity ID and metadata URL.
    pub sp_entity_id: String,
    /// Canonical HTTP-POST assertion consumer service URL.
    pub acs_uri: String,
    /// Optional exact email attribute mapping.
    pub email_attribute: Option<String>,
    /// Optional exact display-name attribute mapping.
    pub display_name_attribute: Option<String>,
    /// Provider availability.
    pub enabled: bool,
    /// First-login provisioning policy.
    pub auto_provision: bool,
    /// Explicit assertion-email linking policy.
    pub allow_email_link: bool,
    /// Creation time.
    pub created_at: chrono::DateTime<Utc>,
    /// Last update time.
    pub updated_at: chrono::DateTime<Utc>,
}

/// Public login-page provider projection.
#[derive(Serialize, ToSchema)]
pub struct PublicSamlProviderResponse {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login button label.
    pub display_name: String,
    /// Same-origin route beginning SP-initiated SSO.
    pub start_path: String,
}

#[derive(Deserialize, IntoParams)]
pub struct PublicProvidersQuery {
    /// Organization slug entered on the login page.
    pub organization: String,
}

#[derive(Deserialize, IntoParams)]
pub struct SamlStartQuery {
    /// Application-local page to open after authentication.
    pub return_to: Option<String>,
}

#[derive(Deserialize, ToSchema)]
pub struct SamlAcsForm {
    /// Base64-encoded SAML response.
    #[serde(rename = "SAMLResponse")]
    saml_response: String,
    /// Exact one-time correlation state.
    #[serde(rename = "RelayState")]
    relay_state: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/saml/providers",
    tag = "auth",
    responses(
        (status = 200, body = [SamlProviderResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_saml_providers(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<SamlProviderResponse>>> {
    require_provider_management(&state, &actor, None)?;
    let records = SamlRepository::new(state.db.pool().clone())
        .list_providers(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(records.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/saml/providers",
    tag = "auth",
    request_body = CreateSamlProviderRequest,
    responses(
        (status = 201, body = SamlProviderResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_saml_provider(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateSamlProviderRequest>,
) -> ApiResult<(StatusCode, Json<SamlProviderResponse>)> {
    require_provider_management(&state, &actor, Some(&headers))?;
    validate_provider_fields(
        Some(&request.key),
        &request.display_name,
        request.email_attribute.as_deref(),
        request.display_name_attribute.as_deref(),
    )?;
    let metadata = ingest_metadata(
        saml_service(&state)?,
        request.metadata_xml,
        request.metadata_url.as_deref(),
        request.metadata_signing_certificate.as_deref(),
    )
    .await?;
    let repository = SamlRepository::new(state.db.pool().clone());
    let organization_id = actor.session.account.organization_id;
    let organization = repository
        .organization_slug(organization_id)
        .await
        .map_err(ApiError::from)?;
    let key = request.key.trim();
    let (sp_entity_id, acs_uri) = canonical_endpoints(&state, &organization, key);
    let now = Utc::now();
    let mutation = repository
        .create_provider(NewSamlProvider {
            id: Uuid::now_v7(),
            organization_id,
            actor_id: actor.session.account.user_id,
            key,
            display_name: request.display_name.trim(),
            idp_entity_id: &metadata.idp_entity_id,
            idp_metadata: &metadata.xml,
            metadata_url: request.metadata_url.as_deref().map(str::trim),
            metadata_signing_certificate: request
                .metadata_signing_certificate
                .as_deref()
                .map(str::trim),
            metadata_verified: metadata.verified,
            sp_entity_id: sp_entity_id.as_str(),
            acs_uri: acs_uri.as_str(),
            email_attribute: normalized_optional(request.email_attribute.as_deref()),
            display_name_attribute: normalized_optional(request.display_name_attribute.as_deref()),
            enabled: request.enabled,
            auto_provision: request.auto_provision,
            allow_email_link: request.allow_email_link,
            correlation_id: Uuid::now_v7(),
            now,
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
    path = "/api/v1/auth/saml/providers/{provider_id}",
    tag = "auth",
    params(("provider_id" = Uuid, Path, description = "SAML provider ID")),
    request_body = UpdateSamlProviderRequest,
    responses(
        (status = 200, body = SamlProviderResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_saml_provider(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(provider_id): Path<Uuid>,
    Json(request): Json<UpdateSamlProviderRequest>,
) -> ApiResult<Json<SamlProviderResponse>> {
    require_provider_management(&state, &actor, Some(&headers))?;
    validate_provider_fields(
        None,
        &request.display_name,
        request.email_attribute.as_deref(),
        request.display_name_attribute.as_deref(),
    )?;
    let metadata = ingest_metadata(
        saml_service(&state)?,
        request.metadata_xml,
        request.metadata_url.as_deref(),
        request.metadata_signing_certificate.as_deref(),
    )
    .await?;
    let mutation = SamlRepository::new(state.db.pool().clone())
        .update_provider(UpdateSamlProvider {
            id: provider_id,
            organization_id: actor.session.account.organization_id,
            actor_id: actor.session.account.user_id,
            display_name: request.display_name.trim(),
            idp_entity_id: &metadata.idp_entity_id,
            idp_metadata: &metadata.xml,
            metadata_url: request.metadata_url.as_deref().map(str::trim),
            metadata_signing_certificate: request
                .metadata_signing_certificate
                .as_deref()
                .map(str::trim),
            metadata_verified: metadata.verified,
            email_attribute: normalized_optional(request.email_attribute.as_deref()),
            display_name_attribute: normalized_optional(request.display_name_attribute.as_deref()),
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
    path = "/api/v1/auth/saml/providers/public",
    tag = "auth",
    params(PublicProvidersQuery),
    responses((status = 200, body = [PublicSamlProviderResponse]))
)]
pub(crate) async fn public_saml_providers(
    State(state): State<AppState>,
    Query(query): Query<PublicProvidersQuery>,
) -> ApiResult<Json<Vec<PublicSamlProviderResponse>>> {
    validate_slug(&query.organization)?;
    if !state.external_auth_enabled || state.saml.is_none() {
        return Ok(Json(Vec::new()));
    }
    let records = SamlRepository::new(state.db.pool().clone())
        .public_providers(query.organization.trim())
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        records
            .into_iter()
            .map(|record| PublicSamlProviderResponse {
                start_path: format!(
                    "/api/v1/auth/saml/{}/{}/start",
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
    path = "/api/v1/auth/saml/{organization}/{provider_key}/metadata",
    tag = "auth",
    params(
        ("organization" = String, Path, description = "Organization slug"),
        ("provider_key" = String, Path, description = "SAML provider key")
    ),
    responses(
        (status = 200, description = "Signed-capable SAML SP metadata", content_type = "application/samlmetadata+xml"),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn saml_metadata(
    State(state): State<AppState>,
    Path((organization, provider_key)): Path<(String, String)>,
) -> ApiResult<Response> {
    require_external_auth(&state)?;
    validate_slug(&organization)?;
    validate_slug(&provider_key)?;
    let provider = SamlRepository::new(state.db.pool().clone())
        .active_provider(&organization, &provider_key)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::from(DomainError::NotFound))?;
    let xml = saml_service(&state)?
        .service_provider_metadata(&provider.sp_entity_id, &provider.acs_uri)
        .map_err(ApiError::from)?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/samlmetadata+xml"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        xml,
    )
        .into_response())
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/saml/{organization}/{provider_key}/start",
    tag = "auth",
    params(
        ("organization" = String, Path, description = "Organization slug"),
        ("provider_key" = String, Path, description = "SAML provider key"),
        SamlStartQuery
    ),
    responses(
        (status = 200, description = "Auto-submitting signed SAML request form"),
        (status = 303, description = "Redirect carrying a signed SAML request"),
        (status = 404, body = ErrorBody),
        (status = 429, body = ErrorBody)
    )
)]
pub(crate) async fn start_saml(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path((organization, provider_key)): Path<(String, String)>,
    Query(query): Query<SamlStartQuery>,
) -> ApiResult<Response> {
    require_external_auth(&state)?;
    validate_slug(&organization)?;
    validate_slug(&provider_key)?;
    let return_path = normalize_return_path(query.return_to.as_deref())?;
    let rate_key = format!("auth:saml:start:{organization}:{provider_key}");
    if state
        .cache
        .increment(&rate_key, std::time::Duration::from_mins(1))
        .await
        .map_err(ApiError::from)?
        > 120
    {
        return Err(ApiError::rate_limited());
    }
    let repository = SamlRepository::new(state.db.pool().clone());
    let provider = repository
        .active_provider(&organization, &provider_key)
        .await
        .map_err(ApiError::from)?
        .ok_or_else(|| ApiError::from(DomainError::NotFound))?;
    let relay_state = random_token(32);
    let authorization = saml_service(&state)?
        .authorization(&provider, &relay_state)
        .map_err(ApiError::from)?;
    let browser_binding = random_token(32);
    let encrypted_relay_state = state
        .auth
        .seal(relay_state.as_bytes())
        .map_err(ApiError::from)?;
    let now = Utc::now();
    repository
        .begin_flow(NewSamlFlow {
            id: Uuid::now_v7(),
            provider_id: provider.id,
            organization_id: provider.organization_id,
            request_id: authorization.request_id(),
            relay_state_digest: Sha256::digest(relay_state.as_bytes()).as_slice(),
            encrypted_relay_state: &encrypted_relay_state,
            browser_binding_digest: Sha256::digest(browser_binding.as_bytes()).as_slice(),
            return_path: &return_path,
            expires_at: now + Duration::minutes(SAML_FLOW_MINUTES),
            now,
        })
        .await
        .map_err(ApiError::from)?;
    let jar = jar.add(flow_cookie(browser_binding, state.secure_cookies));
    dispatch_authorization(jar, authorization)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/saml/{organization}/{provider_key}/acs",
    tag = "auth",
    params(
        ("organization" = String, Path, description = "Organization slug"),
        ("provider_key" = String, Path, description = "SAML provider key")
    ),
    request_body(content = inline(SamlAcsForm), content_type = "application/x-www-form-urlencoded"),
    responses((status = 303, description = "Return to the Kitsune application"))
)]
pub(crate) async fn saml_acs(
    State(state): State<AppState>,
    jar: PrivateCookieJar,
    Path((organization, provider_key)): Path<(String, String)>,
    Form(form): Form<SamlAcsForm>,
) -> (PrivateCookieJar, Redirect) {
    match complete_assertion(&state, jar.clone(), &organization, &provider_key, form).await {
        Ok(result) => result,
        Err(_) => (
            jar.remove(flow_removal_cookie(state.secure_cookies)),
            Redirect::to("/login?saml_error=authentication_failed"),
        ),
    }
}

async fn complete_assertion(
    state: &AppState,
    jar: PrivateCookieJar,
    organization: &str,
    provider_key: &str,
    form: SamlAcsForm,
) -> ApiResult<(PrivateCookieJar, Redirect)> {
    require_external_auth(state)?;
    validate_slug(organization)?;
    validate_slug(provider_key)?;
    if form.relay_state.is_empty()
        || form.relay_state.len() > 256
        || form.saml_response.is_empty()
        || form.saml_response.len() > MAX_ASSERTION_BYTES
    {
        return Err(ApiError::unauthorized());
    }
    let browser_binding = jar
        .get(SAML_FLOW_COOKIE)
        .map(|cookie| cookie.value().to_owned())
        .ok_or_else(ApiError::unauthorized)?;
    let repository = SamlRepository::new(state.db.pool().clone());
    let flow = repository
        .resolve_flow(
            Sha256::digest(form.relay_state.as_bytes()).as_slice(),
            Sha256::digest(browser_binding.as_bytes()).as_slice(),
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?
        .ok_or_else(ApiError::unauthorized)?;
    if flow.provider.organization_slug != organization || flow.provider.key != provider_key {
        return Err(ApiError::unauthorized());
    }
    let sealed_relay_state = String::from_utf8(
        state
            .auth
            .open(&flow.encrypted_relay_state)
            .map_err(ApiError::from)?,
    )
    .map_err(|_| ApiError::unauthorized())?;
    if sealed_relay_state != form.relay_state {
        return Err(ApiError::unauthorized());
    }
    let claims = saml_service(state)?
        .verify_response(
            &flow.provider,
            &flow.request_id,
            &form.relay_state,
            &form.saml_response,
        )
        .map_err(ApiError::from)?;
    let mutation = repository
        .complete_login(
            &flow,
            VerifiedSamlIdentity {
                subject: &claims.subject,
                email: &claims.email,
                display_name: &claims.display_name,
                response_id: &claims.response_id,
                assertion_id: &claims.assertion_id,
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

async fn ingest_metadata(
    service: &SamlService,
    pasted_xml: Option<String>,
    metadata_url: Option<&str>,
    signing_certificate: Option<&str>,
) -> ApiResult<ValidatedSamlMetadata> {
    let xml = match (
        pasted_xml.filter(|xml| !xml.trim().is_empty()),
        normalized_optional(metadata_url),
    ) {
        (Some(xml), None) => xml,
        (None, Some(source)) => {
            let source = url::Url::parse(source).map_err(|_| {
                ApiError::from(DomainError::Validation(
                    "SAML metadata URL is invalid".into(),
                ))
            })?;
            service
                .fetch_metadata(&source)
                .await
                .map_err(ApiError::from)?
        }
        _ => {
            return Err(ApiError::from(DomainError::Validation(
                "provide exactly one SAML metadata source".into(),
            )));
        }
    };
    service
        .validate_metadata(xml, normalized_optional(signing_certificate))
        .map_err(ApiError::from)
}

fn dispatch_authorization(
    jar: PrivateCookieJar,
    authorization: SamlAuthorization,
) -> ApiResult<Response> {
    match authorization {
        SamlAuthorization::Redirect { url, .. } => {
            Ok((jar, Redirect::to(url.as_str())).into_response())
        }
        SamlAuthorization::Post { action, fields, .. } => {
            let html = auto_submit_form(&action, &fields);
            let origin = action.origin().ascii_serialization();
            let csp = HeaderValue::from_str(&format!(
                "default-src 'none'; form-action {origin}; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
            ))
            .map_err(|_| {
                ApiError::from(DomainError::Validation(
                    "SAML form destination is invalid".into(),
                ))
            })?;
            let headers = [
                (header::CONTENT_SECURITY_POLICY, csp),
                (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
                (
                    header::REFERRER_POLICY,
                    HeaderValue::from_static("no-referrer"),
                ),
            ];
            Ok((jar, headers, Html(html)).into_response())
        }
    }
}

fn auto_submit_form(action: &url::Url, fields: &[(String, String)]) -> String {
    let mut hidden_fields = String::new();
    for (name, value) in fields {
        write!(
            hidden_fields,
            "<input type=\"hidden\" name=\"{}\" value=\"{}\">",
            escape_html(name),
            escape_html(value),
        )
        .expect("writing to an in-memory string cannot fail");
    }
    format!(
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Continue to identity provider</title><style>body{{font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#0b0b10;color:#f7f7fb}}button{{font:inherit;padding:.75rem 1rem;border:0;border-radius:.65rem}}</style><form method=\"post\" action=\"{}\">{}<p>Opening your identity provider…</p><noscript><button type=\"submit\">Continue</button></noscript></form><script>document.forms[0].submit()</script></html>",
        escape_html(action.as_str()),
        hidden_fields,
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
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
    if state.external_auth_enabled && state.saml.is_some() {
        Ok(())
    } else {
        Err(ApiError::from(DomainError::NotFound))
    }
}

fn saml_service(state: &AppState) -> ApiResult<&SamlService> {
    state
        .saml
        .as_ref()
        .ok_or_else(|| ApiError::from(DomainError::NotFound))
}

fn validate_provider_fields(
    key: Option<&str>,
    display_name: &str,
    email_attribute: Option<&str>,
    display_name_attribute: Option<&str>,
) -> ApiResult<()> {
    if let Some(key) = key {
        validate_slug(key.trim())?;
    }
    if display_name.trim().is_empty() || display_name.chars().count() > 80 {
        return Err(ApiError::from(DomainError::Validation(
            "SAML provider display name is invalid".into(),
        )));
    }
    for attribute in [email_attribute, display_name_attribute]
        .into_iter()
        .flatten()
    {
        if attribute.trim().is_empty() || attribute.len() > 512 {
            return Err(ApiError::from(DomainError::Validation(
                "SAML attribute mapping is invalid".into(),
            )));
        }
    }
    Ok(())
}

fn canonical_endpoints(
    state: &AppState,
    organization: &str,
    provider_key: &str,
) -> (url::Url, url::Url) {
    let mut metadata = state.public_origin.clone();
    metadata.set_path(&format!(
        "/api/v1/auth/saml/{organization}/{provider_key}/metadata"
    ));
    let mut acs = state.public_origin.clone();
    acs.set_path(&format!(
        "/api/v1/auth/saml/{organization}/{provider_key}/acs"
    ));
    (metadata, acs)
}

fn normalize_return_path(return_to: Option<&str>) -> ApiResult<String> {
    let return_to = return_to.unwrap_or("/");
    if !return_to.starts_with('/') || return_to.starts_with("//") || return_to.len() > 2048 {
        return Err(ApiError::from(DomainError::Validation(
            "SAML return path must stay inside Kitsune".into(),
        )));
    }
    Ok(return_to.to_owned())
}

fn normalized_optional(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn flow_cookie(binding: String, secure: bool) -> Cookie<'static> {
    Cookie::build((SAML_FLOW_COOKIE, binding))
        .path("/api/v1/auth/saml/")
        .http_only(true)
        .secure(secure)
        .same_site(if secure {
            SameSite::None
        } else {
            SameSite::Lax
        })
        .max_age(time::Duration::minutes(SAML_FLOW_MINUTES))
        .build()
}

fn flow_removal_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build(SAML_FLOW_COOKIE)
        .path("/api/v1/auth/saml/")
        .http_only(true)
        .secure(secure)
        .same_site(if secure {
            SameSite::None
        } else {
            SameSite::Lax
        })
        .max_age(time::Duration::ZERO)
        .build()
}

impl From<SamlProviderRecord> for SamlProviderResponse {
    fn from(record: SamlProviderRecord) -> Self {
        Self {
            id: record.id,
            key: record.key,
            display_name: record.display_name,
            idp_entity_id: record.idp_entity_id,
            metadata_url: record.metadata_url,
            metadata_verified: record.metadata_verified,
            sp_entity_id: record.sp_entity_id,
            acs_uri: record.acs_uri,
            email_attribute: record.email_attribute,
            display_name_attribute: record.display_name_attribute,
            enabled: record.enabled,
            auto_provision: record.auto_provision,
            allow_email_link: record.allow_email_link,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}
