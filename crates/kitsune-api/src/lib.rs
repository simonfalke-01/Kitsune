//! Secured Kitsune HTTP, OpenAPI, WebSocket, and SSE transports.

mod auth;
mod engagement;
mod error;
mod oauth;
mod oidc;
mod oidc_routes;
mod passkeys;
mod realtime;
mod resources;
mod submissions;
mod teams;
mod tokens;

use std::{sync::Arc, time::Instant};

use axum::{
    Json, Router,
    extract::{FromRef, State},
    http::{HeaderName, HeaderValue, Method},
    routing::{get, post},
};
use axum_extra::extract::cookie::Key;
use kitsune_core::ports::{Cache, EventBus};
use kitsune_db::{PostgresStore, auth::AuthRepository};
use serde::Serialize;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

pub use auth::{Actor, AuthService, SessionIdentity};
pub use error::{ApiError, ApiResult, ErrorBody};
pub use oidc::OidcService;
pub use passkeys::PasskeyService;
pub use tokens::TokenService;

/// Shared application dependencies. Trait objects keep scaled adapters
/// swappable without changing route code.
#[derive(Clone)]
pub struct AppState {
    /// PostgreSQL store.
    pub db: PostgresStore,
    /// Authentication repository.
    pub auth_repository: AuthRepository,
    /// Password/session service.
    pub auth: AuthService,
    /// PASETO v4.local programmatic-token service.
    pub tokens: tokens::TokenService,
    /// Rate-limit and ephemeral state adapter.
    pub cache: Arc<dyn Cache>,
    /// Typed realtime backbone.
    pub event_bus: Arc<dyn EventBus>,
    /// Cookie AEAD key.
    pub cookie_key: Key,
    /// Emit Secure cookie attribute.
    pub secure_cookies: bool,
    /// Secured OpenID Connect protocol client.
    pub oidc: OidcService,
    /// Exact-origin WebAuthn verifier.
    pub passkeys: PasskeyService,
    /// Whether external identity routes are exposed for this runtime profile.
    pub external_auth_enabled: bool,
    /// Canonical browser-facing origin used for authentication callbacks.
    pub public_origin: url::Url,
    started_at: Instant,
}

impl AppState {
    /// Composes application state from explicit adapters.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db: PostgresStore,
        auth_repository: AuthRepository,
        auth: AuthService,
        tokens: tokens::TokenService,
        cache: Arc<dyn Cache>,
        event_bus: Arc<dyn EventBus>,
        cookie_key: Key,
        secure_cookies: bool,
    ) -> Self {
        Self {
            db,
            auth_repository,
            auth,
            tokens,
            cache,
            event_bus,
            cookie_key,
            secure_cookies,
            oidc: OidcService::default(),
            passkeys: PasskeyService::default(),
            external_auth_enabled: false,
            public_origin: url::Url::parse("http://localhost:3000")
                .expect("static public origin is valid"),
            started_at: Instant::now(),
        }
    }

    /// Enables or disables external auth and installs its egress-aware client.
    #[must_use]
    pub fn with_oidc(mut self, oidc: OidcService, enabled: bool, public_origin: url::Url) -> Self {
        self.oidc = oidc;
        self.external_auth_enabled = enabled;
        self.public_origin = public_origin;
        self
    }

    /// Installs the passkey relying-party verifier derived from the canonical
    /// browser origin.
    #[must_use]
    pub fn with_passkeys(mut self, passkeys: PasskeyService) -> Self {
        self.passkeys = passkeys;
        self
    }
}

impl FromRef<AppState> for Key {
    fn from_ref(state: &AppState) -> Self {
        state.cookie_key.clone()
    }
}

/// Health document.
#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    /// Stable status.
    status: &'static str,
    /// Server version.
    version: &'static str,
    /// Process uptime in seconds.
    uptime_seconds: u64,
}

/// Readiness document.
#[derive(Debug, Serialize, ToSchema)]
pub struct ReadinessResponse {
    /// Stable status.
    status: &'static str,
    /// PostgreSQL dependency state.
    postgres: &'static str,
}

/// Code-generated OpenAPI document.
#[derive(OpenApi)]
#[openapi(
    info(
        title = "Kitsune API",
        version = "0.1.0",
        description = "Typed organizer, player, integration, and realtime API"
    ),
    paths(
        health,
        readiness,
        auth::setup_status,
        auth::setup,
        auth::register,
        auth::login,
        auth::verify_email,
        auth::start_recovery,
        auth::complete_recovery,
        auth::current_session,
        auth::logout,
        auth::start_totp,
        auth::confirm_totp,
        auth::list_sessions,
        auth::revoke_session,
        tokens::list_api_tokens,
        tokens::create_api_token,
        tokens::revoke_api_token,
        oauth::list_oauth_clients,
        oauth::create_oauth_client,
        oauth::revoke_oauth_client,
        oauth::exchange_client_credentials,
        oidc_routes::list_oidc_providers,
        oidc_routes::create_oidc_provider,
        oidc_routes::update_oidc_provider,
        oidc_routes::public_oidc_providers,
        oidc_routes::start_oidc,
        oidc_routes::oidc_callback,
        passkeys::start_passkey_registration,
        passkeys::finish_passkey_registration,
        passkeys::start_passkey_login,
        passkeys::finish_passkey_login,
        passkeys::list_passkeys,
        passkeys::revoke_passkey,
        resources::list_events,
        resources::create_event,
        resources::update_event_state,
        resources::update_scoreboard_controls,
        resources::list_challenges,
        resources::create_challenge,
        engagement::get_writeup,
        engagement::save_writeup,
        engagement::list_writeups,
        engagement::review_writeup,
        engagement::submit_survey,
        engagement::survey_summary,
        submissions::submit_answer,
        submissions::scoreboard,
        submissions::score_history,
        submissions::list_hints,
        submissions::unlock_hint,
        submissions::manual_review_queue,
        submissions::review_manual_submission,
        teams::list_teams,
        teams::create_team,
        teams::join_team,
        teams::transfer_captain
    ),
    components(schemas(
        HealthResponse,
        ReadinessResponse,
        ErrorBody,
        auth::SetupStatusResponse,
        auth::SetupRequest,
        auth::LoginRequest,
        auth::RegisterRequest,
        auth::TokenRequest,
        auth::RecoveryStartRequest,
        auth::RecoveryCompleteRequest,
        auth::TotpEnrollmentResponse,
        auth::TotpConfirmRequest,
        auth::RecoveryCodesResponse,
        auth::SessionSummaryResponse,
        resources::EventStateInput,
        resources::ParticipationInput,
        resources::ModeInput,
        resources::CreateEventRequest,
        resources::UpdateEventStateRequest,
        resources::UpdateScoreboardControlsRequest,
        resources::EventResponse,
        resources::ChallengeKindInput,
        resources::ChallengeStateInput,
        resources::ScoringInput,
        resources::VisibilityInput,
        resources::AnswerInput,
        resources::HintInput,
        resources::SurveyInput,
        resources::CreateChallengeRequest,
        resources::ChallengeResponse,
        engagement::SaveWriteupRequest,
        engagement::WriteupReviewStateInput,
        engagement::ReviewWriteupRequest,
        engagement::WriteupResponse,
        engagement::SubmitSurveyRequest,
        engagement::SurveyResponse,
        engagement::SurveyQuestionSummaryResponse,
        engagement::SurveySummaryResponse,
        submissions::SubmitAnswerRequest,
        submissions::SubmissionResponse,
        submissions::ScoreboardRowResponse,
        submissions::ScoreboardResponse,
        submissions::ScoreHistoryPointResponse,
        submissions::ScoreHistorySeriesResponse,
        submissions::ScoreHistoryResponse,
        submissions::HintResponse,
        submissions::HintUnlockResponse,
        submissions::ManualReviewResponse,
        submissions::ReviewManualSubmissionRequest,
        teams::TeamMemberResponse,
        teams::TeamResponse,
        teams::CreateTeamRequest,
        teams::CreateTeamResponse,
        teams::JoinTeamRequest,
        teams::TransferCaptainRequest,
        auth::SessionResponse,
        auth::UserResponse,
        tokens::CreateApiTokenRequest,
        tokens::ApiTokenResponse,
        tokens::CreatedApiTokenResponse,
        oauth::CreateOAuthClientRequest,
        oauth::OAuthClientResponse,
        oauth::CreatedOAuthClientResponse,
        oauth::OAuthTokenRequest,
        oauth::OAuthTokenResponse,
        oauth::OAuthErrorResponse,
        oidc_routes::CreateOidcProviderRequest,
        oidc_routes::UpdateOidcProviderRequest,
        oidc_routes::OidcProviderResponse,
        oidc_routes::PublicOidcProviderResponse,
        passkeys::StartPasskeyRegistrationRequest,
        passkeys::StartPasskeyLoginRequest,
        passkeys::PasskeyCeremonyResponse,
        passkeys::FinishPasskeyRequest,
        passkeys::PasskeyBrowserCredential,
        passkeys::PasskeyAuthenticatorResponse,
        passkeys::PasskeyResponse
    )),
    tags(
        (name = "system", description = "Health and diagnostics"),
        (name = "auth", description = "Setup, sessions, and authentication"),
        (name = "events", description = "Competition and workshop events"),
        (name = "challenges", description = "Challenge board and authoring"),
        (name = "writeups", description = "Player writeups and organizer review"),
        (name = "surveys", description = "Post-solve feedback and analytics"),
        (name = "submissions", description = "Challenge attempts and solves"),
        (name = "scoreboard", description = "Ranked event standings"),
        (name = "teams", description = "Player teams and captain controls")
    )
)]
pub struct ApiDoc;

/// Builds the complete API router and security middleware stack.
pub fn router(state: AppState) -> Router {
    let request_id = HeaderName::from_static("x-request-id");
    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            HeaderName::from_static("x-csrf-token"),
            request_id.clone(),
        ]);
    let middleware = ServiceBuilder::new()
        .layer(SetRequestIdLayer::new(request_id.clone(), MakeRequestUuid))
        .layer(PropagateRequestIdLayer::new(request_id))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static(
                "camera=(), microphone=(), geolocation=(), publickey-credentials-create=(self), publickey-credentials-get=(self)",
            ),
        ))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors);

    Router::new()
        .route("/health", get(health))
        .route("/ready", get(readiness))
        .route("/api/v1/setup", get(auth::setup_status).post(auth::setup))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/email/verify", post(auth::verify_email))
        .route("/api/v1/auth/recovery", post(auth::start_recovery))
        .route(
            "/api/v1/auth/recovery/complete",
            post(auth::complete_recovery),
        )
        .route("/api/v1/auth/session", get(auth::current_session))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/auth/mfa/totp/start", post(auth::start_totp))
        .route("/api/v1/auth/mfa/totp/confirm", post(auth::confirm_totp))
        .route("/api/v1/auth/sessions", get(auth::list_sessions))
        .route(
            "/api/v1/auth/sessions/{session_id}",
            axum::routing::delete(auth::revoke_session),
        )
        .route(
            "/api/v1/auth/tokens",
            get(tokens::list_api_tokens).post(tokens::create_api_token),
        )
        .route(
            "/api/v1/auth/tokens/{token_id}",
            axum::routing::delete(tokens::revoke_api_token),
        )
        .route(
            "/api/v1/auth/oauth-clients",
            get(oauth::list_oauth_clients).post(oauth::create_oauth_client),
        )
        .route(
            "/api/v1/auth/oauth-clients/{client_id}",
            axum::routing::delete(oauth::revoke_oauth_client),
        )
        .route("/oauth/token", post(oauth::exchange_client_credentials))
        .route(
            "/api/v1/auth/oidc/providers/public",
            get(oidc_routes::public_oidc_providers),
        )
        .route(
            "/api/v1/auth/oidc/providers",
            get(oidc_routes::list_oidc_providers).post(oidc_routes::create_oidc_provider),
        )
        .route(
            "/api/v1/auth/oidc/providers/{provider_id}",
            axum::routing::put(oidc_routes::update_oidc_provider),
        )
        .route(
            "/api/v1/auth/oidc/{organization}/{provider_key}/start",
            get(oidc_routes::start_oidc),
        )
        .route(
            "/api/v1/auth/oidc/{organization}/{provider_key}/callback",
            get(oidc_routes::oidc_callback),
        )
        .route("/api/v1/auth/passkeys", get(passkeys::list_passkeys))
        .route(
            "/api/v1/auth/passkeys/register/start",
            post(passkeys::start_passkey_registration),
        )
        .route(
            "/api/v1/auth/passkeys/register/finish",
            post(passkeys::finish_passkey_registration),
        )
        .route(
            "/api/v1/auth/passkeys/login/start",
            post(passkeys::start_passkey_login),
        )
        .route(
            "/api/v1/auth/passkeys/login/finish",
            post(passkeys::finish_passkey_login),
        )
        .route(
            "/api/v1/auth/passkeys/{credential_id}",
            axum::routing::delete(passkeys::revoke_passkey),
        )
        .route(
            "/api/v1/events",
            get(resources::list_events).post(resources::create_event),
        )
        .route(
            "/api/v1/events/{event_id}/state",
            axum::routing::patch(resources::update_event_state),
        )
        .route(
            "/api/v1/events/{event_id}/scoreboard-controls",
            axum::routing::patch(resources::update_scoreboard_controls),
        )
        .route(
            "/api/v1/events/{event_id}/challenges",
            get(resources::list_challenges).post(resources::create_challenge),
        )
        .route(
            "/api/v1/teams",
            get(teams::list_teams).post(teams::create_team),
        )
        .route("/api/v1/teams/join", post(teams::join_team))
        .route(
            "/api/v1/teams/{team_id}/captain",
            post(teams::transfer_captain),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/submissions",
            post(submissions::submit_answer),
        )
        .route(
            "/api/v1/events/{event_id}/scoreboard",
            get(submissions::scoreboard),
        )
        .route(
            "/api/v1/events/{event_id}/score-history",
            get(submissions::score_history),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/hints",
            get(submissions::list_hints),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/hints/{hint_id}/unlock",
            post(submissions::unlock_hint),
        )
        .route(
            "/api/v1/events/{event_id}/manual-reviews",
            get(submissions::manual_review_queue),
        )
        .route(
            "/api/v1/events/{event_id}/manual-reviews/{submission_id}",
            axum::routing::patch(submissions::review_manual_submission),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/writeup",
            get(engagement::get_writeup).put(engagement::save_writeup),
        )
        .route(
            "/api/v1/events/{event_id}/writeups",
            get(engagement::list_writeups),
        )
        .route(
            "/api/v1/events/{event_id}/writeups/{writeup_id}",
            axum::routing::patch(engagement::review_writeup),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/survey",
            post(engagement::submit_survey),
        )
        .route(
            "/api/v1/events/{event_id}/challenges/{challenge_id}/survey-summary",
            get(engagement::survey_summary),
        )
        .route("/api/v1/realtime/ws", get(realtime::websocket))
        .route("/api/v1/realtime/sse", get(realtime::sse))
        .merge(SwaggerUi::new("/api/docs").url("/api/openapi.json", ApiDoc::openapi()))
        .layer(middleware)
        .with_state(state)
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "system",
    responses((status = 200, body = HealthResponse))
)]
async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        uptime_seconds: state.started_at.elapsed().as_secs(),
    })
}

#[utoipa::path(
    get,
    path = "/ready",
    tag = "system",
    responses(
        (status = 200, body = ReadinessResponse),
        (status = 503, body = ErrorBody)
    )
)]
async fn readiness(State(state): State<AppState>) -> ApiResult<Json<ReadinessResponse>> {
    state.db.ready().await.map_err(ApiError::from)?;
    Ok(Json(ReadinessResponse {
        status: "ready",
        postgres: "ready",
    }))
}

/// Returns OpenAPI 3.1 JSON for SDK and documentation generation.
pub fn openapi_json() -> serde_json::Value {
    let mut document = ApiDoc::openapi();
    document.openapi = utoipa::openapi::OpenApiVersion::Version31;
    serde_json::to_value(document).expect("OpenAPI document is serializable")
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{
        body::Body,
        http::{Request, StatusCode, header},
    };
    use axum_extra::extract::cookie::Key;
    use chrono::Utc;
    use http_body_util::BodyExt;
    use kitsune_automation::{InProcessCache, InProcessEventBus};
    use kitsune_db::{MIGRATOR, PostgresStore, auth::AuthRepository};
    use sha2::{Digest, Sha256};
    use sqlx::PgPool;
    use totp_rs::{Algorithm as TotpAlgorithm, Secret, TOTP};
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;

    fn test_state(pool: PgPool) -> AppState {
        let store = PostgresStore::from_pool(pool.clone());
        AppState::new(
            store,
            AuthRepository::new(pool),
            AuthService::new().expect("auth"),
            TokenService::from_master_key(&[9_u8; 64]).expect("tokens"),
            Arc::new(InProcessCache::new(1_000).expect("cache")),
            Arc::new(InProcessEventBus::new(128).expect("bus")),
            Key::generate(),
            false,
        )
    }

    #[test]
    fn generated_document_is_openapi_31() {
        assert_eq!(openapi_json()["openapi"], "3.1.0");
        assert!(openapi_json()["paths"]["/api/v1/auth/login"].is_object());
        assert!(
            openapi_json()["paths"]["/api/v1/auth/oidc/{organization}/{provider_key}/callback"]
                .is_object()
        );
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn setup_session_csrf_and_logout_are_end_to_end(pool: PgPool) {
        let app = router(test_state(pool));
        let setup = Request::builder()
            .method("POST")
            .uri("/api/v1/setup")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization_name": "Night Shrine",
                    "organization_slug": "night-shrine",
                    "display_name": "Organizer",
                    "email": "organizer@example.test",
                    "password": "correct horse foxfire battery"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(setup).await.expect("setup response");
        assert_eq!(response.status(), StatusCode::CREATED);
        let cookies = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .filter_map(|value| value.split(';').next())
            .collect::<Vec<_>>()
            .join("; ");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let session: serde_json::Value = serde_json::from_slice(&body).expect("session JSON");
        let csrf = session["csrf_token"].as_str().expect("CSRF").to_owned();
        assert_eq!(session["user"]["email"], "organizer@example.test");

        let current = Request::builder()
            .uri("/api/v1/auth/session")
            .header(header::COOKIE, &cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(current)
            .await
            .expect("session response");
        assert_eq!(response.status(), StatusCode::OK);

        let without_csrf = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/logout")
            .header(header::COOKIE, &cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(without_csrf)
            .await
            .expect("logout response");
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let logout = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/logout")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(logout).await.expect("logout response");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let revoked = Request::builder()
            .uri("/api/v1/auth/session")
            .header(header::COOKIE, cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.oneshot(revoked).await.expect("revoked response");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn api_tokens_are_digest_only_scoped_and_revocable(pool: PgPool) {
        let app = router(test_state(pool.clone()));
        let setup = Request::builder()
            .method("POST")
            .uri("/api/v1/setup")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization_name": "Token Shrine",
                    "organization_slug": "token-shrine",
                    "display_name": "Token Keeper",
                    "email": "keeper@example.test",
                    "password": "correct horse foxfire battery"
                })
                .to_string(),
            ))
            .expect("setup request");
        let response = app.clone().oneshot(setup).await.expect("setup response");
        assert_eq!(response.status(), StatusCode::CREATED);
        let cookies = response_cookies(response.headers());
        let body = response
            .into_body()
            .collect()
            .await
            .expect("setup body")
            .to_bytes();
        let session: serde_json::Value = serde_json::from_slice(&body).expect("session JSON");
        let csrf = session["csrf_token"].as_str().expect("CSRF token");

        let create_event = Request::builder()
            .method("POST")
            .uri("/api/v1/events")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::from(
                serde_json::json!({
                    "name": "Scoped Token Trials",
                    "slug": "scoped-token-trials",
                    "description": "An event used to prove API token boundaries.",
                    "state": "draft",
                    "participation": "individual",
                    "modes": ["jeopardy"],
                    "starts_at": null,
                    "ends_at": null,
                    "team_size_limit": null
                })
                .to_string(),
            ))
            .expect("event request");
        let response = app
            .clone()
            .oneshot(create_event)
            .await
            .expect("event response");
        assert_eq!(response.status(), StatusCode::CREATED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("event body")
            .to_bytes();
        let event: serde_json::Value = serde_json::from_slice(&body).expect("event JSON");
        let event_id = event["id"].as_str().expect("event ID");

        let create_token = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/tokens")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::from(
                serde_json::json!({
                    "name": "Challenge reader",
                    "scopes": ["challenge_read"],
                    "event_ids": [event_id],
                    "expires_in_days": 7
                })
                .to_string(),
            ))
            .expect("token request");
        let response = app
            .clone()
            .oneshot(create_token)
            .await
            .expect("token response");
        assert_eq!(response.status(), StatusCode::CREATED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("token body")
            .to_bytes();
        let created: serde_json::Value = serde_json::from_slice(&body).expect("token JSON");
        let token_id = created["id"].as_str().expect("token ID");
        let token = created["token"].as_str().expect("token value");
        assert!(token.starts_with("v4.local."));
        assert_eq!(created["scopes"], serde_json::json!(["challenge_read"]));
        assert_eq!(created["event_ids"], serde_json::json!([event_id]));

        let stored_digest = sqlx::query_scalar!(
            "SELECT token_digest FROM api_tokens WHERE id = $1",
            Uuid::parse_str(token_id).expect("token UUID"),
        )
        .fetch_one(&pool)
        .await
        .expect("stored token digest");
        assert_eq!(stored_digest, Sha256::digest(token.as_bytes()).as_slice());
        assert_ne!(stored_digest, token.as_bytes());

        let authorized = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/challenges"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("authorized request");
        let response = app
            .clone()
            .oneshot(authorized)
            .await
            .expect("authorized response");
        assert_eq!(response.status(), StatusCode::OK);

        let outside_event_resource = Request::builder()
            .uri("/api/v1/events")
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("organization request");
        let response = app
            .clone()
            .oneshot(outside_event_resource)
            .await
            .expect("organization response");
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let outside_permission = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/scoreboard"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("scoreboard request");
        let response = app
            .clone()
            .oneshot(outside_permission)
            .await
            .expect("scoreboard response");
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let revoke = Request::builder()
            .method("DELETE")
            .uri(format!("/api/v1/auth/tokens/{token_id}"))
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .expect("revoke request");
        let response = app.clone().oneshot(revoke).await.expect("revoke response");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let revoked = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/challenges"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("revoked request");
        let response = app.oneshot(revoked).await.expect("revoked response");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let token_audit_count = sqlx::query_scalar!(
            r#"
            SELECT count(*) AS "count!"
            FROM audit_log
            WHERE resource_type = 'api_token'
            "#,
        )
        .fetch_one(&pool)
        .await
        .expect("token audit count");
        let token_event_count = sqlx::query_scalar!(
            r#"
            SELECT count(*) AS "count!"
            FROM event_outbox
            WHERE kind = 'auth.api_token.changed'
            "#,
        )
        .fetch_one(&pool)
        .await
        .expect("token outbox count");
        assert_eq!(token_audit_count, 2);
        assert_eq!(token_event_count, 2);
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn registration_totp_and_session_management_are_end_to_end(pool: PgPool) {
        let app = router(test_state(pool));
        let setup = Request::builder()
            .method("POST")
            .uri("/api/v1/setup")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization_name": "Foxfire League",
                    "organization_slug": "foxfire",
                    "display_name": "Owner",
                    "email": "owner@example.test",
                    "password": "correct horse foxfire battery"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(setup).await.expect("setup");
        let cookies = response_cookies(response.headers());
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let session: serde_json::Value = serde_json::from_slice(&body).expect("session");
        let csrf = session["csrf_token"].as_str().expect("csrf");

        let register = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/register")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization": "foxfire",
                    "display_name": "Player One",
                    "email": "player@example.test",
                    "password": "another correct foxfire secret"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(register).await.expect("register");
        assert_eq!(response.status(), StatusCode::CREATED);

        let start = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/mfa/totp/start")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(start).await.expect("start TOTP");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let enrollment: serde_json::Value = serde_json::from_slice(&body).expect("enrollment");
        let secret = Secret::Encoded(
            enrollment["secret"]
                .as_str()
                .expect("encoded secret")
                .to_owned(),
        )
        .to_bytes()
        .expect("decode secret");
        let generator = TOTP::new(
            TotpAlgorithm::SHA1,
            6,
            1,
            30,
            secret,
            Some("Kitsune".into()),
            "owner@example.test".into(),
        )
        .expect("TOTP");
        let code = generator.generate_current().expect("current code");
        let confirm = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/mfa/totp/confirm")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::from(serde_json::json!({"code": code}).to_string()))
            .expect("request");
        let response = app.clone().oneshot(confirm).await.expect("confirm TOTP");
        assert_eq!(response.status(), StatusCode::OK);

        let logout = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/logout")
            .header(header::COOKIE, &cookies)
            .header("x-csrf-token", csrf)
            .body(Body::empty())
            .expect("request");
        assert_eq!(
            app.clone().oneshot(logout).await.expect("logout").status(),
            StatusCode::NO_CONTENT
        );

        let missing_mfa = local_login(None);
        let response = app.clone().oneshot(missing_mfa).await.expect("login");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let error: serde_json::Value = serde_json::from_slice(&body).expect("error");
        assert_eq!(error["code"], "mfa_required");

        let response = app
            .clone()
            .oneshot(local_login(Some(
                generator.generate_current().expect("current code"),
            )))
            .await
            .expect("MFA login");
        assert_eq!(response.status(), StatusCode::OK);
        let login_cookies = response_cookies(response.headers());
        let sessions = Request::builder()
            .uri("/api/v1/auth/sessions")
            .header(header::COOKIE, login_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.oneshot(sessions).await.expect("sessions");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let sessions: serde_json::Value = serde_json::from_slice(&body).expect("sessions");
        assert_eq!(sessions.as_array().expect("array").len(), 1);
        assert_eq!(sessions[0]["current"], true);
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn event_and_challenge_resources_are_tenant_scoped_and_rbac_guarded(pool: PgPool) {
        let app = router(test_state(pool.clone()));
        let setup = Request::builder()
            .method("POST")
            .uri("/api/v1/setup")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization_name": "Outfox Open",
                    "organization_slug": "outfox",
                    "display_name": "Organizer",
                    "email": "organizer@example.test",
                    "password": "correct horse foxfire battery"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(setup).await.expect("setup");
        let admin_cookies = response_cookies(response.headers());
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let admin_session: serde_json::Value = serde_json::from_slice(&body).expect("session");
        let admin_csrf = admin_session["csrf_token"].as_str().expect("csrf");

        let create_event = Request::builder()
            .method("POST")
            .uri("/api/v1/events")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(
                serde_json::json!({
                    "name": "Outfox Open 2026",
                    "slug": "outfox-open-2026",
                    "description": "A live security competition.",
                    "state": "draft",
                    "participation": "individual",
                    "modes": ["jeopardy", "workshop"],
                    "starts_at": null,
                    "ends_at": null,
                    "team_size_limit": null
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(create_event)
            .await
            .expect("create event");
        assert_eq!(response.status(), StatusCode::CREATED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let event: serde_json::Value = serde_json::from_slice(&body).expect("event");
        let event_id = event["id"].as_str().expect("event id");

        let go_live = Request::builder()
            .method("PATCH")
            .uri(format!("/api/v1/events/{event_id}/state"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(r#"{"state":"live"}"#))
            .expect("request");
        let response = app.clone().oneshot(go_live).await.expect("go live");
        assert_eq!(response.status(), StatusCode::OK);

        let reopen_draft = Request::builder()
            .method("PATCH")
            .uri(format!("/api/v1/events/{event_id}/state"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(r#"{"state":"draft"}"#))
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(reopen_draft)
                .await
                .expect("invalid transition")
                .status(),
            StatusCode::CONFLICT
        );

        for (name, state) in [("Hidden trail", "draft"), ("Foxfire 101", "published")] {
            let create = Request::builder()
                .method("POST")
                .uri(format!("/api/v1/events/{event_id}/challenges"))
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &admin_cookies)
                .header("x-csrf-token", admin_csrf)
                .body(Body::from(
                    serde_json::json!({
                        "name": name,
                        "category": "Web",
                        "description": "Find the foxfire.",
                        "kind": {"type": "static_flag"},
                        "state": state,
                        "scoring": {"kind": "dynamic", "initial": 500, "minimum": 100, "decay": 50},
                        "visibility": {
                            "visible_from": null,
                            "visible_until": null,
                            "division_ids": [],
                            "prerequisites": []
                        },
                        "tags": ["intro"],
                        "max_attempts": 10,
                        "writeups_enabled": true,
                        "position": 0,
                        "answers": [{
                            "kind": "exact",
                            "value": "kit{never-persist-plaintext}",
                            "case_insensitive": false
                        }],
                        "hints": [{"id": 1, "content": "Look closely.", "cost": 10}],
                        "survey": [{"key": "difficulty", "prompt": "How hard?", "range": [1, 5], "required": true}]
                    })
                    .to_string(),
                ))
                .expect("request");
            assert_eq!(
                app.clone()
                    .oneshot(create)
                    .await
                    .expect("create challenge")
                    .status(),
                StatusCode::CREATED
            );
        }

        let admin_list = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/challenges"))
            .header(header::COOKIE, &admin_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(admin_list).await.expect("admin list");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let challenges: serde_json::Value = serde_json::from_slice(&body).expect("challenges");
        assert_eq!(challenges.as_array().expect("array").len(), 2);
        assert!(challenges[0].get("answers").is_none());

        let register = Request::builder()
            .method("POST")
            .uri("/api/v1/auth/register")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization": "outfox",
                    "display_name": "Player",
                    "email": "player@example.test",
                    "password": "another correct foxfire secret"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(register).await.expect("register");
        let player_cookies = response_cookies(response.headers());
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let player_session: serde_json::Value = serde_json::from_slice(&body).expect("session");
        let player_csrf = player_session["csrf_token"].as_str().expect("csrf");
        let player_id = player_session["user"]["id"].as_str().expect("player id");

        let create_team = Request::builder()
            .method("POST")
            .uri("/api/v1/teams")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(r#"{"name":"Nine Tails"}"#))
            .expect("request");
        let response = app.clone().oneshot(create_team).await.expect("create team");
        assert_eq!(response.status(), StatusCode::CREATED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let created_team: serde_json::Value = serde_json::from_slice(&body).expect("team");
        let team_id = created_team["team"]["id"].as_str().expect("team id");
        let invite_code = created_team["invite_code"].as_str().expect("invite code");
        let stored_invite_digest = sqlx::query_scalar!(
            "SELECT invite_code_digest FROM teams WHERE id = $1",
            Uuid::parse_str(team_id).expect("team UUID"),
        )
        .fetch_one(&pool)
        .await
        .expect("stored invite digest");
        assert_ne!(stored_invite_digest, invite_code.as_bytes());
        assert_eq!(
            stored_invite_digest.as_slice(),
            Sha256::digest(invite_code.as_bytes()).as_slice()
        );

        let join_team = Request::builder()
            .method("POST")
            .uri("/api/v1/teams/join")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({ "invite_code": invite_code }).to_string(),
            ))
            .expect("request");
        let response = app.clone().oneshot(join_team).await.expect("join team");
        assert_eq!(response.status(), StatusCode::OK);

        let transfer_captain = Request::builder()
            .method("POST")
            .uri(format!("/api/v1/teams/{team_id}/captain"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(
                serde_json::json!({ "user_id": player_id }).to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(transfer_captain)
            .await
            .expect("transfer captain");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let team: serde_json::Value = serde_json::from_slice(&body).expect("team");
        assert_eq!(team["members"][0]["user_id"], player_id);
        assert_eq!(team["members"][0]["captain"], true);

        let player_list = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/challenges"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(player_list).await.expect("player list");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let challenges: serde_json::Value = serde_json::from_slice(&body).expect("challenges");
        assert_eq!(challenges.as_array().expect("array").len(), 1);
        assert_eq!(challenges[0]["name"], "Foxfire 101");
        let published_challenge_id = challenges[0]["id"]
            .as_str()
            .expect("published challenge id");

        let incorrect = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/submissions"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "idempotency_key": Uuid::now_v7(),
                    "answer": "kit{wrong-trail}"
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(incorrect)
            .await
            .expect("incorrect submission");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let receipt: serde_json::Value = serde_json::from_slice(&body).expect("receipt");
        assert_eq!(receipt["outcome"], "incorrect");
        assert_eq!(receipt["attempts_remaining"], 9);

        let list_hints = Request::builder()
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/hints"
            ))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(list_hints).await.expect("list hints");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let hints: serde_json::Value = serde_json::from_slice(&body).expect("hints");
        assert_eq!(hints[0]["cost"], 10);
        assert_eq!(hints[0]["unlocked"], false);
        assert_eq!(hints[0]["content"], serde_json::Value::Null);

        let hint_path =
            format!("/api/v1/events/{event_id}/challenges/{published_challenge_id}/hints/1/unlock");
        let unlock_hint = Request::builder()
            .method("POST")
            .uri(&hint_path)
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(unlock_hint).await.expect("unlock hint");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let unlocked: serde_json::Value = serde_json::from_slice(&body).expect("unlocked hint");
        assert_eq!(unlocked["hint"]["content"], "Look closely.");
        assert_eq!(unlocked["charged"], 10);
        assert_eq!(unlocked["replayed"], false);

        let replay_hint = Request::builder()
            .method("POST")
            .uri(&hint_path)
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(replay_hint)
            .await
            .expect("replay hint unlock");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let replayed_hint: serde_json::Value =
            serde_json::from_slice(&body).expect("replayed hint");
        assert_eq!(replayed_hint["charged"], 0);
        assert_eq!(replayed_hint["replayed"], true);

        let solve_idempotency_key = Uuid::now_v7();
        let correct_body = serde_json::json!({
            "idempotency_key": solve_idempotency_key,
            "answer": "kit{never-persist-plaintext}"
        })
        .to_string();
        let correct = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/submissions"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(correct_body.clone()))
            .expect("request");
        let response = app
            .clone()
            .oneshot(correct)
            .await
            .expect("correct submission");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let solved: serde_json::Value = serde_json::from_slice(&body).expect("solve receipt");
        assert_eq!(solved["outcome"], "correct");
        assert_eq!(solved["awarded_points"], 550);
        assert_eq!(solved["first_blood"], true);
        assert_eq!(solved["replayed"], false);

        let retry = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/submissions"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(correct_body))
            .expect("request");
        let response = app.clone().oneshot(retry).await.expect("idempotent retry");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let replayed: serde_json::Value = serde_json::from_slice(&body).expect("replayed receipt");
        assert_eq!(replayed["id"], solved["id"]);
        assert_eq!(replayed["replayed"], true);

        let duplicate = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/submissions"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "idempotency_key": Uuid::now_v7(),
                    "answer": "kit{never-persist-plaintext}"
                })
                .to_string(),
            ))
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(duplicate)
                .await
                .expect("duplicate solve")
                .status(),
            StatusCode::CONFLICT
        );

        let survey_path =
            format!("/api/v1/events/{event_id}/challenges/{published_challenge_id}/survey");
        let invalid_survey = Request::builder()
            .method("POST")
            .uri(&survey_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(r#"{"answers":{"difficulty":6}}"#))
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(invalid_survey)
                .await
                .expect("invalid survey")
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let survey = Request::builder()
            .method("POST")
            .uri(&survey_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(r#"{"answers":{"difficulty":4}}"#))
            .expect("request");
        let response = app.clone().oneshot(survey).await.expect("submit survey");
        assert_eq!(response.status(), StatusCode::OK);

        let writeup_path =
            format!("/api/v1/events/{event_id}/challenges/{published_challenge_id}/writeup");
        let save_draft = Request::builder()
            .method("PUT")
            .uri(&writeup_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "body": "A careful draft about tracing the disappearing endpoint.",
                    "submit": false
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(save_draft)
            .await
            .expect("save writeup draft");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let draft: serde_json::Value = serde_json::from_slice(&body).expect("writeup draft");
        assert_eq!(draft["state"], "draft");

        let submit_writeup = Request::builder()
            .method("PUT")
            .uri(&writeup_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "body": "A careful draft about tracing the disappearing endpoint.",
                    "submit": true
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(submit_writeup)
            .await
            .expect("submit writeup");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let submitted: serde_json::Value =
            serde_json::from_slice(&body).expect("submitted writeup");
        assert_eq!(submitted["state"], "submitted");
        let writeup_id = submitted["id"].as_str().expect("writeup id");

        let review_queue = Request::builder()
            .uri(format!(
                "/api/v1/events/{event_id}/writeups?state=submitted"
            ))
            .header(header::COOKIE, &admin_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(review_queue)
            .await
            .expect("writeup queue");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let queue: serde_json::Value = serde_json::from_slice(&body).expect("writeup queue");
        assert_eq!(queue.as_array().expect("queue").len(), 1);
        assert_eq!(queue[0]["competitor_name"], "Player");

        let review_path = format!("/api/v1/events/{event_id}/writeups/{writeup_id}");
        let request_changes = Request::builder()
            .method("PATCH")
            .uri(&review_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(
                r#"{"state":"changes_requested","feedback":"Explain the final request path."}"#,
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(request_changes)
            .await
            .expect("request writeup changes");
        assert_eq!(response.status(), StatusCode::OK);

        let player_writeup = Request::builder()
            .uri(&writeup_path)
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(player_writeup)
            .await
            .expect("player writeup");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let changes: serde_json::Value = serde_json::from_slice(&body).expect("writeup changes");
        assert_eq!(changes["state"], "changes_requested");
        assert_eq!(changes["feedback"], "Explain the final request path.");

        let resubmit = Request::builder()
            .method("PUT")
            .uri(&writeup_path)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "body": "The final request path appears after tracing and normalizing the endpoint.",
                    "submit": true
                })
                .to_string(),
            ))
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(resubmit)
                .await
                .expect("resubmit writeup")
                .status(),
            StatusCode::OK
        );

        for state in ["approved", "published"] {
            let review = Request::builder()
                .method("PATCH")
                .uri(&review_path)
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &admin_cookies)
                .header("x-csrf-token", admin_csrf)
                .body(Body::from(
                    serde_json::json!({ "state": state, "feedback": null }).to_string(),
                ))
                .expect("request");
            let response = app.clone().oneshot(review).await.expect("review writeup");
            assert_eq!(response.status(), StatusCode::OK);
        }

        let survey_summary = Request::builder()
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{published_challenge_id}/survey-summary"
            ))
            .header(header::COOKIE, &admin_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(survey_summary)
            .await
            .expect("survey summary");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let summary: serde_json::Value = serde_json::from_slice(&body).expect("survey summary");
        assert_eq!(summary["response_count"], 1);
        assert_eq!(summary["questions"][0]["average"], 4.0);

        let create_manual = Request::builder()
            .method("POST")
            .uri(format!("/api/v1/events/{event_id}/challenges"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(
                serde_json::json!({
                    "name": "Explain the exploit",
                    "category": "Review",
                    "description": "Submit a concise proof for organizer review.",
                    "kind": {"type": "manual_verification"},
                    "state": "published",
                    "scoring": {"kind": "static", "points": 300},
                    "visibility": {
                        "visible_from": null,
                        "visible_until": null,
                        "division_ids": [],
                        "prerequisites": []
                    },
                    "tags": ["manual"],
                    "max_attempts": null,
                    "writeups_enabled": false,
                    "position": 1,
                    "answers": [{"kind": "manual"}],
                    "hints": [],
                    "survey": []
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(create_manual)
            .await
            .expect("create manual challenge");
        assert_eq!(response.status(), StatusCode::CREATED);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let manual_challenge: serde_json::Value =
            serde_json::from_slice(&body).expect("manual challenge");
        let manual_challenge_id = manual_challenge["id"]
            .as_str()
            .expect("manual challenge id");
        let manual_answer = "The evidence follows a bounded reproduction path.";
        let manual_submission = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/v1/events/{event_id}/challenges/{manual_challenge_id}/submissions"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "idempotency_key": Uuid::now_v7(),
                    "answer": manual_answer
                })
                .to_string(),
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(manual_submission)
            .await
            .expect("manual submission");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let pending: serde_json::Value = serde_json::from_slice(&body).expect("pending receipt");
        assert_eq!(pending["outcome"], "pending");
        let manual_submission_id = pending["id"].as_str().expect("manual submission id");

        let forbidden_queue = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/manual-reviews"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(forbidden_queue)
                .await
                .expect("forbidden manual queue")
                .status(),
            StatusCode::FORBIDDEN
        );

        let manual_queue = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/manual-reviews"))
            .header(header::COOKIE, &admin_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(manual_queue)
            .await
            .expect("manual review queue");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let manual_queue: serde_json::Value = serde_json::from_slice(&body).expect("manual queue");
        assert_eq!(manual_queue.as_array().expect("queue").len(), 1);
        assert_eq!(manual_queue[0]["answer"], manual_answer);

        let accept_manual = Request::builder()
            .method("PATCH")
            .uri(format!(
                "/api/v1/events/{event_id}/manual-reviews/{manual_submission_id}"
            ))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(
                r#"{"accepted":true,"note":"Reproduction verified."}"#,
            ))
            .expect("request");
        let response = app
            .clone()
            .oneshot(accept_manual)
            .await
            .expect("accept manual submission");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let accepted: serde_json::Value =
            serde_json::from_slice(&body).expect("accepted manual submission");
        assert_eq!(accepted["outcome"], "correct");
        assert_eq!(accepted["awarded_points"], 350);
        assert_eq!(accepted["first_blood"], true);
        let ciphertext = sqlx::query_scalar!(
            "SELECT answer_ciphertext FROM submissions WHERE id = $1",
            Uuid::parse_str(manual_submission_id).expect("submission UUID"),
        )
        .fetch_one(&pool)
        .await
        .expect("manual ciphertext")
        .expect("encrypted evidence");
        assert_ne!(ciphertext, manual_answer.as_bytes());

        let scoreboard = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/scoreboard"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app.clone().oneshot(scoreboard).await.expect("scoreboard");
        assert_eq!(response.status(), StatusCode::OK);
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let board: serde_json::Value = serde_json::from_slice(&body).expect("scoreboard");
        assert_eq!(board["rows"][0]["name"], "Player");
        assert_eq!(board["rows"][0]["score"], 890);
        assert_eq!(board["rows"][0]["solves"], 2);

        let score_history = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/score-history"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(score_history)
            .await
            .expect("score history");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let history: serde_json::Value = serde_json::from_slice(&body).expect("score history");
        assert_eq!(history["series"].as_array().expect("series").len(), 1);
        assert_eq!(
            history["series"][0]["points"]
                .as_array()
                .expect("history points")
                .len(),
            5
        );
        assert_eq!(history["series"][0]["points"][4]["score"], 890);

        let hide_scoreboard = Request::builder()
            .method("PATCH")
            .uri(format!("/api/v1/events/{event_id}/scoreboard-controls"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(r#"{"frozen":false,"hidden":true}"#))
            .expect("request");
        assert_eq!(
            app.clone()
                .oneshot(hide_scoreboard)
                .await
                .expect("hide scoreboard")
                .status(),
            StatusCode::OK
        );
        let hidden_board = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/scoreboard"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(hidden_board)
            .await
            .expect("hidden board");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let hidden: serde_json::Value = serde_json::from_slice(&body).expect("hidden board");
        assert_eq!(hidden["hidden"], true);
        assert_eq!(hidden["rows"].as_array().expect("rows").len(), 0);
        let hidden_history = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/score-history"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(hidden_history)
            .await
            .expect("hidden score history");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let hidden_history: serde_json::Value =
            serde_json::from_slice(&body).expect("hidden score history");
        assert_eq!(hidden_history["hidden"], true);
        assert_eq!(
            hidden_history["series"].as_array().expect("series").len(),
            0
        );

        let freeze_scoreboard = Request::builder()
            .method("PATCH")
            .uri(format!("/api/v1/events/{event_id}/scoreboard-controls"))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, &admin_cookies)
            .header("x-csrf-token", admin_csrf)
            .body(Body::from(r#"{"frozen":true,"hidden":false}"#))
            .expect("request");
        let response = app
            .clone()
            .oneshot(freeze_scoreboard)
            .await
            .expect("freeze scoreboard");
        assert_eq!(response.status(), StatusCode::OK);
        sqlx::query!(
            r#"
            INSERT INTO score_entries (
                event_id,sequence,user_id,team_id,division_id,points,reason,
                occurred_at,hidden_by_freeze
            ) VALUES ($1,nextval('score_entry_sequence'),$2,NULL,NULL,100,$3,$4,true)
            "#,
            Uuid::parse_str(event_id).expect("event UUID"),
            Uuid::parse_str(player_id).expect("player UUID"),
            serde_json::json!({"adjustment":{"reason":"freeze regression"}}),
            Utc::now(),
        )
        .execute(&pool)
        .await
        .expect("frozen score entry");

        let frozen_public_board = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/scoreboard"))
            .header(header::COOKIE, &player_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(frozen_public_board)
            .await
            .expect("frozen public board");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let frozen_public: serde_json::Value =
            serde_json::from_slice(&body).expect("frozen public board");
        assert_eq!(frozen_public["rows"][0]["score"], 890);

        let frozen_admin_board = Request::builder()
            .uri(format!("/api/v1/events/{event_id}/scoreboard"))
            .header(header::COOKIE, &admin_cookies)
            .body(Body::empty())
            .expect("request");
        let response = app
            .clone()
            .oneshot(frozen_admin_board)
            .await
            .expect("frozen admin board");
        let body = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        let frozen_admin: serde_json::Value =
            serde_json::from_slice(&body).expect("frozen admin board");
        assert_eq!(frozen_admin["rows"][0]["score"], 990);

        let forbidden = Request::builder()
            .method("POST")
            .uri("/api/v1/events")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::COOKIE, player_cookies)
            .header("x-csrf-token", player_csrf)
            .body(Body::from(
                serde_json::json!({
                    "name": "Forbidden Event",
                    "slug": "forbidden-event",
                    "description": "This write must not reach the repository.",
                    "state": "draft",
                    "participation": "individual",
                    "modes": ["jeopardy"],
                    "starts_at": null,
                    "ends_at": null,
                    "team_size_limit": null
                })
                .to_string(),
            ))
            .expect("request");
        assert_eq!(
            app.oneshot(forbidden).await.expect("forbidden").status(),
            StatusCode::FORBIDDEN
        );

        let answer_json = sqlx::query_scalar!("SELECT rule::text FROM challenge_answers LIMIT 1")
            .fetch_one(&pool)
            .await
            .expect("answer rule query")
            .expect("answer rule");
        assert!(!answer_json.contains("never-persist-plaintext"));
        let submitted_digests =
            sqlx::query_scalar!("SELECT answer_digest FROM submissions ORDER BY submitted_at")
                .fetch_all(&pool)
                .await
                .expect("submission digests");
        assert_eq!(submitted_digests.len(), 3);
        assert!(submitted_digests.iter().flatten().all(|digest| {
            digest.as_slice() != b"kit{never-persist-plaintext}"
                && digest.as_slice() != b"kit{wrong-trail}"
        }));
        let audit_count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM audit_log")
            .fetch_one(&pool)
            .await
            .expect("audit count");
        let outbox_count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM event_outbox")
            .fetch_one(&pool)
            .await
            .expect("outbox count");
        assert_eq!(audit_count, 29);
        assert_eq!(outbox_count, 29);
    }

    fn response_cookies(headers: &axum::http::HeaderMap) -> String {
        headers
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .filter_map(|value| value.split(';').next())
            .collect::<Vec<_>>()
            .join("; ")
    }

    fn local_login(mfa_code: Option<String>) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/api/v1/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                serde_json::json!({
                    "organization": "foxfire",
                    "email": "owner@example.test",
                    "password": "correct horse foxfire battery",
                    "mfa_code": mfa_code
                })
                .to_string(),
            ))
            .expect("request")
    }
}
