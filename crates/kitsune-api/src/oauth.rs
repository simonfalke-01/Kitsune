//! OAuth2 confidential-client management and client-credentials exchange.

use std::{collections::BTreeSet, time::Duration as StdDuration};

use axum::{
    Form, Json,
    extract::{Path, State, rejection::FormRejection},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Duration, Utc};
use kitsune_core::DomainError;
use kitsune_db::oauth::{NewOAuthClient, OAuthClientRecord, OAuthClientRepository};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    Actor, ApiError, ApiResult, AppState, ErrorBody,
    tokens::{
        ProgrammaticTokenClaims, ProgrammaticTokenKind, canonical_event_ids, canonical_scopes,
    },
};

const ACCESS_TOKEN_LIFETIME_SECONDS: i64 = 15 * 60;
const TOKEN_EXCHANGE_LIMIT_PER_MINUTE: u64 = 30;

/// New OAuth2 confidential-client request.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateOAuthClientRequest {
    /// Human-readable client name.
    pub name: String,
    /// Maximum fine-grained permission scopes.
    pub scopes: Vec<String>,
    /// Optional event allow-list. Empty means organization-wide.
    #[serde(default)]
    pub event_ids: Vec<Uuid>,
}

/// Safe persisted OAuth2 client metadata.
#[derive(Debug, Serialize, ToSchema)]
pub struct OAuthClientResponse {
    /// Internal management ID.
    pub id: Uuid,
    /// Public client identifier.
    pub client_id: String,
    /// Human-readable client name.
    pub name: String,
    /// Maximum permission scopes.
    pub scopes: Vec<String>,
    /// Optional event allow-list.
    pub event_ids: Vec<Uuid>,
    /// Coarsely updated last token-exchange time.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

/// One-time confidential-client creation response.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedOAuthClientResponse {
    /// Safe persisted metadata.
    #[serde(flatten)]
    pub metadata: OAuthClientResponse,
    /// Client secret shown exactly once.
    pub client_secret: String,
}

/// RFC 6749 client-credentials token request.
#[derive(Debug, Deserialize, ToSchema)]
pub struct OAuthTokenRequest {
    /// Must be `client_credentials`.
    pub grant_type: String,
    /// Optional space-delimited subset of registered scopes.
    pub scope: Option<String>,
}

/// RFC 6749 bearer access-token response.
#[derive(Debug, Serialize, ToSchema)]
pub struct OAuthTokenResponse {
    /// Short-lived PASETO bearer credential.
    pub access_token: String,
    /// Always `Bearer`.
    pub token_type: &'static str,
    /// Lifetime in seconds.
    pub expires_in: i64,
    /// Granted space-delimited scopes.
    pub scope: String,
}

/// RFC 6749 token-endpoint error response.
#[derive(Debug, Serialize, ToSchema)]
pub struct OAuthErrorResponse {
    /// Stable OAuth error code.
    pub error: &'static str,
    /// Safe human-readable detail.
    pub error_description: &'static str,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/oauth-clients",
    tag = "auth",
    responses(
        (status = 200, body = [OAuthClientResponse]),
        (status = 401, body = ErrorBody)
    )
)]
pub(crate) async fn list_oauth_clients(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<OAuthClientResponse>>> {
    actor.require_interactive_session()?;
    let records = OAuthClientRepository::new(state.db.pool().clone())
        .list(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        records.into_iter().map(OAuthClientResponse::from).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/oauth-clients",
    tag = "auth",
    request_body = CreateOAuthClientRequest,
    responses(
        (status = 201, body = CreatedOAuthClientResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_oauth_client(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateOAuthClientRequest>,
) -> ApiResult<(StatusCode, Json<CreatedOAuthClientResponse>)> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let name = request.name.trim();
    if !(1..=80).contains(&name.chars().count()) {
        return Err(ApiError::from(DomainError::Validation(
            "OAuth client name must contain 1 to 80 characters".into(),
        )));
    }
    let scopes = canonical_scopes(&actor, request.scopes)?;
    let event_ids = canonical_event_ids(request.event_ids)?;
    let id = Uuid::now_v7();
    let client_id = random_credential("kitc_", 18);
    let client_secret = random_credential("kits_", 32);
    let secret_digest = Sha256::digest(client_secret.as_bytes());
    let mutation = OAuthClientRepository::new(state.db.pool().clone())
        .create(NewOAuthClient {
            id,
            user_id: actor.session.account.user_id,
            organization_id: actor.session.account.organization_id,
            name,
            client_id: &client_id,
            client_secret_digest: secret_digest.as_slice(),
            scopes: &scopes,
            event_ids: &event_ids,
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
        Json(CreatedOAuthClientResponse {
            metadata: mutation.record.into(),
            client_secret,
        }),
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/auth/oauth-clients/{client_id}",
    tag = "auth",
    params(("client_id" = Uuid, Path, description = "Internal client ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn revoke_oauth_client(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(client_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let mutation = OAuthClientRepository::new(state.db.pool().clone())
        .revoke(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            client_id,
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

#[utoipa::path(
    post,
    path = "/oauth/token",
    tag = "auth",
    request_body(content = OAuthTokenRequest, content_type = "application/x-www-form-urlencoded"),
    responses(
        (status = 200, body = OAuthTokenResponse),
        (status = 400, body = OAuthErrorResponse),
        (status = 401, body = OAuthErrorResponse),
        (status = 429, body = OAuthErrorResponse)
    )
)]
pub(crate) async fn exchange_client_credentials(
    State(state): State<AppState>,
    headers: HeaderMap,
    form: Result<Form<OAuthTokenRequest>, FormRejection>,
) -> Response {
    let Ok(Form(request)) = form else {
        return oauth_error(
            StatusCode::BAD_REQUEST,
            "invalid_request",
            "The token request must be form encoded.",
            false,
        );
    };
    if request.grant_type != "client_credentials" {
        return oauth_error(
            StatusCode::BAD_REQUEST,
            "unsupported_grant_type",
            "Only the client_credentials grant is supported.",
            false,
        );
    }
    let Some((client_id, client_secret)) = basic_credentials(&headers) else {
        return oauth_error(
            StatusCode::UNAUTHORIZED,
            "invalid_client",
            "Client authentication failed.",
            true,
        );
    };
    let rate_key = format!(
        "auth:oauth:{}",
        hex::encode(Sha256::digest(client_id.as_bytes()))
    );
    let Ok(attempts) = state
        .cache
        .increment(&rate_key, StdDuration::from_mins(1))
        .await
    else {
        return oauth_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "The authorization server is temporarily unavailable.",
            false,
        );
    };
    if attempts > TOKEN_EXCHANGE_LIMIT_PER_MINUTE {
        return oauth_error(
            StatusCode::TOO_MANY_REQUESTS,
            "temporarily_unavailable",
            "Too many token requests. Try again shortly.",
            false,
        );
    }
    let secret_digest = Sha256::digest(client_secret.as_bytes());
    let principal = match OAuthClientRepository::new(state.db.pool().clone())
        .authenticate(&client_id, secret_digest.as_slice())
        .await
    {
        Ok(Some(principal)) => principal,
        Ok(None) => {
            return oauth_error(
                StatusCode::UNAUTHORIZED,
                "invalid_client",
                "Client authentication failed.",
                true,
            );
        }
        Err(_) => {
            return oauth_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "temporarily_unavailable",
                "The authorization server is temporarily unavailable.",
                false,
            );
        }
    };
    let live_permissions = match state
        .auth_repository
        .permission_keys(principal.user_id, principal.organization_id, None)
        .await
    {
        Ok(permissions) => permissions.into_iter().collect::<BTreeSet<_>>(),
        Err(_) => {
            return oauth_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "temporarily_unavailable",
                "The authorization server is temporarily unavailable.",
                false,
            );
        }
    };
    let effective = principal
        .scopes
        .iter()
        .filter(|scope| live_permissions.contains(*scope))
        .cloned()
        .collect::<BTreeSet<_>>();
    let Ok(scopes) = requested_scopes(request.scope.as_deref(), &effective) else {
        return oauth_error(
            StatusCode::BAD_REQUEST,
            "invalid_scope",
            "The requested scope exceeds the registered client grant.",
            false,
        );
    };
    let now = Utc::now();
    let expires_at = now + Duration::seconds(ACCESS_TOKEN_LIFETIME_SECONDS);
    let claims = ProgrammaticTokenClaims {
        kind: ProgrammaticTokenKind::OAuthAccess,
        token_id: Uuid::now_v7(),
        user_id: principal.user_id.0,
        organization_id: principal.organization_id.0,
        issued_at: now.timestamp(),
        expires_at: expires_at.timestamp(),
        oauth_client_id: Some(principal.id),
        scopes: scopes.clone(),
    };
    let Ok(access_token) = state.tokens.issue(&claims) else {
        return oauth_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "The authorization server is temporarily unavailable.",
            false,
        );
    };
    let Ok(event) = OAuthClientRepository::new(state.db.pool().clone())
        .record_exchange(principal.id, Uuid::now_v7(), now)
        .await
    else {
        return oauth_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "The authorization server is temporarily unavailable.",
            false,
        );
    };
    if state.event_bus.publish(event).await.is_err() {
        return oauth_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "temporarily_unavailable",
            "The authorization server is temporarily unavailable.",
            false,
        );
    }
    oauth_success(OAuthTokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_LIFETIME_SECONDS,
        scope: scopes.join(" "),
    })
}

fn requested_scopes(
    requested: Option<&str>,
    allowed: &BTreeSet<String>,
) -> Result<Vec<String>, ()> {
    let selected = match requested {
        Some(requested) => requested
            .split_ascii_whitespace()
            .map(str::to_owned)
            .collect::<BTreeSet<_>>(),
        None => allowed.clone(),
    };
    if selected.is_empty() || selected.len() > 32 || !selected.is_subset(allowed) {
        return Err(());
    }
    Ok(selected.into_iter().collect())
}

fn basic_credentials(headers: &HeaderMap) -> Option<(String, String)> {
    let encoded = headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Basic ")?;
    if encoded.len() > 1_024 {
        return None;
    }
    let decoded = STANDARD.decode(encoded).ok()?;
    let decoded = std::str::from_utf8(&decoded).ok()?;
    let (client_id, client_secret) = decoded.split_once(':')?;
    if !(1..=128).contains(&client_id.len()) || !(32..=512).contains(&client_secret.len()) {
        return None;
    }
    Some((client_id.to_owned(), client_secret.to_owned()))
}

fn random_credential(prefix: &str, byte_count: usize) -> String {
    let mut bytes = vec![0_u8; byte_count];
    rand::fill(bytes.as_mut_slice());
    format!(
        "{prefix}{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    )
}

fn oauth_success(body: OAuthTokenResponse) -> Response {
    let mut response = (StatusCode::OK, Json(body)).into_response();
    no_store(response.headers_mut());
    response
}

fn oauth_error(
    status: StatusCode,
    error: &'static str,
    error_description: &'static str,
    authenticate: bool,
) -> Response {
    let mut response = (
        status,
        Json(OAuthErrorResponse {
            error,
            error_description,
        }),
    )
        .into_response();
    no_store(response.headers_mut());
    if authenticate {
        response.headers_mut().insert(
            header::WWW_AUTHENTICATE,
            HeaderValue::from_static("Basic realm=\"Kitsune OAuth\""),
        );
    }
    response
}

fn no_store(headers: &mut HeaderMap) {
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
}

impl From<OAuthClientRecord> for OAuthClientResponse {
    fn from(record: OAuthClientRecord) -> Self {
        Self {
            id: record.id,
            client_id: record.client_id,
            name: record.name,
            scopes: record.scopes,
            event_ids: record.event_ids,
            last_used_at: record.last_used_at,
            revoked_at: record.revoked_at,
            created_at: record.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::requested_scopes;

    #[test]
    fn requested_scopes_are_deduplicated_bounded_and_narrowed() {
        let allowed = ["challenge_read".to_owned(), "scoreboard_read".to_owned()]
            .into_iter()
            .collect::<BTreeSet<_>>();
        assert_eq!(
            requested_scopes(Some("scoreboard_read scoreboard_read"), &allowed),
            Ok(vec!["scoreboard_read".to_owned()])
        );
        assert!(requested_scopes(Some("event_manage"), &allowed).is_err());
        assert!(requested_scopes(Some(""), &allowed).is_err());
    }
}
