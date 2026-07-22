//! PASETO v4.local issuance and revocable API-token management.

use std::collections::BTreeSet;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{DateTime, Duration, Utc};
use kitsune_core::DomainError;
use kitsune_db::tokens::{ApiTokenRecord, ApiTokenRepository, NewApiToken};
use pasetors::{
    Local,
    keys::SymmetricKey,
    token::UntrustedToken,
    version4::{LocalToken, V4},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody};

const TOKEN_IMPLICIT_ASSERTION: &[u8] = b"kitsune:programmatic:v1";
const DEFAULT_EXPIRY_DAYS: u16 = 30;
const MAX_EXPIRY_DAYS: u16 = 365;

/// Programmatic credential class carried inside the authenticated token.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProgrammaticTokenKind {
    /// User-created long-lived personal API token.
    ApiToken,
    /// Short-lived OAuth2 client-credentials access token.
    OAuthAccess,
}

/// Authenticated PASETO payload. Database state remains authoritative for
/// revocation and scope changes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ProgrammaticTokenClaims {
    pub(crate) kind: ProgrammaticTokenKind,
    pub(crate) token_id: Uuid,
    pub(crate) user_id: Uuid,
    pub(crate) organization_id: Uuid,
    pub(crate) issued_at: i64,
    pub(crate) expires_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) oauth_client_id: Option<Uuid>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) scopes: Vec<String>,
}

/// Stable installation-key-backed PASETO v4.local codec.
#[derive(Clone)]
pub struct TokenService {
    key: std::sync::Arc<SymmetricKey<V4>>,
}

impl TokenService {
    /// Derives a domain-separated PASETO key from installation key material.
    pub fn from_master_key(master: &[u8]) -> Result<Self, DomainError> {
        if master.len() < 32 {
            return Err(DomainError::Validation(
                "token master key must be at least 32 bytes".into(),
            ));
        }
        let mut hasher = Sha256::new();
        hasher.update(b"kitsune:paseto:v4.local:");
        hasher.update(master);
        let digest = hasher.finalize();
        let key = SymmetricKey::<V4>::from(digest.as_slice())
            .map_err(|_| DomainError::Unavailable("PASETO key derivation failed".into()))?;
        Ok(Self {
            key: std::sync::Arc::new(key),
        })
    }

    /// Encrypts an authenticated v4.local programmatic credential.
    pub(crate) fn issue(&self, claims: &ProgrammaticTokenClaims) -> Result<String, DomainError> {
        let payload = serde_json::to_vec(claims)
            .map_err(|error| DomainError::Validation(error.to_string()))?;
        LocalToken::encrypt(&self.key, &payload, None, Some(TOKEN_IMPLICIT_ASSERTION))
            .map_err(|_| DomainError::Unavailable("PASETO issuance failed".into()))
    }

    /// Authenticates, decrypts, and validates temporal/token-kind claims.
    pub(crate) fn parse(
        &self,
        token: &str,
        now: DateTime<Utc>,
    ) -> Result<ProgrammaticTokenClaims, DomainError> {
        if token.len() > 4_096 || !token.starts_with(LocalToken::HEADER) {
            return Err(DomainError::Forbidden);
        }
        let untrusted =
            UntrustedToken::<Local, V4>::try_from(token).map_err(|_| DomainError::Forbidden)?;
        let trusted =
            LocalToken::decrypt(&self.key, &untrusted, None, Some(TOKEN_IMPLICIT_ASSERTION))
                .map_err(|_| DomainError::Forbidden)?;
        let claims: ProgrammaticTokenClaims =
            serde_json::from_str(trusted.payload()).map_err(|_| DomainError::Forbidden)?;
        let now = now.timestamp();
        if claims.issued_at > now.saturating_add(60) || claims.expires_at <= now {
            return Err(DomainError::Forbidden);
        }
        Ok(claims)
    }
}

/// New API-token request. The cleartext token is returned exactly once.
#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateApiTokenRequest {
    /// Human-readable token name.
    pub name: String,
    /// Fine-grained permission keys, each bounded by the caller's live RBAC.
    pub scopes: Vec<String>,
    /// Optional event allow-list. An empty list is organization-wide.
    #[serde(default)]
    pub event_ids: Vec<Uuid>,
    /// Lifetime in days; defaults to 30 and cannot exceed 365.
    pub expires_in_days: Option<u16>,
}

/// Safe persisted API-token metadata.
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiTokenResponse {
    /// Token ID.
    pub id: Uuid,
    /// Human-readable token name.
    pub name: String,
    /// Effective requested scope ceiling.
    pub scopes: Vec<String>,
    /// Optional event allow-list.
    pub event_ids: Vec<Uuid>,
    /// Mandatory expiry.
    pub expires_at: DateTime<Utc>,
    /// Coarsely updated last-use time.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

/// One-time API-token creation response.
#[derive(Debug, Serialize, ToSchema)]
pub struct CreatedApiTokenResponse {
    /// Safe persisted metadata.
    #[serde(flatten)]
    pub metadata: ApiTokenResponse,
    /// PASETO v4.local bearer value, shown exactly once.
    pub token: String,
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/tokens",
    tag = "auth",
    responses(
        (status = 200, body = [ApiTokenResponse]),
        (status = 401, body = ErrorBody)
    )
)]
pub(crate) async fn list_api_tokens(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<ApiTokenResponse>>> {
    actor.require_interactive_session()?;
    let records = ApiTokenRepository::new(state.db.pool().clone())
        .list(
            actor.session.account.organization_id,
            actor.session.account.user_id,
        )
        .await
        .map_err(ApiError::from)?;
    Ok(Json(
        records.into_iter().map(ApiTokenResponse::from).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/tokens",
    tag = "auth",
    request_body = CreateApiTokenRequest,
    responses(
        (status = 201, body = CreatedApiTokenResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_api_token(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateApiTokenRequest>,
) -> ApiResult<(StatusCode, Json<CreatedApiTokenResponse>)> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let name = request.name.trim();
    if !(1..=80).contains(&name.chars().count()) {
        return Err(ApiError::from(DomainError::Validation(
            "token name must contain 1 to 80 characters".into(),
        )));
    }
    let scopes = canonical_scopes(&actor, request.scopes)?;
    let event_ids = canonical_event_ids(request.event_ids)?;
    let expiry_days = request.expires_in_days.unwrap_or(DEFAULT_EXPIRY_DAYS);
    if !(1..=MAX_EXPIRY_DAYS).contains(&expiry_days) {
        return Err(ApiError::from(DomainError::Validation(format!(
            "token expiry must be between 1 and {MAX_EXPIRY_DAYS} days"
        ))));
    }
    let now = Utc::now();
    let expires_at = now + Duration::days(i64::from(expiry_days));
    let token_id = Uuid::now_v7();
    let claims = ProgrammaticTokenClaims {
        kind: ProgrammaticTokenKind::ApiToken,
        token_id,
        user_id: actor.session.account.user_id.0,
        organization_id: actor.session.account.organization_id.0,
        issued_at: now.timestamp(),
        expires_at: expires_at.timestamp(),
        oauth_client_id: None,
        scopes: Vec::new(),
    };
    let token = state.tokens.issue(&claims).map_err(ApiError::from)?;
    let token_digest = Sha256::digest(token.as_bytes());
    let mutation = ApiTokenRepository::new(state.db.pool().clone())
        .create(NewApiToken {
            id: token_id,
            user_id: actor.session.account.user_id,
            organization_id: actor.session.account.organization_id,
            name,
            token_digest: token_digest.as_slice(),
            scopes: &scopes,
            event_ids: &event_ids,
            expires_at,
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
    Ok((
        StatusCode::CREATED,
        Json(CreatedApiTokenResponse {
            metadata: mutation.record.into(),
            token,
        }),
    ))
}

#[utoipa::path(
    delete,
    path = "/api/v1/auth/tokens/{token_id}",
    tag = "auth",
    params(("token_id" = Uuid, Path, description = "Token ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody)
    )
)]
pub(crate) async fn revoke_api_token(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(token_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require_interactive_session()?;
    actor.require_csrf(&headers)?;
    let mutation = ApiTokenRepository::new(state.db.pool().clone())
        .revoke(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            token_id,
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

pub(crate) fn canonical_scopes(actor: &Actor, scopes: Vec<String>) -> ApiResult<Vec<String>> {
    let scopes = scopes
        .into_iter()
        .map(|scope| scope.trim().to_owned())
        .collect::<BTreeSet<_>>();
    if scopes.is_empty() || scopes.len() > 32 || scopes.iter().any(String::is_empty) {
        return Err(ApiError::from(DomainError::Validation(
            "choose between 1 and 32 token scopes".into(),
        )));
    }
    for scope in &scopes {
        actor.require(scope)?;
    }
    Ok(scopes.into_iter().collect())
}

pub(crate) fn canonical_event_ids(event_ids: Vec<Uuid>) -> ApiResult<Vec<Uuid>> {
    let unique = event_ids.into_iter().collect::<BTreeSet<_>>();
    if unique.len() > 100 {
        return Err(ApiError::from(DomainError::Validation(
            "a token can be scoped to at most 100 events".into(),
        )));
    }
    Ok(unique.into_iter().collect())
}

impl From<ApiTokenRecord> for ApiTokenResponse {
    fn from(record: ApiTokenRecord) -> Self {
        Self {
            id: record.id,
            name: record.name,
            scopes: record.scopes,
            event_ids: record.event_ids,
            expires_at: record.expires_at,
            last_used_at: record.last_used_at,
            revoked_at: record.revoked_at,
            created_at: record.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use uuid::Uuid;

    use super::{ProgrammaticTokenClaims, ProgrammaticTokenKind, TokenService};

    #[test]
    fn v4_local_tokens_round_trip_and_reject_tampering() {
        let service = TokenService::from_master_key(&[7_u8; 64]).expect("service");
        let now = Utc::now();
        let claims = ProgrammaticTokenClaims {
            kind: ProgrammaticTokenKind::ApiToken,
            token_id: Uuid::now_v7(),
            user_id: Uuid::now_v7(),
            organization_id: Uuid::now_v7(),
            issued_at: now.timestamp(),
            expires_at: (now + Duration::minutes(5)).timestamp(),
            oauth_client_id: None,
            scopes: Vec::new(),
        };
        let token = service.issue(&claims).expect("issue");
        assert!(token.starts_with("v4.local."));
        assert_eq!(service.parse(&token, now).expect("parse"), claims);

        let mut tampered = token.into_bytes();
        let last = tampered.last_mut().expect("token byte");
        *last = if *last == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(tampered).expect("UTF-8 token");
        assert!(service.parse(&tampered, now).is_err());
    }
}
