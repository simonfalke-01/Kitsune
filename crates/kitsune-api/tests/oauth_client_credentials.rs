use std::sync::Arc;

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use axum_extra::extract::cookie::Key;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use http_body_util::BodyExt;
use kitsune_api::{AppState, AuthService, TokenService, router};
use kitsune_automation::{InProcessCache, InProcessEventBus};
use kitsune_db::{MIGRATOR, PostgresStore, auth::AuthRepository};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

#[sqlx::test(migrator = "MIGRATOR")]
async fn client_credentials_are_scoped_short_lived_and_revocable(pool: PgPool) {
    let app = router(test_state(pool.clone()));
    let response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/setup",
            serde_json::json!({
                "organization_name": "Automation Shrine",
                "organization_slug": "automation-shrine",
                "display_name": "Flow Keeper",
                "email": "flows@example.test",
                "password": "correct horse foxfire battery"
            }),
            None,
            None,
        ))
        .await
        .expect("setup response");
    assert_eq!(response.status(), StatusCode::CREATED);
    let cookies = response_cookies(response.headers());
    let setup: serde_json::Value = response_json(response).await;
    let csrf = setup["csrf_token"].as_str().expect("CSRF token");

    let response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/events",
            serde_json::json!({
                "name": "OAuth Scope Trials",
                "slug": "oauth-scope-trials",
                "description": "An event used to verify client boundaries.",
                "state": "draft",
                "participation": "individual",
                "modes": ["jeopardy"],
                "starts_at": null,
                "ends_at": null,
                "team_size_limit": null
            }),
            Some(&cookies),
            Some(csrf),
        ))
        .await
        .expect("event response");
    assert_eq!(response.status(), StatusCode::CREATED);
    let event: serde_json::Value = response_json(response).await;
    let event_id = event["id"].as_str().expect("event ID");

    let response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/oauth-clients",
            serde_json::json!({
                "name": "Challenge sync",
                "scopes": ["challenge_read"],
                "event_ids": [event_id]
            }),
            Some(&cookies),
            Some(csrf),
        ))
        .await
        .expect("client response");
    assert_eq!(response.status(), StatusCode::CREATED);
    let created: serde_json::Value = response_json(response).await;
    let internal_id = created["id"].as_str().expect("internal client ID");
    let client_id = created["client_id"].as_str().expect("client ID");
    let client_secret = created["client_secret"].as_str().expect("client secret");
    assert!(client_id.starts_with("kitc_"));
    assert!(client_secret.starts_with("kits_"));

    let stored_digest = sqlx::query_scalar!(
        "SELECT client_secret_digest FROM oauth_clients WHERE id = $1",
        Uuid::parse_str(internal_id).expect("client UUID"),
    )
    .fetch_one(&pool)
    .await
    .expect("stored client secret digest");
    assert_eq!(
        stored_digest,
        Sha256::digest(client_secret.as_bytes()).as_slice()
    );
    assert_ne!(stored_digest, client_secret.as_bytes());

    let missing_auth = token_request(None, "challenge_read");
    let response = app
        .clone()
        .oneshot(missing_auth)
        .await
        .expect("missing auth response");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    assert!(response.headers().contains_key(header::WWW_AUTHENTICATE));

    let credentials = basic_authorization(client_id, client_secret);
    let response = app
        .clone()
        .oneshot(token_request(Some(&credentials), "event_manage"))
        .await
        .expect("invalid scope response");
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let error: serde_json::Value = response_json(response).await;
    assert_eq!(error["error"], "invalid_scope");

    let response = app
        .clone()
        .oneshot(token_request(Some(&credentials), "challenge_read"))
        .await
        .expect("token response");
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
    let token: serde_json::Value = response_json(response).await;
    let access_token = token["access_token"].as_str().expect("access token");
    assert!(access_token.starts_with("v4.local."));
    assert_eq!(token["token_type"], "Bearer");
    assert_eq!(token["expires_in"], 900);
    assert_eq!(token["scope"], "challenge_read");

    let authorized = Request::builder()
        .uri(format!("/api/v1/events/{event_id}/challenges"))
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
        .body(Body::empty())
        .expect("authorized request");
    let response = app
        .clone()
        .oneshot(authorized)
        .await
        .expect("authorized response");
    assert_eq!(response.status(), StatusCode::OK);

    let outside_event = Request::builder()
        .uri("/api/v1/events")
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
        .body(Body::empty())
        .expect("organization request");
    let response = app
        .clone()
        .oneshot(outside_event)
        .await
        .expect("organization response");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let outside_scope = Request::builder()
        .uri(format!("/api/v1/events/{event_id}/scoreboard"))
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
        .body(Body::empty())
        .expect("scoreboard request");
    let response = app
        .clone()
        .oneshot(outside_scope)
        .await
        .expect("scoreboard response");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let credential_management = Request::builder()
        .uri("/api/v1/auth/oauth-clients")
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
        .body(Body::empty())
        .expect("credential-management request");
    let response = app
        .clone()
        .oneshot(credential_management)
        .await
        .expect("credential-management response");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let revoke = Request::builder()
        .method("DELETE")
        .uri(format!("/api/v1/auth/oauth-clients/{internal_id}"))
        .header(header::COOKIE, &cookies)
        .header("x-csrf-token", csrf)
        .body(Body::empty())
        .expect("revoke request");
    let response = app.clone().oneshot(revoke).await.expect("revoke response");
    assert_eq!(response.status(), StatusCode::NO_CONTENT);

    let revoked_access = Request::builder()
        .uri(format!("/api/v1/events/{event_id}/challenges"))
        .header(header::AUTHORIZATION, format!("Bearer {access_token}"))
        .body(Body::empty())
        .expect("revoked access request");
    let response = app
        .clone()
        .oneshot(revoked_access)
        .await
        .expect("revoked access response");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let response = app
        .oneshot(token_request(Some(&credentials), "challenge_read"))
        .await
        .expect("revoked exchange response");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let client_audit_count = sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!"
        FROM audit_log
        WHERE resource_type = 'oauth_client'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("client audit count");
    let client_event_count = sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!"
        FROM event_outbox
        WHERE kind = 'auth.oauth_client.changed'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("client outbox count");
    let authentication_event_count = sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!"
        FROM event_outbox
        WHERE kind = 'auth.succeeded'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("authentication outbox count");
    assert_eq!(client_audit_count, 3);
    assert_eq!(client_event_count, 2);
    assert_eq!(authentication_event_count, 1);
}

fn test_state(pool: PgPool) -> AppState {
    let store = PostgresStore::from_pool(pool.clone());
    AppState::new(
        store,
        AuthRepository::new(pool),
        AuthService::new().expect("auth"),
        TokenService::from_master_key(&[11_u8; 64]).expect("tokens"),
        Arc::new(InProcessCache::new(1_000).expect("cache")),
        Arc::new(InProcessEventBus::new(128).expect("bus")),
        Key::generate(),
        false,
    )
}

fn json_request(
    method: &str,
    uri: &str,
    body: serde_json::Value,
    cookies: Option<&str>,
    csrf: Option<&str>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(cookies) = cookies {
        builder = builder.header(header::COOKIE, cookies);
    }
    if let Some(csrf) = csrf {
        builder = builder.header("x-csrf-token", csrf);
    }
    builder
        .body(Body::from(body.to_string()))
        .expect("JSON request")
}

fn token_request(authorization: Option<&str>, scope: &str) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/oauth/token")
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
    if let Some(authorization) = authorization {
        builder = builder.header(header::AUTHORIZATION, authorization);
    }
    builder
        .body(Body::from(format!(
            "grant_type=client_credentials&scope={scope}"
        )))
        .expect("token request")
}

fn basic_authorization(client_id: &str, client_secret: &str) -> String {
    format!(
        "Basic {}",
        STANDARD.encode(format!("{client_id}:{client_secret}"))
    )
}

async fn response_json(response: axum::response::Response) -> serde_json::Value {
    let body = response
        .into_body()
        .collect()
        .await
        .expect("response body")
        .to_bytes();
    serde_json::from_slice(&body).expect("response JSON")
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
