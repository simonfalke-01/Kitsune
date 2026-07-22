//! Tenant-scoped SAML provider, browser-flow, replay, and identity persistence.

use chrono::{DateTime, Duration, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    events::{DomainEvent, EventEnvelope},
    identity::{OrganizationId, UserId},
};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::auth::normalize_email;

/// Provider metadata safe to return through the organizer API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SamlProviderRecord {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login label.
    pub display_name: String,
    /// Identity-provider entity ID parsed from metadata.
    pub idp_entity_id: String,
    /// Optional source URL used for metadata ingestion.
    pub metadata_url: Option<String>,
    /// Whether the metadata document carried a verified pinned signature.
    pub metadata_verified: bool,
    /// Canonical Kitsune service-provider entity ID.
    pub sp_entity_id: String,
    /// Canonical assertion consumer service URI.
    pub acs_uri: String,
    /// Optional exact assertion attribute containing email.
    pub email_attribute: Option<String>,
    /// Optional exact assertion attribute containing display name.
    pub display_name_attribute: Option<String>,
    /// Provider availability.
    pub enabled: bool,
    /// Create a player after the first valid assertion.
    pub auto_provision: bool,
    /// Permit assertion-email linking to an existing verified account.
    pub allow_email_link: bool,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Last configuration change.
    pub updated_at: DateTime<Utc>,
}

/// Minimal enabled-provider projection for the public login page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicSamlProvider {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login label.
    pub display_name: String,
}

/// Enabled provider configuration used by the SAML protocol service.
#[derive(Clone)]
pub struct ActiveSamlProvider {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization identifier.
    pub organization_id: OrganizationId,
    /// Organization slug used by public routes.
    pub organization_slug: String,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable login label.
    pub display_name: String,
    /// Identity-provider entity ID.
    pub idp_entity_id: String,
    /// Trusted identity-provider metadata XML.
    pub idp_metadata: String,
    /// Canonical Kitsune service-provider entity ID.
    pub sp_entity_id: String,
    /// Canonical assertion consumer service URI.
    pub acs_uri: String,
    /// Optional exact assertion attribute containing email.
    pub email_attribute: Option<String>,
    /// Optional exact assertion attribute containing display name.
    pub display_name_attribute: Option<String>,
    /// Create a player after the first valid assertion.
    pub auto_provision: bool,
    /// Permit assertion-email linking to an existing verified account.
    pub allow_email_link: bool,
}

impl std::fmt::Debug for ActiveSamlProvider {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ActiveSamlProvider")
            .field("id", &self.id)
            .field("organization_id", &self.organization_id)
            .field("organization_slug", &self.organization_slug)
            .field("key", &self.key)
            .field("display_name", &self.display_name)
            .field("idp_entity_id", &self.idp_entity_id)
            .field("idp_metadata", &"[REDACTED]")
            .field("sp_entity_id", &self.sp_entity_id)
            .field("acs_uri", &self.acs_uri)
            .field("email_attribute", &self.email_attribute)
            .field("display_name_attribute", &self.display_name_attribute)
            .field("auto_provision", &self.auto_provision)
            .field("allow_email_link", &self.allow_email_link)
            .finish()
    }
}

/// New SAML provider configuration.
pub struct NewSamlProvider<'a> {
    /// Server-generated provider ID.
    pub id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Organizer performing the change.
    pub actor_id: UserId,
    /// Organization-local URL key.
    pub key: &'a str,
    /// Human-readable login label.
    pub display_name: &'a str,
    /// Parsed identity-provider entity ID.
    pub idp_entity_id: &'a str,
    /// Validated identity-provider metadata XML.
    pub idp_metadata: &'a str,
    /// Optional source URL used for metadata ingestion.
    pub metadata_url: Option<&'a str>,
    /// Optional PEM certificate pinned for metadata signature verification.
    pub metadata_signing_certificate: Option<&'a str>,
    /// Whether pinned metadata signature verification succeeded.
    pub metadata_verified: bool,
    /// Canonical Kitsune service-provider entity ID.
    pub sp_entity_id: &'a str,
    /// Canonical assertion consumer service URI.
    pub acs_uri: &'a str,
    /// Optional exact assertion attribute containing email.
    pub email_attribute: Option<&'a str>,
    /// Optional exact assertion attribute containing display name.
    pub display_name_attribute: Option<&'a str>,
    /// Provider availability.
    pub enabled: bool,
    /// First-login provisioning policy.
    pub auto_provision: bool,
    /// Explicit assertion-email linking policy.
    pub allow_email_link: bool,
    /// Correlation ID for audit and outbox records.
    pub correlation_id: Uuid,
    /// Authoritative time.
    pub now: DateTime<Utc>,
}

/// Complete SAML provider replacement.
pub struct UpdateSamlProvider<'a> {
    /// Provider identifier.
    pub id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Organizer performing the change.
    pub actor_id: UserId,
    /// Human-readable login label.
    pub display_name: &'a str,
    /// Parsed identity-provider entity ID.
    pub idp_entity_id: &'a str,
    /// Validated identity-provider metadata XML.
    pub idp_metadata: &'a str,
    /// Optional source URL used for metadata ingestion.
    pub metadata_url: Option<&'a str>,
    /// Optional PEM certificate pinned for metadata signature verification.
    pub metadata_signing_certificate: Option<&'a str>,
    /// Whether pinned metadata signature verification succeeded.
    pub metadata_verified: bool,
    /// Optional exact assertion attribute containing email.
    pub email_attribute: Option<&'a str>,
    /// Optional exact assertion attribute containing display name.
    pub display_name_attribute: Option<&'a str>,
    /// Provider availability.
    pub enabled: bool,
    /// First-login provisioning policy.
    pub auto_provision: bool,
    /// Explicit assertion-email linking policy.
    pub allow_email_link: bool,
    /// Correlation ID for audit and outbox records.
    pub correlation_id: Uuid,
    /// Authoritative time.
    pub now: DateTime<Utc>,
}

/// Provider mutation paired with its durable domain event.
pub struct SamlProviderMutation {
    /// Safe provider metadata.
    pub record: SamlProviderRecord,
    /// Event committed in the same transaction.
    pub event: EventEnvelope,
}

/// New short-lived SP-initiated browser flow.
pub struct NewSamlFlow<'a> {
    /// Server-generated flow ID.
    pub id: Uuid,
    /// Provider identifier.
    pub provider_id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Issued AuthnRequest ID.
    pub request_id: &'a str,
    /// SHA-256 digest of public RelayState.
    pub relay_state_digest: &'a [u8],
    /// Authenticated-encrypted RelayState used to reconstruct pending state.
    pub encrypted_relay_state: &'a [u8],
    /// SHA-256 digest of the private browser-binding cookie.
    pub browser_binding_digest: &'a [u8],
    /// Validated application-local return path.
    pub return_path: &'a str,
    /// Flow expiry.
    pub expires_at: DateTime<Utc>,
    /// Authoritative creation time.
    pub now: DateTime<Utc>,
}

/// Validated but not yet consumed SAML browser flow.
#[derive(Clone)]
pub struct SamlFlowContext {
    /// Flow identifier.
    pub id: Uuid,
    /// Provider configuration.
    pub provider: ActiveSamlProvider,
    /// Issued AuthnRequest ID.
    pub request_id: String,
    /// Authenticated-encrypted RelayState.
    pub encrypted_relay_state: Vec<u8>,
    /// Validated application-local return path.
    pub return_path: String,
}

/// Verified SAML identity accepted by the persistence boundary.
pub struct VerifiedSamlIdentity<'a> {
    /// Stable IdP-local NameID.
    pub subject: &'a str,
    /// Signed assertion email.
    pub email: &'a str,
    /// Display name derived from a signed assertion.
    pub display_name: &'a str,
    /// Signed response message ID.
    pub response_id: &'a str,
    /// Signed assertion ID.
    pub assertion_id: &'a str,
}

/// Session-ready account returned after a successful SAML login.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SamlAccount {
    /// User identifier.
    pub user_id: UserId,
    /// Organization identifier.
    pub organization_id: OrganizationId,
    /// Public display name.
    pub display_name: String,
    /// Normalized verified email.
    pub email: String,
    /// Email ownership state.
    pub email_verified: bool,
}

/// Completed SAML login with durable domain events.
pub struct SamlLoginMutation {
    /// Session-ready account.
    pub account: SamlAccount,
    /// Events committed in the same transaction.
    pub events: Vec<EventEnvelope>,
}

struct SamlProvisioningPolicy {
    id: Uuid,
    organization_id: OrganizationId,
    idp_entity_id: String,
    auto_provision: bool,
    allow_email_link: bool,
}

/// PostgreSQL SAML repository.
#[derive(Debug, Clone)]
pub struct SamlRepository {
    pool: PgPool,
}

impl SamlRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Resolves the stable slug for canonical provider endpoints.
    pub async fn organization_slug(&self, organization_id: OrganizationId) -> DomainResult<String> {
        sqlx::query_scalar!(
            "SELECT slug FROM organizations WHERE id = $1",
            organization_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)
    }

    /// Creates a provider with audit and outbox records.
    pub async fn create_provider(
        &self,
        command: NewSamlProvider<'_>,
    ) -> DomainResult<SamlProviderMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let record = sqlx::query_as!(
            SamlProviderRecord,
            r#"
            INSERT INTO saml_providers (
                id,organization_id,key,display_name,idp_entity_id,idp_metadata,
                metadata_url,metadata_signing_certificate,metadata_verified,
                sp_entity_id,acs_uri,email_attribute,display_name_attribute,
                enabled,auto_provision,allow_email_link,created_by,updated_by,
                created_at,updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                $17,$17,$18,$18
            )
            RETURNING id,key,display_name,idp_entity_id,metadata_url,
                      metadata_verified,sp_entity_id,acs_uri,email_attribute,
                      display_name_attribute,enabled,auto_provision,
                      allow_email_link,created_at,updated_at
            "#,
            command.id,
            command.organization_id.0,
            command.key,
            command.display_name,
            command.idp_entity_id,
            command.idp_metadata,
            command.metadata_url,
            command.metadata_signing_certificate,
            command.metadata_verified,
            command.sp_entity_id,
            command.acs_uri,
            command.email_attribute,
            command.display_name_attribute,
            command.enabled,
            command.auto_provision,
            command.allow_email_link,
            command.actor_id.0,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let event = provider_event(
            command.organization_id,
            command.actor_id,
            command.id,
            "created",
            command.correlation_id,
            command.now,
        );
        persist_provider_change(
            &mut tx,
            &event,
            "auth.saml_provider.create",
            command.id,
            provider_metadata(&record),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SamlProviderMutation { record, event })
    }

    /// Replaces provider metadata and policy while preserving canonical SP endpoints.
    pub async fn update_provider(
        &self,
        command: UpdateSamlProvider<'_>,
    ) -> DomainResult<SamlProviderMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let record = sqlx::query_as!(
            SamlProviderRecord,
            r#"
            UPDATE saml_providers SET
                display_name = $4,
                idp_entity_id = $5,
                idp_metadata = $6,
                metadata_url = $7,
                metadata_signing_certificate = $8,
                metadata_verified = $9,
                email_attribute = $10,
                display_name_attribute = $11,
                enabled = $12,
                auto_provision = $13,
                allow_email_link = $14,
                updated_by = $3,
                updated_at = $15
            WHERE id = $1 AND organization_id = $2
            RETURNING id,key,display_name,idp_entity_id,metadata_url,
                      metadata_verified,sp_entity_id,acs_uri,email_attribute,
                      display_name_attribute,enabled,auto_provision,
                      allow_email_link,created_at,updated_at
            "#,
            command.id,
            command.organization_id.0,
            command.actor_id.0,
            command.display_name,
            command.idp_entity_id,
            command.idp_metadata,
            command.metadata_url,
            command.metadata_signing_certificate,
            command.metadata_verified,
            command.email_attribute,
            command.display_name_attribute,
            command.enabled,
            command.auto_provision,
            command.allow_email_link,
            command.now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?
        .ok_or(DomainError::NotFound)?;
        let event = provider_event(
            command.organization_id,
            command.actor_id,
            command.id,
            "updated",
            command.correlation_id,
            command.now,
        );
        persist_provider_change(
            &mut tx,
            &event,
            "auth.saml_provider.update",
            command.id,
            provider_metadata(&record),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SamlProviderMutation { record, event })
    }

    /// Lists safe provider metadata for one organization.
    pub async fn list_providers(
        &self,
        organization_id: OrganizationId,
    ) -> DomainResult<Vec<SamlProviderRecord>> {
        sqlx::query_as!(
            SamlProviderRecord,
            r#"
            SELECT id,key,display_name,idp_entity_id,metadata_url,
                   metadata_verified,sp_entity_id,acs_uri,email_attribute,
                   display_name_attribute,enabled,auto_provision,
                   allow_email_link,created_at,updated_at
            FROM saml_providers
            WHERE organization_id = $1
            ORDER BY display_name,id
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Lists enabled provider buttons without exposing metadata.
    pub async fn public_providers(
        &self,
        organization_slug: &str,
    ) -> DomainResult<Vec<PublicSamlProvider>> {
        sqlx::query_as!(
            PublicSamlProvider,
            r#"
            SELECT p.key,p.display_name
            FROM saml_providers p
            JOIN organizations o ON o.id = p.organization_id
            WHERE o.slug = $1 AND p.enabled = true
            ORDER BY p.display_name,p.id
            "#,
            organization_slug,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Loads one enabled provider for a public browser flow.
    pub async fn active_provider(
        &self,
        organization_slug: &str,
        provider_key: &str,
    ) -> DomainResult<Option<ActiveSamlProvider>> {
        let row = sqlx::query_as!(
            ActiveProviderRow,
            r#"
            SELECT p.id,p.organization_id,o.slug AS organization_slug,p.key,
                   p.display_name,p.idp_entity_id,p.idp_metadata,p.sp_entity_id,
                   p.acs_uri,p.email_attribute,p.display_name_attribute,
                   p.auto_provision,p.allow_email_link
            FROM saml_providers p
            JOIN organizations o ON o.id = p.organization_id
            WHERE o.slug = $1 AND p.key = $2 AND p.enabled = true
            "#,
            organization_slug,
            provider_key,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(row.map(active_provider_from_row))
    }

    /// Persists one short-lived request/RelayState/browser-bound flow.
    pub async fn begin_flow(&self, flow: NewSamlFlow<'_>) -> DomainResult<()> {
        sqlx::query!(
            r#"
            INSERT INTO saml_flows (
                id,provider_id,organization_id,request_id,relay_state_digest,
                encrypted_relay_state,browser_binding_digest,return_path,
                expires_at,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            "#,
            flow.id,
            flow.provider_id,
            flow.organization_id.0,
            flow.request_id,
            flow.relay_state_digest,
            flow.encrypted_relay_state,
            flow.browser_binding_digest,
            flow.return_path,
            flow.expires_at,
            flow.now,
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(conflict_or_unavailable)
    }

    /// Resolves an unexpired flow and validates its browser binding in constant time.
    pub async fn resolve_flow(
        &self,
        relay_state_digest: &[u8],
        browser_binding_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<Option<SamlFlowContext>> {
        struct FlowRow {
            flow_id: Uuid,
            provider_id: Uuid,
            organization_id: Uuid,
            organization_slug: String,
            provider_key: String,
            display_name: String,
            idp_entity_id: String,
            idp_metadata: String,
            sp_entity_id: String,
            acs_uri: String,
            email_attribute: Option<String>,
            display_name_attribute: Option<String>,
            auto_provision: bool,
            allow_email_link: bool,
            request_id: String,
            encrypted_relay_state: Vec<u8>,
            browser_binding_digest: Vec<u8>,
            return_path: String,
        }

        let row = sqlx::query_as!(
            FlowRow,
            r#"
            SELECT f.id AS flow_id,p.id AS provider_id,p.organization_id,
                   o.slug AS "organization_slug!",p.key AS provider_key,
                   p.display_name,p.idp_entity_id,p.idp_metadata,p.sp_entity_id,
                   p.acs_uri,p.email_attribute,p.display_name_attribute,
                   p.auto_provision,p.allow_email_link,f.request_id,
                   f.encrypted_relay_state,f.browser_binding_digest,f.return_path
            FROM saml_flows f
            JOIN saml_providers p
              ON p.id = f.provider_id AND p.organization_id = f.organization_id
            JOIN organizations o ON o.id = p.organization_id
            WHERE f.relay_state_digest = $1 AND f.consumed_at IS NULL
              AND f.expires_at > $2 AND p.enabled = true
            "#,
            relay_state_digest,
            now,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        let Some(row) = row else {
            return Ok(None);
        };
        let binding_matches: bool = row
            .browser_binding_digest
            .ct_eq(browser_binding_digest)
            .into();
        if !binding_matches {
            return Ok(None);
        }
        Ok(Some(SamlFlowContext {
            id: row.flow_id,
            provider: ActiveSamlProvider {
                id: row.provider_id,
                organization_id: OrganizationId(row.organization_id),
                organization_slug: row.organization_slug,
                key: row.provider_key,
                display_name: row.display_name,
                idp_entity_id: row.idp_entity_id,
                idp_metadata: row.idp_metadata,
                sp_entity_id: row.sp_entity_id,
                acs_uri: row.acs_uri,
                email_attribute: row.email_attribute,
                display_name_attribute: row.display_name_attribute,
                auto_provision: row.auto_provision,
                allow_email_link: row.allow_email_link,
            },
            request_id: row.request_id,
            encrypted_relay_state: row.encrypted_relay_state,
            return_path: row.return_path,
        }))
    }

    /// Consumes a verified flow and assertion exactly once, then resolves or provisions its user.
    pub async fn complete_login(
        &self,
        flow: &SamlFlowContext,
        identity: VerifiedSamlIdentity<'_>,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<SamlLoginMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        consume_flow(&mut tx, flow.id, flow.provider.id, now).await?;
        reserve_replay_keys(
            &mut tx,
            flow.provider.id,
            [identity.response_id, identity.assertion_id],
            now,
        )
        .await?;
        let provider =
            current_provider_policy(&mut tx, flow.provider.id, flow.provider.organization_id)
                .await?;
        let provider_key = format!("saml:{}", provider.id);
        let normalized_email = normalize_email(identity.email);
        let existing = find_identity_account(
            &mut tx,
            provider.organization_id,
            &provider_key,
            identity.subject,
        )
        .await?;
        let (account, created, linked) = if let Some(account) = existing {
            (account, false, false)
        } else {
            provision_or_link_account(
                &mut tx,
                &provider,
                &identity,
                &normalized_email,
                &provider_key,
                now,
            )
            .await?
        };

        let mut events = Vec::with_capacity(if created { 2 } else { 1 });
        if created {
            events.push(EventEnvelope::new(
                account.organization_id,
                None,
                Some(account.user_id),
                correlation_id,
                now,
                DomainEvent::UserCreated {
                    user_id: account.user_id,
                },
            ));
        }
        events.push(EventEnvelope::new(
            account.organization_id,
            None,
            Some(account.user_id),
            correlation_id,
            now,
            DomainEvent::AuthenticationSucceeded {
                user_id: account.user_id,
                method: "saml_sp_initiated".into(),
            },
        ));
        persist_login(&mut tx, &events, provider.id, &account, created, linked).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SamlLoginMutation { account, events })
    }
}

fn active_provider_from_row(row: ActiveProviderRow) -> ActiveSamlProvider {
    ActiveSamlProvider {
        id: row.id,
        organization_id: OrganizationId(row.organization_id),
        organization_slug: row.organization_slug,
        key: row.key,
        display_name: row.display_name,
        idp_entity_id: row.idp_entity_id,
        idp_metadata: row.idp_metadata,
        sp_entity_id: row.sp_entity_id,
        acs_uri: row.acs_uri,
        email_attribute: row.email_attribute,
        display_name_attribute: row.display_name_attribute,
        auto_provision: row.auto_provision,
        allow_email_link: row.allow_email_link,
    }
}

struct ActiveProviderRow {
    id: Uuid,
    organization_id: Uuid,
    organization_slug: String,
    key: String,
    display_name: String,
    idp_entity_id: String,
    idp_metadata: String,
    sp_entity_id: String,
    acs_uri: String,
    email_attribute: Option<String>,
    display_name_attribute: Option<String>,
    auto_provision: bool,
    allow_email_link: bool,
}

async fn consume_flow(
    tx: &mut Transaction<'_, Postgres>,
    flow_id: Uuid,
    provider_id: Uuid,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    let changed = sqlx::query!(
        r#"
        UPDATE saml_flows SET consumed_at = $3
        WHERE id = $1 AND provider_id = $2 AND consumed_at IS NULL AND expires_at > $3
          AND EXISTS (
              SELECT 1 FROM saml_providers p
              WHERE p.id = saml_flows.provider_id
                AND p.organization_id = saml_flows.organization_id
                AND p.enabled = true
          )
        "#,
        flow_id,
        provider_id,
        now,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?
    .rows_affected();
    if changed == 1 {
        Ok(())
    } else {
        Err(DomainError::NotFound)
    }
}

async fn reserve_replay_keys<'a>(
    tx: &mut Transaction<'_, Postgres>,
    provider_id: Uuid,
    keys: impl IntoIterator<Item = &'a str>,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    sqlx::query!("DELETE FROM saml_replay_keys WHERE expires_at <= $1", now)
        .execute(&mut **tx)
        .await
        .map_err(unavailable)?;
    let expires_at = now + Duration::hours(24);
    for key in keys {
        let digest = Sha256::digest(key.as_bytes());
        sqlx::query!(
            r#"
            INSERT INTO saml_replay_keys (key_digest,provider_id,expires_at,created_at)
            VALUES ($1,$2,$3,$4)
            "#,
            digest.as_slice(),
            provider_id,
            expires_at,
            now,
        )
        .execute(&mut **tx)
        .await
        .map_err(|error| {
            if is_unique_violation(&error) {
                DomainError::Conflict("SAML response was already consumed".into())
            } else {
                unavailable(error)
            }
        })?;
    }
    Ok(())
}

async fn current_provider_policy(
    tx: &mut Transaction<'_, Postgres>,
    provider_id: Uuid,
    organization_id: OrganizationId,
) -> DomainResult<SamlProvisioningPolicy> {
    let row = sqlx::query!(
        r#"
        SELECT id,organization_id,idp_entity_id,auto_provision,allow_email_link
        FROM saml_providers
        WHERE id = $1 AND organization_id = $2 AND enabled = true
        FOR SHARE
        "#,
        provider_id,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(SamlProvisioningPolicy {
        id: row.id,
        organization_id: OrganizationId(row.organization_id),
        idp_entity_id: row.idp_entity_id,
        auto_provision: row.auto_provision,
        allow_email_link: row.allow_email_link,
    })
}

async fn find_identity_account(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    provider_key: &str,
    subject: &str,
) -> DomainResult<Option<SamlAccount>> {
    let row = sqlx::query!(
        r#"
        SELECT u.id,u.organization_id,u.display_name,u.email_normalized,u.email_verified
        FROM auth_identities i
        JOIN users u ON u.id = i.user_id
        WHERE i.provider_key = $1 AND i.subject = $2
          AND u.organization_id = $3 AND u.disabled = false
        "#,
        provider_key,
        subject,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(row.map(|row| SamlAccount {
        user_id: UserId(row.id),
        organization_id: OrganizationId(row.organization_id),
        display_name: row.display_name,
        email: row.email_normalized,
        email_verified: row.email_verified,
    }))
}

async fn provision_or_link_account(
    tx: &mut Transaction<'_, Postgres>,
    provider: &SamlProvisioningPolicy,
    identity: &VerifiedSamlIdentity<'_>,
    normalized_email: &str,
    provider_key: &str,
    now: DateTime<Utc>,
) -> DomainResult<(SamlAccount, bool, bool)> {
    let existing_user = sqlx::query!(
        r#"
        SELECT id,organization_id,display_name,email_normalized,email_verified
        FROM users
        WHERE organization_id = $1 AND email_normalized = $2 AND disabled = false
        FOR UPDATE
        "#,
        provider.organization_id.0,
        normalized_email,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;

    let (account, created, linked) = if let Some(user) = existing_user {
        if !provider.allow_email_link || !user.email_verified {
            return Err(DomainError::Conflict(
                "verified email belongs to an account that is not linked to this provider".into(),
            ));
        }
        (
            SamlAccount {
                user_id: UserId(user.id),
                organization_id: OrganizationId(user.organization_id),
                display_name: user.display_name,
                email: user.email_normalized,
                email_verified: user.email_verified,
            },
            false,
            true,
        )
    } else {
        if !provider.auto_provision {
            return Err(DomainError::Forbidden);
        }
        let account = create_player(
            tx,
            provider.organization_id,
            identity.email,
            normalized_email,
            identity.display_name,
            now,
        )
        .await?;
        (account, true, false)
    };

    sqlx::query!(
        r#"
        INSERT INTO auth_identities (
            id,user_id,provider_kind,provider_key,subject,metadata,created_at
        ) VALUES ($1,$2,'saml',$3,$4,$5,$6)
        "#,
        Uuid::now_v7(),
        account.user_id.0,
        provider_key,
        identity.subject,
        json!({
            "issuer": provider.idp_entity_id,
            "email": normalized_email,
        }),
        now,
    )
    .execute(&mut **tx)
    .await
    .map_err(conflict_or_unavailable)?;
    Ok((account, created, linked))
}

async fn create_player(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    email: &str,
    normalized_email: &str,
    display_name: &str,
    now: DateTime<Utc>,
) -> DomainResult<SamlAccount> {
    let user_id = UserId::new();
    sqlx::query!(
        r#"
        INSERT INTO users (
            id,organization_id,email,email_normalized,display_name,password_hash,
            email_verified,disabled,custom_fields,created_at,updated_at
        ) VALUES ($1,$2,$3,$4,$5,NULL,true,false,'{}',$6,$6)
        "#,
        user_id.0,
        organization_id.0,
        email.trim(),
        normalized_email,
        display_name.trim(),
        now,
    )
    .execute(&mut **tx)
    .await
    .map_err(conflict_or_unavailable)?;
    let player_permissions: Vec<String> = [
        "event_read",
        "challenge_read",
        "submission_create",
        "scoreboard_read",
        "team_create",
        "team_join",
        "team_captain",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    let role_id = sqlx::query_scalar!(
        r#"
        INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
        VALUES ($1,$2,'player','Player',$3,true)
        ON CONFLICT (organization_id,key) DO UPDATE SET
            name = EXCLUDED.name,
            permissions = EXCLUDED.permissions
        RETURNING id
        "#,
        Uuid::now_v7(),
        organization_id.0,
        &player_permissions,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        INSERT INTO role_grants (
            id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
        ) VALUES ($1,$2,$3,$4,NULL,NULL,NULL,$5)
        "#,
        Uuid::now_v7(),
        user_id.0,
        role_id,
        organization_id.0,
        now,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(SamlAccount {
        user_id,
        organization_id,
        display_name: display_name.trim().to_owned(),
        email: normalized_email.to_owned(),
        email_verified: true,
    })
}

fn provider_event(
    organization_id: OrganizationId,
    actor_id: UserId,
    provider_id: Uuid,
    state: &str,
    correlation_id: Uuid,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        None,
        Some(actor_id),
        correlation_id,
        now,
        DomainEvent::SamlProviderChanged {
            provider_id,
            state: state.to_owned(),
        },
    )
}

fn provider_metadata(record: &SamlProviderRecord) -> serde_json::Value {
    json!({
        "key": record.key,
        "display_name": record.display_name,
        "idp_entity_id": record.idp_entity_id,
        "metadata_url": record.metadata_url,
        "metadata_verified": record.metadata_verified,
        "sp_entity_id": record.sp_entity_id,
        "acs_uri": record.acs_uri,
        "email_attribute": record.email_attribute,
        "display_name_attribute": record.display_name_attribute,
        "enabled": record.enabled,
        "auto_provision": record.auto_provision,
        "allow_email_link": record.allow_email_link,
    })
}

async fn persist_provider_change(
    tx: &mut Transaction<'_, Postgres>,
    event: &EventEnvelope,
    action: &str,
    provider_id: Uuid,
    metadata: serde_json::Value,
) -> DomainResult<()> {
    let organization_id = event
        .organization_id
        .ok_or_else(|| DomainError::Validation("SAML event must be tenant-scoped".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,$4,'saml_provider',$5,$6,$7,$8)
        "#,
        Uuid::now_v7(),
        organization_id.0,
        event.actor_id.map(|id| id.0),
        action,
        provider_id.to_string(),
        metadata,
        event.correlation_id,
        event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    persist_events(tx, std::slice::from_ref(event)).await
}

async fn persist_login(
    tx: &mut Transaction<'_, Postgres>,
    events: &[EventEnvelope],
    provider_id: Uuid,
    account: &SamlAccount,
    created: bool,
    linked: bool,
) -> DomainResult<()> {
    let login_event = events
        .last()
        .ok_or_else(|| DomainError::Validation("SAML login event is missing".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,'auth.saml.login','user',$4,$5,$6,$7)
        "#,
        Uuid::now_v7(),
        account.organization_id.0,
        account.user_id.0,
        account.user_id.to_string(),
        json!({
            "provider_id": provider_id,
            "created": created,
            "linked": linked,
        }),
        login_event.correlation_id,
        login_event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    persist_events(tx, events).await
}

async fn persist_events(
    tx: &mut Transaction<'_, Postgres>,
    events: &[EventEnvelope],
) -> DomainResult<()> {
    for event in events {
        let organization_id = event
            .organization_id
            .ok_or_else(|| DomainError::Validation("SAML event must be tenant-scoped".into()))?;
        sqlx::query!(
            r#"
            INSERT INTO event_outbox (
                id,organization_id,event_id,kind,envelope,occurred_at,created_at
            ) VALUES ($1,$2,NULL,$3,$4,$5,$5)
            "#,
            event.id,
            organization_id.0,
            event.kind(),
            serde_json::to_value(event)
                .map_err(|error| DomainError::Validation(error.to_string()))?,
            event.occurred_at,
        )
        .execute(&mut **tx)
        .await
        .map_err(unavailable)?;
    }
    Ok(())
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres SAML: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if is_unique_violation(&error) {
        DomainError::Conflict("SAML provider, flow, or identity already exists".into())
    } else {
        unavailable(error)
    }
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_core::identity::{OrganizationId, UserId};
    use sha2::{Digest, Sha256};
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{
        NewSamlFlow, NewSamlProvider, SamlRepository, UpdateSamlProvider, VerifiedSamlIdentity,
    };
    use crate::{MIGRATOR, auth::AuthRepository};

    async fn first_admin(pool: &PgPool) -> (OrganizationId, UserId) {
        let organization_id = OrganizationId::new();
        let user_id = UserId::new();
        AuthRepository::new(pool.clone())
            .create_first_admin(
                organization_id,
                "SAML Shrine",
                "saml-shrine",
                user_id,
                "owner@example.test",
                "Owner",
                "$argon2id$test-only",
                Utc::now(),
            )
            .await
            .expect("first admin");
        (organization_id, user_id)
    }

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn provider_flow_replay_and_provisioning_are_tenant_safe(pool: PgPool) {
        let (organization_id, actor_id) = first_admin(&pool).await;
        let repository = SamlRepository::new(pool.clone());
        let provider_id = Uuid::now_v7();
        let now = Utc::now();
        let created = repository
            .create_provider(NewSamlProvider {
                id: provider_id,
                organization_id,
                actor_id,
                key: "workforce",
                display_name: "Workforce SSO",
                idp_entity_id: "https://identity.example.test/metadata",
                idp_metadata: "<EntityDescriptor />",
                metadata_url: Some("https://identity.example.test/metadata.xml"),
                metadata_signing_certificate: Some("certificate"),
                metadata_verified: true,
                sp_entity_id: "https://ctf.example.test/api/v1/auth/saml/saml-shrine/workforce/metadata",
                acs_uri: "https://ctf.example.test/api/v1/auth/saml/saml-shrine/workforce/acs",
                email_attribute: Some("mail"),
                display_name_attribute: Some("displayName"),
                enabled: true,
                auto_provision: true,
                allow_email_link: false,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("create provider");
        assert!(created.record.metadata_verified);
        assert_eq!(created.event.kind(), "auth.saml_provider.changed");

        let public = repository
            .public_providers("saml-shrine")
            .await
            .expect("public providers");
        assert_eq!(public.len(), 1);
        assert_eq!(public[0].display_name, "Workforce SSO");

        let active = repository
            .active_provider("saml-shrine", "workforce")
            .await
            .expect("active provider")
            .expect("provider exists");
        assert!(format!("{active:?}").contains("[REDACTED]"));
        assert!(!format!("{active:?}").contains("EntityDescriptor"));

        let relay_state = "relay-state";
        let relay_digest = Sha256::digest(relay_state.as_bytes());
        let binding_digest = Sha256::digest(b"browser-binding");
        repository
            .begin_flow(NewSamlFlow {
                id: Uuid::now_v7(),
                provider_id,
                organization_id,
                request_id: "_request-123",
                relay_state_digest: relay_digest.as_slice(),
                encrypted_relay_state: b"sealed-relay-state",
                browser_binding_digest: binding_digest.as_slice(),
                return_path: "/challenges",
                expires_at: now + Duration::minutes(10),
                now,
            })
            .await
            .expect("begin flow");
        let wrong_binding = Sha256::digest(b"different-browser");
        assert!(
            repository
                .resolve_flow(
                    relay_digest.as_slice(),
                    wrong_binding.as_slice(),
                    Utc::now(),
                )
                .await
                .expect("resolve wrong binding")
                .is_none()
        );
        let flow = repository
            .resolve_flow(
                relay_digest.as_slice(),
                binding_digest.as_slice(),
                Utc::now(),
            )
            .await
            .expect("resolve flow")
            .expect("flow exists");
        assert_eq!(flow.request_id, "_request-123");

        let login = repository
            .complete_login(
                &flow,
                VerifiedSamlIdentity {
                    subject: "persistent-subject",
                    email: "Player@Example.Test",
                    display_name: "SAML Player",
                    response_id: "_response-123",
                    assertion_id: "_assertion-123",
                },
                Uuid::now_v7(),
                Utc::now(),
            )
            .await
            .expect("complete login");
        assert_eq!(login.account.email, "player@example.test");
        assert!(login.account.email_verified);
        assert_eq!(login.events.len(), 2);
        assert_eq!(login.events[1].kind(), "auth.succeeded");

        let replay = repository
            .complete_login(
                &flow,
                VerifiedSamlIdentity {
                    subject: "persistent-subject",
                    email: "Player@Example.Test",
                    display_name: "SAML Player",
                    response_id: "_response-123",
                    assertion_id: "_assertion-123",
                },
                Uuid::now_v7(),
                Utc::now(),
            )
            .await;
        assert!(replay.is_err());

        let identity_kind = sqlx::query_scalar!(
            "SELECT provider_kind FROM auth_identities WHERE user_id = $1",
            login.account.user_id.0,
        )
        .fetch_one(&pool)
        .await
        .expect("identity kind");
        assert_eq!(identity_kind, "saml");

        let updated = repository
            .update_provider(UpdateSamlProvider {
                id: provider_id,
                organization_id,
                actor_id,
                display_name: "Workforce Identity",
                idp_entity_id: "https://identity.example.test/metadata",
                idp_metadata: "<EntityDescriptor />",
                metadata_url: None,
                metadata_signing_certificate: None,
                metadata_verified: false,
                email_attribute: Some("mail"),
                display_name_attribute: Some("displayName"),
                enabled: false,
                auto_provision: false,
                allow_email_link: false,
                correlation_id: Uuid::now_v7(),
                now: Utc::now(),
            })
            .await
            .expect("disable provider");
        assert!(!updated.record.enabled);
        assert!(
            repository
                .public_providers("saml-shrine")
                .await
                .expect("disabled public providers")
                .is_empty()
        );
        let actions = sqlx::query_scalar!(
            r#"
            SELECT action
            FROM audit_log
            WHERE resource_type IN ('saml_provider','user')
              AND action LIKE 'auth.saml%'
            ORDER BY occurred_at,id
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("audit actions");
        assert_eq!(
            actions,
            vec![
                "auth.saml_provider.create",
                "auth.saml.login",
                "auth.saml_provider.update",
            ]
        );
    }
}
