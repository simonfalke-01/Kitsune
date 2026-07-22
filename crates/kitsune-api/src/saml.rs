//! SAML 2.0 service-provider protocol boundary.

use std::{
    collections::BTreeSet,
    sync::Arc,
    time::{Duration as StdDuration, SystemTime},
};

use kitsune_automation::EgressPolicy;
use kitsune_core::{DomainError, DomainResult};
use kitsune_db::saml::ActiveSamlProvider;
use rcgen::{
    CertificateParams, DistinguishedName, DnType, KeyPair, KeyUsagePurpose, PKCS_RSA_SHA256,
    date_time_ymd,
};
use rsa::{
    RsaPrivateKey,
    pkcs8::{EncodePrivateKey, LineEnding},
    rand_core::OsRng,
};
use saml_rs::{
    AcsEndpoint, AssertionSignaturePolicy, AudienceValidationPolicy, AuthnRequest,
    AuthnRequestSigningPolicy, BrowserInput, CertificatePem, Credentials, EntityId, FormField,
    IdpDescriptor, LogoutPolicy, MessageSignaturePolicy, MetadataTrustPolicy, NameIdCreationPolicy,
    NameIdFormat, PendingAuthnRequest, PendingSnapshot, PrivateKeyPem, RelayStateParam,
    ReplayPolicy, Saml, SamlValidationContext, Sp, SpConfig, SpValidationPolicy, SsoResponse,
    StartSso, XmlPolicy,
};
use url::Url;

const MAX_METADATA_BYTES: usize = 1024 * 1024;
const METADATA_CONNECT_TIMEOUT: StdDuration = StdDuration::from_secs(3);
const METADATA_REQUEST_TIMEOUT: StdDuration = StdDuration::from_secs(10);

/// Long-lived signing material used for AuthnRequests and SP metadata.
#[derive(Clone)]
pub struct SamlCredentials {
    private_key_pem: String,
    certificate_pem: String,
}

impl std::fmt::Debug for SamlCredentials {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("SamlCredentials")
            .field("private_key_pem", &"[REDACTED]")
            .field("certificate_pem", &"[REDACTED]")
            .finish()
    }
}

impl SamlCredentials {
    /// Validates persisted PEM material before it reaches a request path.
    pub fn new(private_key_pem: String, certificate_pem: String) -> DomainResult<Self> {
        if private_key_pem.trim().is_empty() || certificate_pem.trim().is_empty() {
            return Err(DomainError::Validation(
                "SAML signing credentials are empty".into(),
            ));
        }
        KeyPair::from_pkcs8_pem_and_sign_algo(&private_key_pem, &PKCS_RSA_SHA256)
            .map_err(|_| DomainError::Validation("SAML signing key is invalid".into()))?;
        Ok(Self {
            private_key_pem,
            certificate_pem,
        })
    }

    /// Generates an RSA signing key and a self-signed metadata certificate.
    /// This is intended for first boot; deployments may replace the persisted
    /// pair before registering the SP with an identity provider.
    pub fn generate() -> DomainResult<Self> {
        let private_key = RsaPrivateKey::new(&mut OsRng, 3072)
            .map_err(|_| DomainError::Unavailable("SAML signing key generation failed".into()))?;
        let private_key_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .map_err(|_| DomainError::Unavailable("SAML signing key encoding failed".into()))?
            .to_string();
        let key_pair = KeyPair::from_pkcs8_pem_and_sign_algo(&private_key_pem, &PKCS_RSA_SHA256)
            .map_err(|_| DomainError::Unavailable("SAML signing key could not be loaded".into()))?;
        let mut distinguished_name = DistinguishedName::new();
        distinguished_name.push(DnType::CommonName, "Kitsune SAML service provider");
        let mut params = CertificateParams::default();
        params.distinguished_name = distinguished_name;
        params.not_before = date_time_ymd(2025, 1, 1);
        params.not_after = date_time_ymd(2045, 1, 1);
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        let certificate = params.self_signed(&key_pair).map_err(|_| {
            DomainError::Unavailable("SAML signing certificate generation failed".into())
        })?;
        Self::new(private_key_pem, certificate.pem())
    }

    /// Returns the signing key for secure persistence.
    pub fn private_key_pem(&self) -> &str {
        &self.private_key_pem
    }

    /// Returns the public certificate for metadata and secure persistence.
    pub fn certificate_pem(&self) -> &str {
        &self.certificate_pem
    }

    fn protocol_credentials(&self) -> Credentials {
        Credentials {
            signing_key: Some(PrivateKeyPem::new(self.private_key_pem.clone())),
            signing_certificate: Some(CertificatePem::new(self.certificate_pem.clone())),
            ..Credentials::default()
        }
    }
}

/// Validated metadata ready for tenant-scoped persistence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedSamlMetadata {
    /// Identity-provider entity ID declared by the document.
    pub idp_entity_id: String,
    /// Bounded original XML document.
    pub xml: String,
    /// Whether a caller-pinned metadata certificate verified the document.
    pub verified: bool,
}

/// Browser action produced by an SP-initiated login.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SamlAuthorization {
    /// HTTP 303 destination carrying a signed Redirect-binding request.
    Redirect {
        /// Identity-provider destination.
        url: Url,
        /// SAML request correlation ID.
        request_id: String,
    },
    /// Auto-submitting HTML form carrying a signed POST-binding request.
    Post {
        /// Exact identity-provider destination from trusted metadata.
        action: Url,
        /// Hidden fields emitted by the SAML implementation.
        fields: Vec<(String, String)>,
        /// SAML request correlation ID.
        request_id: String,
    },
}

impl SamlAuthorization {
    /// Returns the issued request ID for durable correlation.
    pub fn request_id(&self) -> &str {
        match self {
            Self::Redirect { request_id, .. } | Self::Post { request_id, .. } => request_id,
        }
    }
}

/// Identity and anti-replay material extracted from a verified assertion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedSamlClaims {
    /// Stable identity-provider NameID.
    pub subject: String,
    /// Email from a signed assertion attribute or email-format NameID.
    pub email: String,
    /// Display name from a signed assertion attribute.
    pub display_name: String,
    /// Signed response identifier.
    pub response_id: String,
    /// Signed assertion identifier.
    pub assertion_id: String,
}

/// SAML protocol service with one egress policy and one signing identity.
#[derive(Clone)]
pub struct SamlService {
    credentials: SamlCredentials,
    egress: Arc<EgressPolicy>,
}

impl SamlService {
    /// Creates a public-HTTPS metadata client plus exact trusted private origins.
    pub fn new(
        credentials: SamlCredentials,
        trusted_origins: BTreeSet<String>,
    ) -> DomainResult<Self> {
        let egress =
            EgressPolicy::public_https(BTreeSet::new()).with_trusted_origins(trusted_origins)?;
        Ok(Self {
            credentials,
            egress: Arc::new(egress),
        })
    }

    /// Parses bounded metadata and optionally requires a pinned XML signature.
    pub fn validate_metadata(
        &self,
        xml: String,
        signing_certificate: Option<&str>,
    ) -> DomainResult<ValidatedSamlMetadata> {
        if xml.len() > MAX_METADATA_BYTES {
            return Err(DomainError::Validation(
                "SAML metadata exceeds the one MiB limit".into(),
            ));
        }
        if xml.contains("<!DOCTYPE") || xml.contains("<!ENTITY") {
            return Err(DomainError::Validation(
                "SAML metadata may not declare document types or entities".into(),
            ));
        }
        let pinned = signing_certificate
            .map(str::trim)
            .filter(|certificate| !certificate.is_empty())
            .map(CertificatePem::new);
        let descriptor = match pinned.as_ref() {
            Some(certificate) => {
                let certificates = [certificate.clone()];
                IdpDescriptor::from_metadata_xml(
                    &xml,
                    MetadataTrustPolicy::RequireSignature {
                        trusted_certificates: &certificates,
                    },
                )
            }
            None => IdpDescriptor::from_metadata_xml(
                &xml,
                MetadataTrustPolicy::UnsignedForCompatibility,
            ),
        }
        .map_err(|_| DomainError::Validation("SAML metadata validation failed".into()))?;
        Ok(ValidatedSamlMetadata {
            idp_entity_id: descriptor.entity_id().as_str().to_owned(),
            verified: descriptor.was_verified_with_pinned_certificates(),
            xml,
        })
    }

    /// Fetches metadata through DNS-pinned, redirect-disabled SSRF controls.
    pub async fn fetch_metadata(&self, source: &Url) -> DomainResult<String> {
        let target = self.egress.resolve(source).await?;
        let client = target
            .configure_client(
                reqwest::Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .connect_timeout(METADATA_CONNECT_TIMEOUT)
                    .timeout(METADATA_REQUEST_TIMEOUT)
                    .user_agent(concat!("Kitsune/", env!("CARGO_PKG_VERSION"))),
            )
            .build()
            .map_err(|_| {
                DomainError::Unavailable("SAML metadata HTTP client could not be built".into())
            })?;
        let mut response = client.get(source.clone()).send().await.map_err(|_| {
            DomainError::Unavailable("SAML metadata endpoint is unavailable".into())
        })?;
        if !response.status().is_success() {
            return Err(DomainError::Unavailable(format!(
                "SAML metadata endpoint returned {}",
                response.status()
            )));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| {
            DomainError::Unavailable("SAML metadata response could not be read".into())
        })? {
            if bytes.len().saturating_add(chunk.len()) > MAX_METADATA_BYTES {
                return Err(DomainError::Validation(
                    "SAML metadata exceeds the one MiB limit".into(),
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        String::from_utf8(bytes)
            .map_err(|_| DomainError::Validation("SAML metadata is not UTF-8".into()))
    }

    /// Renders canonical Kitsune service-provider metadata for a provider.
    pub fn service_provider_metadata(
        &self,
        sp_entity_id: &str,
        acs_uri: &str,
    ) -> DomainResult<String> {
        Ok(self
            .service_provider(sp_entity_id, acs_uri)?
            .metadata_xml()
            .to_owned())
    }

    /// Starts a signed SP-initiated flow. Redirect binding is preferred, with
    /// signed POST binding used when the IdP does not advertise Redirect.
    pub fn authorization(
        &self,
        provider: &ActiveSamlProvider,
        relay_state: &str,
    ) -> DomainResult<SamlAuthorization> {
        let service_provider = self.service_provider(&provider.sp_entity_id, &provider.acs_uri)?;
        let identity_provider = Self::identity_provider(provider)?;
        let relay_state = RelayStateParam::try_from_option(Some(relay_state.to_owned()))
            .map_err(protocol_validation_error)?;
        let redirect = service_provider.start_sso(
            &identity_provider,
            StartSso::redirect().relay_state(relay_state.clone()),
        );
        if let Ok(started) = redirect {
            let url = Url::parse(
                started
                    .outbound
                    .redirect_url()
                    .map_err(protocol_validation_error)?,
            )
            .map_err(|_| DomainError::Validation("SAML redirect URL is invalid".into()))?;
            validate_browser_destination(&url)?;
            return Ok(SamlAuthorization::Redirect {
                url,
                request_id: started.pending.request_id().as_str().to_owned(),
            });
        }
        let started = service_provider
            .start_sso(
                &identity_provider,
                StartSso::post().relay_state(relay_state),
            )
            .map_err(protocol_validation_error)?;
        let form = started
            .outbound
            .post_form()
            .map_err(protocol_validation_error)?;
        let action = Url::parse(form.action().as_str())
            .map_err(|_| DomainError::Validation("SAML POST URL is invalid".into()))?;
        validate_browser_destination(&action)?;
        let fields = form
            .fields()
            .iter()
            .map(|field| (field.name().to_owned(), field.value().to_owned()))
            .collect();
        Ok(SamlAuthorization::Post {
            action,
            fields,
            request_id: started.pending.request_id().as_str().to_owned(),
        })
    }

    /// Verifies a POST-binding response and extracts only signed assertion data.
    /// Replay is reserved transactionally in PostgreSQL by the caller after
    /// verification so every stateless API node observes the same result.
    pub fn verify_response(
        &self,
        provider: &ActiveSamlProvider,
        request_id: &str,
        relay_state: &str,
        saml_response: &str,
    ) -> DomainResult<VerifiedSamlClaims> {
        let service_provider = self.service_provider(&provider.sp_entity_id, &provider.acs_uri)?;
        let identity_provider = Self::identity_provider(provider)?;
        let relay_state = RelayStateParam::try_from_option(Some(relay_state.to_owned()))
            .map_err(protocol_validation_error)?;
        let snapshot = PendingSnapshot::<AuthnRequest>::authn_request(
            request_id,
            relay_state.clone(),
            provider.idp_entity_id.clone(),
            "post",
            provider.acs_uri.clone(),
            "post",
        );
        let pending =
            PendingAuthnRequest::from_snapshot(snapshot).map_err(protocol_validation_error)?;
        let fields = vec![
            FormField::new("SAMLResponse", saml_response),
            FormField::new("RelayState", relay_state.as_deref().unwrap_or_default()),
        ];
        let session = service_provider
            .finish_sso(
                &identity_provider,
                &pending,
                BrowserInput::<SsoResponse>::post(fields),
                SamlValidationContext::new(
                    SystemTime::now(),
                    ReplayPolicy::DisabledForCompatibility,
                ),
            )
            .map_err(protocol_authentication_error)?;
        verified_claims(provider, &session)
    }

    fn identity_provider(provider: &ActiveSamlProvider) -> DomainResult<IdpDescriptor> {
        IdpDescriptor::from_metadata_xml_for(
            EntityId::try_new(provider.idp_entity_id.clone()).map_err(protocol_validation_error)?,
            &provider.idp_metadata,
            MetadataTrustPolicy::UnsignedForCompatibility,
        )
        .map_err(protocol_validation_error)
    }

    fn service_provider(&self, sp_entity_id: &str, acs_uri: &str) -> DomainResult<Saml<Sp>> {
        let validation = SpValidationPolicy {
            assertions: AssertionSignaturePolicy::RequireSigned,
            messages: MessageSignaturePolicy::AllowUnsignedForCompatibility,
            authn_requests: AuthnRequestSigningPolicy::Sign,
            audience: AudienceValidationPolicy::Validate,
            name_id_creation: NameIdCreationPolicy::AllowCreate,
            logout: LogoutPolicy::strict(),
        };
        let config = SpConfig::builder(
            EntityId::try_new(sp_entity_id.to_owned()).map_err(protocol_validation_error)?,
        )
        .acs_endpoint(AcsEndpoint::post(acs_uri).map_err(protocol_validation_error)?)
        .name_id_format(NameIdFormat::Persistent)
        .name_id_format(NameIdFormat::EmailAddress)
        .credentials(self.credentials.protocol_credentials())
        .validation(validation)
        // Default XML policy rejects software RSA key-transport decryption.
        // Kitsune intentionally supports signed plaintext assertions only.
        .xml(XmlPolicy::default())
        .build()
        .map_err(protocol_validation_error)?;
        Saml::sp(config).map_err(protocol_validation_error)
    }
}

fn verified_claims(
    provider: &ActiveSamlProvider,
    session: &saml_rs::SsoSession,
) -> DomainResult<VerifiedSamlClaims> {
    let subject = session.name_id().value().trim().to_owned();
    if subject.is_empty() || subject.len() > 512 {
        return Err(DomainError::Validation(
            "SAML NameID length is invalid".into(),
        ));
    }
    let email = attribute_value(
        session,
        provider.email_attribute.as_deref(),
        &[
            "email",
            "mail",
            "emailAddress",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        ],
    )
    .map(str::to_owned)
    .or_else(|| {
        (session.name_id().format() == Some(&NameIdFormat::EmailAddress)).then(|| subject.clone())
    })
    .map(|value| value.trim().to_owned())
    .filter(|value| !value.is_empty() && value.len() <= 320 && value.contains('@'))
    .ok_or_else(|| DomainError::Validation("SAML assertion email is missing".into()))?;
    let display_name = attribute_value(
        session,
        provider.display_name_attribute.as_deref(),
        &[
            "displayName",
            "name",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
        ],
    )
    .map(|value| value.trim().to_owned())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| email.split('@').next().unwrap_or("Player").to_owned())
    .chars()
    .take(80)
    .collect();
    Ok(VerifiedSamlClaims {
        subject,
        email,
        display_name,
        response_id: session.response_id().as_str().to_owned(),
        assertion_id: session.assertion_id().as_str().to_owned(),
    })
}

fn attribute_value<'a>(
    session: &'a saml_rs::SsoSession,
    configured_name: Option<&str>,
    fallback_names: &[&str],
) -> Option<&'a str> {
    configured_name
        .into_iter()
        .chain(fallback_names.iter().copied())
        .find_map(|name| {
            session
                .attributes()
                .get(name)
                .and_then(|attribute| attribute.values().first())
                .map(saml_rs::AttributeValue::as_str)
        })
}

fn protocol_validation_error(error: saml_rs::SamlError) -> DomainError {
    tracing::warn!(error = %error, "SAML protocol configuration was rejected");
    DomainError::Validation("SAML protocol configuration is invalid".into())
}

fn protocol_authentication_error(error: saml_rs::SamlError) -> DomainError {
    tracing::warn!(error = %error, "SAML response validation failed");
    DomainError::Forbidden
}

fn validate_browser_destination(destination: &Url) -> DomainResult<()> {
    if !matches!(destination.scheme(), "http" | "https")
        || destination.host().is_none()
        || !destination.username().is_empty()
        || destination.password().is_some()
        || destination.fragment().is_some()
    {
        return Err(DomainError::Validation(
            "SAML identity-provider destination is invalid".into(),
        ));
    }
    Ok(())
}
