use std::{collections::BTreeSet, sync::Arc};

use axum::{
    Form, Json, Router,
    body::Body,
    extract::State,
    http::{Request, StatusCode, header},
    routing::{get, post},
};
use axum_extra::extract::cookie::Key;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::Utc;
use http_body_util::BodyExt;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use kitsune_api::{AppState, AuthService, OidcService, TokenService, router};
use kitsune_automation::{InProcessCache, InProcessEventBus};
use kitsune_db::{MIGRATOR, PostgresStore, auth::AuthRepository};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::{net::TcpListener, sync::RwLock, task::JoinHandle};
use tower::ServiceExt;
use url::Url;
use uuid::Uuid;

const PRIVATE_KEY: &str = r"-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDX/Y4OxrJiFDpn
LrYnot1eDTurEtrfRfyFNTvLTbB7z3DeGOOpXVCgUg/nPx1XV9Rfrw7O32EUlHBt
OhNuULEHE8eJVeXdR6OyqEzju1bbnruexEOjjzJmEz9u142jjYc1iEk2/EdMjSn0
H+L2X6zYPeIrxMd/6KtvSBgBFIpst/5H0brRKBcIG3WLKaUmJmrrpQRckHgZ8ua5
nJU3W2okBjDxwBOh5Tzt735UwE3STaHyJFXo2pJ26JbsYZKHG1woWs2xYKlduKty
qgOIACe2gP1IEBKT4KFzyHlP1g5EOk3fWqmWTtP33YfCYzKVb+FIojOMXDAMfkxH
0FSpw1MxAgMBAAECggEAEnBU7LIA9hqGYEFxz34GqkoBUNNyCyMgZNOfxsIoUaMd
6ysllFNt19Uczz/Ps25a22hIbVfoiic58DkuNRN/Ni/cFiW9H+ATyEnrdnpYKehd
JmqlRsgP8Px63jpZa+yTIS2agnuUldZsDg+caPs1+EGGlpH2YT1trtK99qmlDGIC
GDNRnF9Gm/bAE1zZfWWSao6te09LV8+OZZn8+GY96b3AxuFdBCw6YMa1FCocXlz+
FZjfzQ2Jn5Cr+NsaiPVeWzj0fCtEXpDBKCfJsvJmNFi2gHrbqAjqBGEtzK8HkLMr
5HhF1uYBTxO6hOl4ujQuIaAPcbrourq43U0/pzRbWQKBgQD7Y4TPqXkYbP7x9SFd
nL9vl8aUYkqdXGdhUOkIyXJ8W3d5WRlweByUtcl28dxUvE0tXzpheiS2VOS/G3VD
aMtBdudYDT76piO/VyI7AEep0zuODYKpQk9XZ7MRfT4znDGh8miZvWMgdMe5Zrdt
g9f7muJrXzUUtyju0X/wd5RYiwKBgQDb88+35zxbO+4UBp/4SwPAxXXanBtFUkld
mj9a5xwgIoyD9CPHGCgB3/1ZO5OnlKF/rMlinjx2tCYNvTwsYISqFg5QV/w/QuMb
GpcgrdKJ6kaaiIO9yAh+DyidfhHnTDGbHy3OXI+XrdRWZCCTbaaroaRs5F1x3eWS
ifdJZf9+swKBgQC4kJRNsmtJ15xGIGbix9Z1I8WT46ZMai8sb67n2J7JVo4c9aGL
xWOWevDy9xeAzs8K5MOEFZ0mkKVw+cPaPfIcmiO3reHzPE86h8qF7uqucHtlC95G
TnzZ+zSpPn6Qfbii4cqSNU214odQQ22gZhAIlepuUnQyRVc0H3QDJIgxiQKBgDtW
OuNR7mZudHvSjbVeB1Up7/FZy8GXwVMPGahcUKoap+2xHzXGvoRC+QXpnJvI7QiU
hH+mUIl1cA6kzmbqYt+/s3zZP6ORV9MoCT03p2StXv6xdVjtbd0UGdDjAdF0LK28
a48QSWyR6Ial3GPpYN1Mbh8yPENLqXMu5RdX/OUhAoGACAWmFAVcH9aLcFaX7tcb
d8TO0rumOoZFJLpd+Tc0rDxwMbP3GC2c0frfRI+ZhOY3nj3NYXxiH/UZUZzh8bia
efswipOPiDpcxUUUHLUPXXKLco710CbEwl9qNLGpukWftRaQKRV20WB0HX1+mbwb
bwMcK5qJt4rMqbe2oYDsVSU=
-----END PRIVATE KEY-----";

const MODULUS: &str = "1_2ODsayYhQ6Zy62J6LdXg07qxLa30X8hTU7y02we89w3hjjqV1QoFIP5z8dV1fUX68Ozt9hFJRwbToTblCxBxPHiVXl3UejsqhM47tW2567nsRDo48yZhM_bteNo42HNYhJNvxHTI0p9B_i9l-s2D3iK8THf-irb0gYARSKbLf-R9G60SgXCBt1iymlJiZq66UEXJB4GfLmuZyVN1tqJAYw8cAToeU87e9-VMBN0k2h8iRV6NqSduiW7GGShxtcKFrNsWCpXbircqoDiAAntoD9SBASk-Chc8h5T9YORDpN31qplk7T992HwmMylW_hSKIzjFwwDH5MR9BUqcNTMQ";

#[derive(Clone, Default)]
struct IdpState {
    issuer: Arc<RwLock<String>>,
    expected: Arc<RwLock<Option<ExpectedAuthorization>>>,
    exchanges: Arc<RwLock<u32>>,
}

#[derive(Clone)]
struct ExpectedAuthorization {
    nonce: String,
    code_challenge: String,
}

#[derive(Serialize)]
struct IdTokenClaims {
    iss: String,
    sub: String,
    aud: String,
    exp: usize,
    iat: usize,
    nonce: String,
    email: String,
    email_verified: bool,
    name: String,
    at_hash: String,
}

#[sqlx::test(migrator = "MIGRATOR")]
async fn authorization_code_flow_is_verified_bound_and_replay_safe(pool: PgPool) {
    let (issuer, idp, idp_state) = start_identity_provider().await;
    let app = router(test_state(pool.clone(), &issuer));
    let setup_response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/setup",
            serde_json::json!({
                "organization_name": "Federated Shrine",
                "organization_slug": "federated-shrine",
                "display_name": "Identity Keeper",
                "email": "keeper@example.test",
                "password": "correct horse foxfire battery"
            }),
            None,
            None,
        ))
        .await
        .expect("setup response");
    assert_eq!(setup_response.status(), StatusCode::CREATED);
    let admin_cookies = response_cookies(setup_response.headers());
    let setup: serde_json::Value = response_json(setup_response).await;
    let csrf = setup["csrf_token"].as_str().expect("CSRF token");

    let provider_body = serde_json::json!({
        "key": "shrine-sso",
        "display_name": "Shrine SSO",
        "issuer_url": issuer,
        "client_id": "kitsune-browser-client",
        "client_secret": "test-client-secret-long-enough",
        "enabled": true,
        "auto_provision": true,
        "allow_email_link": false
    });
    let missing_csrf = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/oidc/providers",
            provider_body.clone(),
            Some(&admin_cookies),
            None,
        ))
        .await
        .expect("missing-CSRF provider response");
    assert_eq!(missing_csrf.status(), StatusCode::FORBIDDEN);

    let provider_response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/oidc/providers",
            provider_body,
            Some(&admin_cookies),
            Some(csrf),
        ))
        .await
        .expect("provider response");
    assert_eq!(provider_response.status(), StatusCode::CREATED);
    let provider: serde_json::Value = response_json(provider_response).await;
    assert_eq!(
        provider["redirect_uri"],
        "http://kitsune.test/api/v1/auth/oidc/federated-shrine/shrine-sso/callback"
    );
    assert!(provider.get("client_secret").is_none());

    let encrypted_secret = sqlx::query_scalar!(
        "SELECT encrypted_client_secret FROM oidc_providers WHERE id = $1",
        Uuid::parse_str(provider["id"].as_str().expect("provider ID")).expect("provider UUID"),
    )
    .fetch_one(&pool)
    .await
    .expect("encrypted client secret");
    assert_ne!(encrypted_secret, b"test-client-secret-long-enough");

    let public_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/oidc/providers/public?organization=federated-shrine")
                .body(Body::empty())
                .expect("public providers request"),
        )
        .await
        .expect("public providers response");
    assert_eq!(public_response.status(), StatusCode::OK);
    let public: serde_json::Value = response_json(public_response).await;
    assert_eq!(public[0]["display_name"], "Shrine SSO");
    assert!(public[0].get("issuer_url").is_none());

    let start_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/oidc/federated-shrine/shrine-sso/start?return_to=%2Fchallenges")
                .body(Body::empty())
                .expect("start request"),
        )
        .await
        .expect("start response");
    assert_eq!(start_response.status(), StatusCode::SEE_OTHER);
    let flow_cookie = response_cookies(start_response.headers());
    assert!(flow_cookie.starts_with("kit_oidc_flow="));
    let authorization_url = Url::parse(
        start_response.headers()[header::LOCATION]
            .to_str()
            .expect("authorization location"),
    )
    .expect("authorization URL");
    let parameters = authorization_url
        .query_pairs()
        .into_owned()
        .collect::<std::collections::HashMap<_, _>>();
    let state = parameters.get("state").expect("state").clone();
    let nonce = parameters.get("nonce").expect("nonce").clone();
    let challenge = parameters
        .get("code_challenge")
        .expect("PKCE challenge")
        .clone();
    assert_eq!(
        parameters.get("code_challenge_method").map(String::as_str),
        Some("S256")
    );
    *idp_state.expected.write().await = Some(ExpectedAuthorization {
        nonce,
        code_challenge: challenge,
    });

    let callback_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/auth/oidc/federated-shrine/shrine-sso/callback?code=valid-code&state={state}"
                ))
                .header(header::COOKIE, &flow_cookie)
                .body(Body::empty())
                .expect("callback request"),
        )
        .await
        .expect("callback response");
    assert_eq!(callback_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(callback_response.headers()[header::LOCATION], "/challenges");
    let player_cookies = response_cookies(callback_response.headers());
    assert!(player_cookies.contains("kit_session="));
    assert!(player_cookies.contains("kit_csrf="));

    let session_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/session")
                .header(header::COOKIE, &player_cookies)
                .body(Body::empty())
                .expect("session request"),
        )
        .await
        .expect("session response");
    assert_eq!(session_response.status(), StatusCode::OK);
    let session: serde_json::Value = response_json(session_response).await;
    assert_eq!(session["user"]["email"], "player@example.test");
    assert_eq!(session["user"]["display_name"], "Fox Player");
    assert_eq!(session["user"]["email_verified"], true);

    let replay_response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/auth/oidc/federated-shrine/shrine-sso/callback?code=valid-code&state={state}"
                ))
                .header(header::COOKIE, &flow_cookie)
                .body(Body::empty())
                .expect("replay request"),
        )
        .await
        .expect("replay response");
    assert_eq!(replay_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        replay_response.headers()[header::LOCATION],
        "/login?oidc_error=authentication_failed"
    );
    assert_eq!(*idp_state.exchanges.read().await, 1);

    let invalid_start = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/v1/auth/oidc/federated-shrine/shrine-sso/start")
                .body(Body::empty())
                .expect("invalid-nonce start request"),
        )
        .await
        .expect("invalid-nonce start response");
    let invalid_cookie = response_cookies(invalid_start.headers());
    let invalid_url = Url::parse(
        invalid_start.headers()[header::LOCATION]
            .to_str()
            .expect("invalid-nonce authorization location"),
    )
    .expect("invalid-nonce authorization URL");
    let invalid_parameters = invalid_url
        .query_pairs()
        .into_owned()
        .collect::<std::collections::HashMap<_, _>>();
    *idp_state.expected.write().await = Some(ExpectedAuthorization {
        nonce: "substituted-nonce".into(),
        code_challenge: invalid_parameters
            .get("code_challenge")
            .expect("invalid-nonce PKCE challenge")
            .clone(),
    });
    let invalid_state = invalid_parameters
        .get("state")
        .expect("invalid-nonce state");
    let invalid_callback = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/v1/auth/oidc/federated-shrine/shrine-sso/callback?code=valid-code&state={invalid_state}"
                ))
                .header(header::COOKIE, invalid_cookie)
                .body(Body::empty())
                .expect("invalid-nonce callback request"),
        )
        .await
        .expect("invalid-nonce callback response");
    assert_eq!(invalid_callback.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        invalid_callback.headers()[header::LOCATION],
        "/login?oidc_error=authentication_failed"
    );
    assert_eq!(*idp_state.exchanges.read().await, 2);

    let authentication_events = sqlx::query_scalar!(
        r#"
        SELECT count(*) AS "count!" FROM event_outbox
        WHERE kind = 'auth.succeeded'
          AND envelope -> 'event' ->> 'type' = 'authentication_succeeded'
        "#,
    )
    .fetch_one(&pool)
    .await
    .expect("authentication events");
    assert_eq!(authentication_events, 1);

    let provider_id = provider["id"].as_str().expect("provider ID");
    let update_response = app
        .oneshot(json_request(
            "PUT",
            &format!("/api/v1/auth/oidc/providers/{provider_id}"),
            serde_json::json!({
                "display_name": "Shrine Identity",
                "issuer_url": issuer,
                "client_id": "kitsune-browser-client",
                "client_secret": null,
                "enabled": false,
                "auto_provision": false,
                "allow_email_link": false
            }),
            Some(&admin_cookies),
            Some(csrf),
        ))
        .await
        .expect("provider update response");
    assert_eq!(update_response.status(), StatusCode::OK);
    let updated: serde_json::Value = response_json(update_response).await;
    assert_eq!(updated["display_name"], "Shrine Identity");
    assert_eq!(updated["enabled"], false);
    let retained_secret = sqlx::query_scalar!(
        "SELECT encrypted_client_secret FROM oidc_providers WHERE id = $1",
        Uuid::parse_str(provider_id).expect("provider UUID"),
    )
    .fetch_one(&pool)
    .await
    .expect("retained client secret");
    assert_eq!(retained_secret, encrypted_secret);
    idp.abort();
}

fn test_state(pool: PgPool, issuer: &str) -> AppState {
    let store = PostgresStore::from_pool(pool.clone());
    AppState::new(
        store,
        AuthRepository::new(pool),
        AuthService::from_master_key(&[17_u8; 64]).expect("auth"),
        TokenService::from_master_key(&[19_u8; 64]).expect("tokens"),
        Arc::new(InProcessCache::new(1_000).expect("cache")),
        Arc::new(InProcessEventBus::new(128).expect("bus")),
        Key::generate(),
        false,
    )
    .with_oidc(
        OidcService::new(BTreeSet::from([issuer.to_owned()])).expect("OIDC service"),
        true,
        Url::parse("http://kitsune.test").expect("public origin"),
    )
}

async fn start_identity_provider() -> (String, JoinHandle<()>, IdpState) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind identity provider");
    let issuer = format!(
        "http://{}",
        listener.local_addr().expect("identity address")
    );
    let state = IdpState::default();
    *state.issuer.write().await = issuer.clone();
    let app = Router::new()
        .route("/.well-known/openid-configuration", get(discovery))
        .route("/jwks", get(jwks))
        .route("/token", post(token))
        .with_state(state.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.expect("identity provider");
    });
    (issuer, server, state)
}

async fn discovery(State(state): State<IdpState>) -> Json<serde_json::Value> {
    let issuer = state.issuer.read().await.clone();
    Json(serde_json::json!({
        "issuer": issuer,
        "authorization_endpoint": format!("{issuer}/authorize"),
        "token_endpoint": format!("{issuer}/token"),
        "jwks_uri": format!("{issuer}/jwks"),
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["RS256"],
        "scopes_supported": ["openid", "email", "profile"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic"]
    }))
}

async fn jwks() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "keys": [{
            "kty": "RSA",
            "kid": "test-key",
            "use": "sig",
            "alg": "RS256",
            "n": MODULUS,
            "e": "AQAB"
        }]
    }))
}

async fn token(
    State(state): State<IdpState>,
    Form(form): Form<std::collections::HashMap<String, String>>,
) -> Json<serde_json::Value> {
    assert_eq!(form.get("code").map(String::as_str), Some("valid-code"));
    let expected = state
        .expected
        .read()
        .await
        .clone()
        .expect("expected authorization");
    let verifier = form.get("code_verifier").expect("PKCE verifier");
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    assert_eq!(challenge, expected.code_challenge);
    *state.exchanges.write().await += 1;

    let access_token = "test-access-token";
    let access_digest = Sha256::digest(access_token.as_bytes());
    let now = usize::try_from(Utc::now().timestamp()).expect("positive test timestamp");
    let claims = IdTokenClaims {
        iss: state.issuer.read().await.clone(),
        sub: "provider-subject-123".into(),
        aud: "kitsune-browser-client".into(),
        exp: now + 300,
        iat: now,
        nonce: expected.nonce,
        email: "player@example.test".into(),
        email_verified: true,
        name: "Fox Player".into(),
        at_hash: URL_SAFE_NO_PAD.encode(&access_digest[..16]),
    };
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("test-key".into());
    let id_token = encode(
        &header,
        &claims,
        &EncodingKey::from_rsa_pem(PRIVATE_KEY.as_bytes()).expect("test RSA key"),
    )
    .expect("ID token");
    Json(serde_json::json!({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": 300,
        "id_token": id_token
    }))
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
