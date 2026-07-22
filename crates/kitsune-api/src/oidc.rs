//! OpenID Connect authorization-code protocol and secured provider routes.

use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter},
    future::Future,
    pin::Pin,
    sync::Arc,
    time::Duration as StdDuration,
};

use kitsune_automation::EgressPolicy;
use kitsune_core::{DomainError, DomainResult};
use kitsune_db::oidc::ActiveOidcProvider;
use openidconnect::{
    AccessTokenHash, AsyncHttpClient, AuthorizationCode, ClientId, ClientSecret, CsrfToken,
    HttpRequest, HttpResponse, IssuerUrl, Nonce, OAuth2TokenResponse, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenResponse,
    core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata},
};
use secrecy::{ExposeSecret, SecretString};
use url::Url;

const MAX_PROVIDER_RESPONSE_BYTES: usize = 1024 * 1024;

/// Redirect material generated for one browser authorization flow.
pub struct OidcAuthorization {
    /// Provider authorization URL.
    pub url: Url,
    /// Public one-time callback state.
    pub state: String,
    /// OpenID nonce that must match the ID token.
    pub nonce: String,
    /// PKCE verifier retained only by Kitsune.
    pub pkce_verifier: String,
}

/// Verified identity claims accepted from a signed ID token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedOidcClaims {
    /// Stable issuer-local subject.
    pub subject: String,
    /// Provider-verified email address.
    pub email: String,
    /// Human-readable display name.
    pub display_name: String,
}

/// Redirect-disabled OIDC protocol service with centralized egress controls.
#[derive(Clone)]
pub struct OidcService {
    http: OidcHttpClient,
}

impl OidcService {
    /// Creates a public-HTTPS client plus exact operator-trusted private origins.
    pub fn new(trusted_origins: BTreeSet<String>) -> DomainResult<Self> {
        let policy =
            EgressPolicy::public_https(BTreeSet::new()).with_trusted_origins(trusted_origins)?;
        Ok(Self {
            http: OidcHttpClient {
                policy: Arc::new(policy),
            },
        })
    }

    /// Generates an Authorization Code + PKCE S256 request after discovering
    /// provider metadata through the secured HTTP client.
    pub async fn authorization_url(
        &self,
        provider: &ActiveOidcProvider,
        client_secret: &SecretString,
    ) -> DomainResult<OidcAuthorization> {
        let metadata = self.discover(provider).await?;
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(provider.client_id.clone()),
            Some(ClientSecret::new(client_secret.expose_secret().to_owned())),
        )
        .set_redirect_uri(
            RedirectUrl::new(provider.redirect_uri.clone())
                .map_err(|_| DomainError::Validation("OIDC redirect URI is invalid".into()))?,
        );
        let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
        let (url, state, nonce) = client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            )
            .add_scope(Scope::new("openid".into()))
            .add_scope(Scope::new("email".into()))
            .add_scope(Scope::new("profile".into()))
            .set_pkce_challenge(challenge)
            .url();
        Ok(OidcAuthorization {
            url,
            state: state.secret().to_owned(),
            nonce: nonce.secret().to_owned(),
            pkce_verifier: verifier.secret().to_owned(),
        })
    }

    /// Exchanges an authorization code and verifies signature, issuer,
    /// audience, expiry, nonce, optional access-token hash, and verified email.
    pub async fn exchange_code(
        &self,
        provider: &ActiveOidcProvider,
        client_secret: &SecretString,
        code: String,
        pkce_verifier: String,
        nonce: String,
    ) -> DomainResult<VerifiedOidcClaims> {
        let metadata = self.discover(provider).await?;
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(provider.client_id.clone()),
            Some(ClientSecret::new(client_secret.expose_secret().to_owned())),
        )
        .set_redirect_uri(
            RedirectUrl::new(provider.redirect_uri.clone())
                .map_err(|_| DomainError::Validation("OIDC redirect URI is invalid".into()))?,
        );
        let token_response = client
            .exchange_code(AuthorizationCode::new(code))
            .map_err(|_| DomainError::Unavailable("OIDC token endpoint is unavailable".into()))?
            .set_pkce_verifier(PkceCodeVerifier::new(pkce_verifier))
            .request_async(&self.http)
            .await
            .map_err(|_| DomainError::Unavailable("OIDC token exchange failed".into()))?;
        let id_token = token_response
            .id_token()
            .ok_or_else(|| DomainError::Validation("OIDC response omitted its ID token".into()))?;
        let verifier = client.id_token_verifier();
        let claims = id_token
            .claims(&verifier, &Nonce::new(nonce))
            .map_err(|_| DomainError::Validation("OIDC ID token validation failed".into()))?;
        if let Some(expected_hash) = claims.access_token_hash() {
            let actual_hash = AccessTokenHash::from_token(
                token_response.access_token(),
                id_token.signing_alg().map_err(|_| {
                    DomainError::Validation("OIDC signing algorithm is invalid".into())
                })?,
                id_token
                    .signing_key(&verifier)
                    .map_err(|_| DomainError::Validation("OIDC signing key is invalid".into()))?,
            )
            .map_err(|_| DomainError::Validation("OIDC access-token hash is invalid".into()))?;
            if actual_hash != *expected_hash {
                return Err(DomainError::Validation(
                    "OIDC access-token hash did not match".into(),
                ));
            }
        }
        if claims.email_verified() != Some(true) {
            return Err(DomainError::Forbidden);
        }
        let email = claims
            .email()
            .map(|email| email.as_str().trim().to_owned())
            .filter(|email| !email.is_empty() && email.len() <= 320)
            .ok_or_else(|| DomainError::Validation("OIDC verified email is missing".into()))?;
        let subject = claims.subject().as_str().trim().to_owned();
        if subject.is_empty() || subject.len() > 512 {
            return Err(DomainError::Validation(
                "OIDC subject length is invalid".into(),
            ));
        }
        let display_name = claims
            .name()
            .and_then(|name| {
                name.get(None)
                    .or_else(|| name.iter().next().map(|(_, value)| value))
            })
            .map(|name| name.as_str().trim())
            .filter(|name| !name.is_empty())
            .or_else(|| {
                claims
                    .preferred_username()
                    .map(|username| username.as_str().trim())
                    .filter(|username| !username.is_empty())
            })
            .unwrap_or_else(|| email.split('@').next().unwrap_or("Player"));
        let display_name = display_name.chars().take(80).collect::<String>();
        Ok(VerifiedOidcClaims {
            subject,
            email,
            display_name,
        })
    }

    async fn discover(&self, provider: &ActiveOidcProvider) -> DomainResult<CoreProviderMetadata> {
        let issuer = IssuerUrl::new(provider.issuer_url.clone())
            .map_err(|_| DomainError::Validation("OIDC issuer URL is invalid".into()))?;
        CoreProviderMetadata::discover_async(issuer, &self.http)
            .await
            .map_err(|_| DomainError::Unavailable("OIDC discovery failed".into()))
    }
}

impl Default for OidcService {
    fn default() -> Self {
        Self::new(BTreeSet::new()).expect("empty OIDC trust configuration is valid")
    }
}

#[derive(Clone)]
struct OidcHttpClient {
    policy: Arc<EgressPolicy>,
}

impl<'client> AsyncHttpClient<'client> for OidcHttpClient {
    type Error = OidcHttpError;
    type Future =
        Pin<Box<dyn Future<Output = Result<HttpResponse, Self::Error>> + Send + Sync + 'client>>;

    fn call(&'client self, request: HttpRequest) -> Self::Future {
        Box::pin(async move { self.execute(request).await })
    }
}

impl OidcHttpClient {
    async fn execute(&self, request: HttpRequest) -> Result<HttpResponse, OidcHttpError> {
        let url = Url::parse(&request.uri().to_string())
            .map_err(|_| OidcHttpError("OIDC request URL is invalid".into()))?;
        let target = self
            .policy
            .resolve(&url)
            .await
            .map_err(|_| OidcHttpError("OIDC request destination was denied".into()))?;
        let client = target
            .configure_client(
                reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .connect_timeout(StdDuration::from_secs(3))
                    .timeout(StdDuration::from_secs(10))
                    .user_agent(concat!("Kitsune/", env!("CARGO_PKG_VERSION"))),
            )
            .build()
            .map_err(|_| OidcHttpError("OIDC HTTP client could not be built".into()))?;
        let request = reqwest::Request::try_from(request)
            .map_err(|_| OidcHttpError("OIDC HTTP request could not be encoded".into()))?;
        let mut response = client
            .execute(request)
            .await
            .map_err(|_| OidcHttpError("OIDC HTTP request failed".into()))?;
        let mut builder = openidconnect::http::Response::builder()
            .status(response.status())
            .version(response.version());
        for (name, value) in response.headers() {
            builder = builder.header(name, value);
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| OidcHttpError("OIDC HTTP response failed".into()))?
        {
            if body.len().saturating_add(chunk.len()) > MAX_PROVIDER_RESPONSE_BYTES {
                return Err(OidcHttpError("OIDC HTTP response is too large".into()));
            }
            body.extend_from_slice(&chunk);
        }
        builder
            .body(body)
            .map_err(|_| OidcHttpError("OIDC HTTP response could not be decoded".into()))
    }
}

#[derive(Debug)]
struct OidcHttpError(String);

impl Display for OidcHttpError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for OidcHttpError {}
