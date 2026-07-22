//! Secured Kitsune HTTP, OpenAPI, WebSocket, and SSE transports.

mod auth;
mod error;
mod realtime;

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

pub use auth::{AuthService, SessionIdentity};
pub use error::{ApiError, ApiResult, ErrorBody};

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
    /// Rate-limit and ephemeral state adapter.
    pub cache: Arc<dyn Cache>,
    /// Typed realtime backbone.
    pub event_bus: Arc<dyn EventBus>,
    /// Cookie AEAD key.
    pub cookie_key: Key,
    /// Emit Secure cookie attribute.
    pub secure_cookies: bool,
    started_at: Instant,
}

impl AppState {
    /// Composes application state from explicit adapters.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        db: PostgresStore,
        auth_repository: AuthRepository,
        auth: AuthService,
        cache: Arc<dyn Cache>,
        event_bus: Arc<dyn EventBus>,
        cookie_key: Key,
        secure_cookies: bool,
    ) -> Self {
        Self {
            db,
            auth_repository,
            auth,
            cache,
            event_bus,
            cookie_key,
            secure_cookies,
            started_at: Instant::now(),
        }
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
        auth::revoke_session
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
        auth::SessionResponse,
        auth::UserResponse
    )),
    tags(
        (name = "system", description = "Health and diagnostics"),
        (name = "auth", description = "Setup, sessions, and authentication")
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
            HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
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
    use http_body_util::BodyExt;
    use kitsune_automation::{InProcessCache, InProcessEventBus};
    use kitsune_db::{MIGRATOR, PostgresStore, auth::AuthRepository};
    use sqlx::PgPool;
    use totp_rs::{Algorithm as TotpAlgorithm, Secret, TOTP};
    use tower::ServiceExt;

    use super::*;

    fn test_state(pool: PgPool) -> AppState {
        let store = PostgresStore::from_pool(pool.clone());
        AppState::new(
            store,
            AuthRepository::new(pool),
            AuthService::new().expect("auth"),
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
