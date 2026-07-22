use std::{
    collections::BTreeSet,
    sync::{Arc, OnceLock},
    time::SystemTime,
};

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use axum_extra::extract::cookie::Key;
use http_body_util::BodyExt;
use kitsune_api::{
    AppState, AuthService, OidcService, PasskeyService, SamlCredentials, SamlService, TokenService,
    router,
};
use kitsune_automation::{InProcessCache, InProcessEventBus};
use kitsune_db::{MIGRATOR, PostgresStore, auth::AuthRepository};
use saml_rs::{
    AuthnRequest, BrowserInput, CertificatePem, Credentials, EntityId, IdpConfig,
    IdpValidationPolicy, MetadataTrustPolicy, NameId, NameIdFormat, PrivateKeyPem, ReplayPolicy,
    RespondSso, Saml, SamlValidationContext, SpDescriptor, SsoEndpoint, Subject,
};
use sqlx::PgPool;
use tower::ServiceExt;
use url::Url;

const ORGANIZATION: &str = "federated-shrine";
const PROVIDER: &str = "saml-sso";
const IDP_ENTITY_ID: &str = "https://identity.example.test/metadata";
const IDP_SSO_URL: &str = "https://identity.example.test/sso";
const PUBLIC_ORIGIN: &str = "http://kitsune.test";

#[sqlx::test(migrator = "MIGRATOR")]
async fn signed_saml_flow_is_correlated_provisioned_and_replay_safe(pool: PgPool) {
    let (identity_provider, metadata) = identity_provider();
    let app = router(test_state(pool.clone()));
    let setup_response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/setup",
            serde_json::json!({
                "organization_name": "Federated Shrine",
                "organization_slug": ORGANIZATION,
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
    let setup = response_json(setup_response).await;
    let csrf = setup["csrf_token"].as_str().expect("CSRF token").to_owned();

    let provider_body = serde_json::json!({
        "key": PROVIDER,
        "display_name": "Shrine SAML",
        "metadata_xml": metadata,
        "metadata_url": null,
        "metadata_signing_certificate": null,
        "email_attribute": null,
        "display_name_attribute": null,
        "enabled": true,
        "auto_provision": true,
        "allow_email_link": false
    });
    let missing_csrf = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/saml/providers",
            provider_body.clone(),
            Some(&admin_cookies),
            None,
        ))
        .await
        .expect("missing-CSRF response");
    assert_eq!(missing_csrf.status(), StatusCode::FORBIDDEN);

    let provider_response = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/v1/auth/saml/providers",
            provider_body.clone(),
            Some(&admin_cookies),
            Some(&csrf),
        ))
        .await
        .expect("provider response");
    assert_eq!(provider_response.status(), StatusCode::CREATED);
    let provider = response_json(provider_response).await;
    assert_eq!(provider["idp_entity_id"], IDP_ENTITY_ID);
    assert_eq!(
        provider["sp_entity_id"],
        format!("{PUBLIC_ORIGIN}/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/metadata")
    );
    assert_eq!(
        provider["acs_uri"],
        format!("{PUBLIC_ORIGIN}/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/acs")
    );
    assert_eq!(provider["metadata_verified"], false);
    assert!(provider.get("metadata_xml").is_none());
    assert!(provider.get("metadata_signing_certificate").is_none());

    let public_response = app
        .clone()
        .oneshot(get_request(&format!(
            "/api/v1/auth/saml/providers/public?organization={ORGANIZATION}"
        )))
        .await
        .expect("public provider response");
    assert_eq!(public_response.status(), StatusCode::OK);
    let public = response_json(public_response).await;
    assert_eq!(public[0]["display_name"], "Shrine SAML");
    assert!(public[0].get("idp_entity_id").is_none());

    let sp_metadata_response = app
        .clone()
        .oneshot(get_request(&format!(
            "/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/metadata"
        )))
        .await
        .expect("SP metadata response");
    assert_eq!(sp_metadata_response.status(), StatusCode::OK);
    assert_eq!(
        sp_metadata_response.headers()[header::CONTENT_TYPE],
        "application/samlmetadata+xml"
    );
    let sp_metadata = response_text(sp_metadata_response).await;
    let sp_descriptor = SpDescriptor::from_metadata_xml_for(
        EntityId::try_new(format!(
            "{PUBLIC_ORIGIN}/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/metadata"
        ))
        .expect("SP entity ID"),
        &sp_metadata,
        MetadataTrustPolicy::UnsignedForCompatibility,
    )
    .expect("SP descriptor");

    let started = start_login(&app).await;
    let response_fields = identity_response(&identity_provider, &sp_descriptor, &started.location);
    let assertion_response = app
        .clone()
        .oneshot(form_request(
            &format!("/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/acs"),
            &response_fields,
            &started.cookie,
        ))
        .await
        .expect("assertion response");
    assert_eq!(assertion_response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        assertion_response.headers()[header::LOCATION],
        "/challenges"
    );
    let player_cookies = response_cookies(assertion_response.headers());
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
    let session = response_json(session_response).await;
    assert_eq!(session["user"]["email"], "player@example.test");
    assert_eq!(session["user"]["display_name"], "player");
    assert_eq!(session["user"]["email_verified"], true);

    let replay_response = app
        .clone()
        .oneshot(form_request(
            &format!("/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/acs"),
            &response_fields,
            &started.cookie,
        ))
        .await
        .expect("replay response");
    assert_authentication_failure(replay_response);

    let tampered = start_login(&app).await;
    let mut tampered_fields =
        identity_response(&identity_provider, &sp_descriptor, &tampered.location);
    let response = tampered_fields
        .iter_mut()
        .find(|(name, _)| name == "SAMLResponse")
        .expect("SAMLResponse field");
    let replacement = if response.1.ends_with('A') { 'B' } else { 'A' };
    response.1.pop();
    response.1.push(replacement);
    let tampered_response = app
        .clone()
        .oneshot(form_request(
            &format!("/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/acs"),
            &tampered_fields,
            &tampered.cookie,
        ))
        .await
        .expect("tampered response");
    assert_authentication_failure(tampered_response);

    let wrong_browser = start_login(&app).await;
    let wrong_browser_fields =
        identity_response(&identity_provider, &sp_descriptor, &wrong_browser.location);
    let wrong_cookie_response = app
        .clone()
        .oneshot(form_request(
            &format!("/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/acs"),
            &wrong_browser_fields,
            "kit_saml_flow=wrong-browser-binding",
        ))
        .await
        .expect("wrong-cookie response");
    assert_authentication_failure(wrong_cookie_response);

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
        .clone()
        .oneshot(json_request(
            "PUT",
            &format!("/api/v1/auth/saml/providers/{provider_id}"),
            serde_json::json!({
                "display_name": "Shrine Identity",
                "metadata_xml": null,
                "metadata_url": null,
                "metadata_signing_certificate": null,
                "email_attribute": null,
                "display_name_attribute": null,
                "enabled": false,
                "auto_provision": false,
                "allow_email_link": false
            }),
            Some(&admin_cookies),
            Some(&csrf),
        ))
        .await
        .expect("provider update response");
    assert_eq!(update_response.status(), StatusCode::OK);
    let updated = response_json(update_response).await;
    assert_eq!(updated["display_name"], "Shrine Identity");
    assert_eq!(updated["enabled"], false);

    let disabled_public = app
        .clone()
        .oneshot(get_request(&format!(
            "/api/v1/auth/saml/providers/public?organization={ORGANIZATION}"
        )))
        .await
        .expect("disabled public response");
    assert_eq!(response_json(disabled_public).await, serde_json::json!([]));
    let disabled_start = app
        .oneshot(get_request(&format!(
            "/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/start"
        )))
        .await
        .expect("disabled start response");
    assert_eq!(disabled_start.status(), StatusCode::NOT_FOUND);
}

struct StartedLogin {
    cookie: String,
    location: Url,
}

async fn start_login(app: &axum::Router) -> StartedLogin {
    let response = app
        .clone()
        .oneshot(get_request(&format!(
            "/api/v1/auth/saml/{ORGANIZATION}/{PROVIDER}/start?return_to=%2Fchallenges"
        )))
        .await
        .expect("start response");
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let cookie = response_cookies(response.headers());
    assert!(cookie.starts_with("kit_saml_flow="));
    let location = Url::parse(
        response.headers()[header::LOCATION]
            .to_str()
            .expect("SAML redirect location"),
    )
    .expect("SAML redirect URL");
    StartedLogin { cookie, location }
}

fn identity_response(
    identity_provider: &Saml<saml_rs::Idp>,
    sp_descriptor: &SpDescriptor,
    request_url: &Url,
) -> Vec<(String, String)> {
    let received = identity_provider
        .receive_sso(
            sp_descriptor,
            BrowserInput::<AuthnRequest>::redirect(
                request_url.query().expect("SAML request query"),
            ),
            validation(),
        )
        .expect("verified AuthnRequest");
    let subject = Subject::new(
        NameId::new("player@example.test", Some(NameIdFormat::EmailAddress)),
        Vec::new(),
    );
    let response = identity_provider
        .respond_sso(sp_descriptor, &received, subject, RespondSso::post())
        .expect("signed SAML response");
    response
        .post_form()
        .expect("response form")
        .fields()
        .iter()
        .map(|field| (field.name().to_owned(), field.value().to_owned()))
        .collect()
}

fn identity_provider() -> (Saml<saml_rs::Idp>, String) {
    let credentials = test_credentials();
    let config = IdpConfig::builder(EntityId::try_new(IDP_ENTITY_ID).expect("IdP entity ID"))
        .sso_endpoint(SsoEndpoint::redirect(IDP_SSO_URL).expect("SSO endpoint"))
        .credentials(Credentials {
            signing_key: Some(PrivateKeyPem::new(credentials.private_key_pem())),
            signing_certificate: Some(CertificatePem::new(credentials.certificate_pem())),
            ..Credentials::default()
        })
        .validation(IdpValidationPolicy::strict())
        .build()
        .expect("IdP configuration");
    let provider = Saml::idp(config).expect("IdP");
    let metadata = provider.metadata_xml().to_owned();
    (provider, metadata)
}

fn test_state(pool: PgPool) -> AppState {
    let store = PostgresStore::from_pool(pool.clone());
    let public_origin = Url::parse(PUBLIC_ORIGIN).expect("public origin");
    let service = SamlService::new(test_credentials(), BTreeSet::new()).expect("SAML service");
    AppState::new(
        store,
        AuthRepository::new(pool),
        AuthService::from_master_key(&[27_u8; 64]).expect("auth"),
        TokenService::from_master_key(&[29_u8; 64]).expect("tokens"),
        Arc::new(InProcessCache::new(1_000).expect("cache")),
        Arc::new(InProcessEventBus::new(128).expect("bus")),
        Key::generate(),
        false,
    )
    .with_oidc(
        OidcService::new(BTreeSet::new()).expect("OIDC service"),
        true,
        public_origin.clone(),
    )
    .with_passkeys(PasskeyService::new(&public_origin).expect("passkeys"))
    .with_saml(service)
}

fn test_credentials() -> SamlCredentials {
    static CREDENTIALS: OnceLock<SamlCredentials> = OnceLock::new();
    CREDENTIALS
        .get_or_init(|| SamlCredentials::generate().expect("test SAML credentials"))
        .clone()
}

fn validation() -> SamlValidationContext<'static> {
    SamlValidationContext::new(SystemTime::now(), ReplayPolicy::DisabledForCompatibility)
}

fn get_request(uri: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .body(Body::empty())
        .expect("GET request")
}

fn json_request(
    method: &str,
    uri: &str,
    body: serde_json::Value,
    cookie: Option<&str>,
    csrf: Option<&str>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    if let Some(csrf) = csrf {
        builder = builder.header("x-csrf-token", csrf);
    }
    builder
        .body(Body::from(body.to_string()))
        .expect("JSON request")
}

fn form_request(uri: &str, fields: &[(String, String)], cookie: &str) -> Request<Body> {
    let body = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(fields.iter().map(|(name, value)| (name, value)))
        .finish();
    Request::builder()
        .method("POST")
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(header::COOKIE, cookie)
        .body(Body::from(body))
        .expect("form request")
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

async fn response_json(response: axum::response::Response) -> serde_json::Value {
    serde_json::from_slice(
        &response
            .into_body()
            .collect()
            .await
            .expect("response body")
            .to_bytes(),
    )
    .expect("JSON response")
}

async fn response_text(response: axum::response::Response) -> String {
    String::from_utf8(
        response
            .into_body()
            .collect()
            .await
            .expect("response body")
            .to_bytes()
            .to_vec(),
    )
    .expect("UTF-8 response")
}

fn assert_authentication_failure(response: axum::response::Response) {
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        response.headers()[header::LOCATION],
        "/login?saml_error=authentication_failed"
    );
}
