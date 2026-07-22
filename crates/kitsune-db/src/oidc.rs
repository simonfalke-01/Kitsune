//! Tenant-scoped OpenID Connect provider, login-flow, and identity persistence.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    events::{DomainEvent, EventEnvelope},
    identity::{OrganizationId, UserId},
};
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::auth::normalize_email;

/// Provider metadata safe to return through the organizer API.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OidcProviderRecord {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable button label.
    pub display_name: String,
    /// OpenID issuer identifier.
    pub issuer_url: String,
    /// OAuth client identifier.
    pub client_id: String,
    /// Registered authorization-code callback.
    pub redirect_uri: String,
    /// Provider availability.
    pub enabled: bool,
    /// Create a player after the first valid login.
    pub auto_provision: bool,
    /// Permit verified-email linking to an existing account.
    pub allow_email_link: bool,
    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
    /// Last configuration change.
    pub updated_at: DateTime<Utc>,
}

/// Minimal enabled-provider projection for the public login page.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicOidcProvider {
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable button label.
    pub display_name: String,
}

/// Active provider configuration used by the protocol client.
#[derive(Clone)]
pub struct ActiveOidcProvider {
    /// Provider identifier.
    pub id: Uuid,
    /// Organization identifier.
    pub organization_id: OrganizationId,
    /// Organization slug used by public routes.
    pub organization_slug: String,
    /// Organization-local URL key.
    pub key: String,
    /// Human-readable button label.
    pub display_name: String,
    /// OpenID issuer identifier.
    pub issuer_url: String,
    /// OAuth client identifier.
    pub client_id: String,
    /// Authenticated-encrypted OAuth client secret.
    pub encrypted_client_secret: Vec<u8>,
    /// Registered authorization-code callback.
    pub redirect_uri: String,
    /// Create a player after the first valid login.
    pub auto_provision: bool,
    /// Permit verified-email linking to an existing account.
    pub allow_email_link: bool,
}

impl std::fmt::Debug for ActiveOidcProvider {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ActiveOidcProvider")
            .field("id", &self.id)
            .field("organization_id", &self.organization_id)
            .field("organization_slug", &self.organization_slug)
            .field("key", &self.key)
            .field("display_name", &self.display_name)
            .field("issuer_url", &self.issuer_url)
            .field("client_id", &self.client_id)
            .field("encrypted_client_secret", &"[REDACTED]")
            .field("redirect_uri", &self.redirect_uri)
            .field("auto_provision", &self.auto_provision)
            .field("allow_email_link", &self.allow_email_link)
            .finish()
    }
}

/// New encrypted provider configuration.
pub struct NewOidcProvider<'a> {
    /// Server-generated provider ID.
    pub id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Organizer performing the change.
    pub actor_id: UserId,
    /// Organization-local URL key.
    pub key: &'a str,
    /// Human-readable button label.
    pub display_name: &'a str,
    /// OpenID issuer identifier.
    pub issuer_url: &'a str,
    /// OAuth client identifier.
    pub client_id: &'a str,
    /// Authenticated-encrypted OAuth client secret.
    pub encrypted_client_secret: &'a [u8],
    /// Registered authorization-code callback.
    pub redirect_uri: &'a str,
    /// Provider availability.
    pub enabled: bool,
    /// Create a player after the first valid login.
    pub auto_provision: bool,
    /// Permit verified-email linking to an existing account.
    pub allow_email_link: bool,
    /// Correlation ID for audit and outbox records.
    pub correlation_id: Uuid,
    /// Authoritative time.
    pub now: DateTime<Utc>,
}

/// Mutable encrypted provider configuration.
pub struct UpdateOidcProvider<'a> {
    /// Provider identifier.
    pub id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// Organizer performing the change.
    pub actor_id: UserId,
    /// Human-readable button label.
    pub display_name: &'a str,
    /// OpenID issuer identifier.
    pub issuer_url: &'a str,
    /// OAuth client identifier.
    pub client_id: &'a str,
    /// Authenticated-encrypted OAuth client secret, when rotating it.
    pub encrypted_client_secret: Option<&'a [u8]>,
    /// Registered authorization-code callback.
    pub redirect_uri: &'a str,
    /// Provider availability.
    pub enabled: bool,
    /// Create a player after the first valid login.
    pub auto_provision: bool,
    /// Permit verified-email linking to an existing account.
    pub allow_email_link: bool,
    /// Correlation ID for audit and outbox records.
    pub correlation_id: Uuid,
    /// Authoritative time.
    pub now: DateTime<Utc>,
}

/// Provider mutation paired with its durable domain event.
pub struct OidcProviderMutation {
    /// Safe provider metadata.
    pub record: OidcProviderRecord,
    /// Event committed in the same transaction.
    pub event: EventEnvelope,
}

/// New one-time authorization-code browser flow.
pub struct NewOidcFlow<'a> {
    /// Server-generated flow ID.
    pub id: Uuid,
    /// Provider identifier.
    pub provider_id: Uuid,
    /// Owning organization.
    pub organization_id: OrganizationId,
    /// SHA-256 digest of the public state value.
    pub state_digest: &'a [u8],
    /// SHA-256 digest of the private browser-binding cookie.
    pub browser_binding_digest: &'a [u8],
    /// Authenticated-encrypted PKCE verifier.
    pub encrypted_pkce_verifier: &'a [u8],
    /// Authenticated-encrypted OpenID nonce.
    pub encrypted_nonce: &'a [u8],
    /// Validated application-local return path.
    pub return_path: &'a str,
    /// Flow expiry.
    pub expires_at: DateTime<Utc>,
    /// Authoritative creation time.
    pub now: DateTime<Utc>,
}

/// Validated but not yet consumed login flow.
#[derive(Clone)]
pub struct OidcFlowContext {
    /// Flow identifier.
    pub id: Uuid,
    /// Provider configuration.
    pub provider: ActiveOidcProvider,
    /// Authenticated-encrypted PKCE verifier.
    pub encrypted_pkce_verifier: Vec<u8>,
    /// Authenticated-encrypted OpenID nonce.
    pub encrypted_nonce: Vec<u8>,
    /// Validated application-local return path.
    pub return_path: String,
}

/// Verified claims accepted by the persistence boundary.
pub struct VerifiedOidcIdentity<'a> {
    /// Stable issuer-local subject.
    pub subject: &'a str,
    /// Verified normalized email.
    pub email: &'a str,
    /// Display name selected from verified claims.
    pub display_name: &'a str,
}

/// Session-ready account returned after a successful OIDC login.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OidcAccount {
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

/// Completed OIDC login with durable domain events.
pub struct OidcLoginMutation {
    /// Session-ready account.
    pub account: OidcAccount,
    /// Events committed in the same transaction.
    pub events: Vec<EventEnvelope>,
}

struct OidcProvisioningPolicy {
    id: Uuid,
    organization_id: OrganizationId,
    issuer_url: String,
    auto_provision: bool,
    allow_email_link: bool,
}

/// PostgreSQL OIDC repository.
#[derive(Debug, Clone)]
pub struct OidcRepository {
    pool: PgPool,
}

impl OidcRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Creates a provider with audit and outbox records.
    pub async fn create_provider(
        &self,
        command: NewOidcProvider<'_>,
    ) -> DomainResult<OidcProviderMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let record = sqlx::query_as!(
            OidcProviderRecord,
            r#"
            INSERT INTO oidc_providers (
                id,organization_id,key,display_name,issuer_url,client_id,
                encrypted_client_secret,redirect_uri,enabled,auto_provision,
                allow_email_link,created_by,updated_by,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$13)
            RETURNING id,key,display_name,issuer_url,client_id,redirect_uri,
                      enabled,auto_provision,allow_email_link,created_at,updated_at
            "#,
            command.id,
            command.organization_id.0,
            command.key,
            command.display_name,
            command.issuer_url,
            command.client_id,
            command.encrypted_client_secret,
            command.redirect_uri,
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
            "auth.oidc_provider.create",
            command.id,
            provider_metadata(&record),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(OidcProviderMutation { record, event })
    }

    /// Replaces provider metadata and optionally rotates its client secret.
    pub async fn update_provider(
        &self,
        command: UpdateOidcProvider<'_>,
    ) -> DomainResult<OidcProviderMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let record = sqlx::query_as!(
            OidcProviderRecord,
            r#"
            UPDATE oidc_providers SET
                display_name = $4,
                issuer_url = $5,
                client_id = $6,
                encrypted_client_secret = COALESCE($7, encrypted_client_secret),
                redirect_uri = $8,
                enabled = $9,
                auto_provision = $10,
                allow_email_link = $11,
                updated_by = $3,
                updated_at = $12
            WHERE id = $1 AND organization_id = $2
            RETURNING id,key,display_name,issuer_url,client_id,redirect_uri,
                      enabled,auto_provision,allow_email_link,created_at,updated_at
            "#,
            command.id,
            command.organization_id.0,
            command.actor_id.0,
            command.display_name,
            command.issuer_url,
            command.client_id,
            command.encrypted_client_secret,
            command.redirect_uri,
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
            "auth.oidc_provider.update",
            command.id,
            provider_metadata(&record),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(OidcProviderMutation { record, event })
    }

    /// Lists safe provider metadata for one organization.
    pub async fn list_providers(
        &self,
        organization_id: OrganizationId,
    ) -> DomainResult<Vec<OidcProviderRecord>> {
        sqlx::query_as!(
            OidcProviderRecord,
            r#"
            SELECT id,key,display_name,issuer_url,client_id,redirect_uri,
                   enabled,auto_provision,allow_email_link,created_at,updated_at
            FROM oidc_providers
            WHERE organization_id = $1
            ORDER BY display_name,id
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Lists enabled provider buttons without exposing confidential metadata.
    pub async fn public_providers(
        &self,
        organization_slug: &str,
    ) -> DomainResult<Vec<PublicOidcProvider>> {
        sqlx::query_as!(
            PublicOidcProvider,
            r#"
            SELECT p.key,p.display_name
            FROM oidc_providers p
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

    /// Loads one enabled provider for a public authorization flow.
    pub async fn active_provider(
        &self,
        organization_slug: &str,
        provider_key: &str,
    ) -> DomainResult<Option<ActiveOidcProvider>> {
        let row = sqlx::query!(
            r#"
            SELECT p.id,p.organization_id,o.slug AS organization_slug,p.key,
                   p.display_name,p.issuer_url,p.client_id,p.encrypted_client_secret,
                   p.redirect_uri,p.auto_provision,p.allow_email_link
            FROM oidc_providers p
            JOIN organizations o ON o.id = p.organization_id
            WHERE o.slug = $1 AND p.key = $2 AND p.enabled = true
            "#,
            organization_slug,
            provider_key,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(row.map(|row| ActiveOidcProvider {
            id: row.id,
            organization_id: OrganizationId(row.organization_id),
            organization_slug: row.organization_slug,
            key: row.key,
            display_name: row.display_name,
            issuer_url: row.issuer_url,
            client_id: row.client_id,
            encrypted_client_secret: row.encrypted_client_secret,
            redirect_uri: row.redirect_uri,
            auto_provision: row.auto_provision,
            allow_email_link: row.allow_email_link,
        }))
    }

    /// Persists one short-lived PKCE/nonce/state flow.
    pub async fn begin_flow(&self, flow: NewOidcFlow<'_>) -> DomainResult<()> {
        sqlx::query!(
            r#"
            INSERT INTO oidc_flows (
                id,provider_id,organization_id,state_digest,browser_binding_digest,
                encrypted_pkce_verifier,encrypted_nonce,return_path,expires_at,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            "#,
            flow.id,
            flow.provider_id,
            flow.organization_id.0,
            flow.state_digest,
            flow.browser_binding_digest,
            flow.encrypted_pkce_verifier,
            flow.encrypted_nonce,
            flow.return_path,
            flow.expires_at,
            flow.now,
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(conflict_or_unavailable)
    }

    /// Resolves an unexpired flow and validates its browser binding in constant
    /// time. The flow remains unconsumed until verified claims are committed.
    pub async fn resolve_flow(
        &self,
        state_digest: &[u8],
        browser_binding_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<Option<OidcFlowContext>> {
        struct FlowRow {
            flow_id: Uuid,
            provider_id: Uuid,
            organization_id: Uuid,
            organization_slug: String,
            provider_key: String,
            display_name: String,
            issuer_url: String,
            client_id: String,
            encrypted_client_secret: Vec<u8>,
            redirect_uri: String,
            auto_provision: bool,
            allow_email_link: bool,
            browser_binding_digest: Vec<u8>,
            encrypted_pkce_verifier: Vec<u8>,
            encrypted_nonce: Vec<u8>,
            return_path: String,
        }

        let row = sqlx::query_as!(
            FlowRow,
            r#"
            SELECT f.id AS flow_id,p.id AS provider_id,p.organization_id,
                   o.slug AS "organization_slug!",p.key AS provider_key,p.display_name,
                   p.issuer_url,p.client_id,p.encrypted_client_secret,p.redirect_uri,
                   p.auto_provision,p.allow_email_link,f.browser_binding_digest,
                   f.encrypted_pkce_verifier,f.encrypted_nonce,f.return_path
            FROM oidc_flows f
            JOIN oidc_providers p
              ON p.id = f.provider_id AND p.organization_id = f.organization_id
            JOIN organizations o ON o.id = p.organization_id
            WHERE f.state_digest = $1 AND f.consumed_at IS NULL
              AND f.expires_at > $2 AND p.enabled = true
            "#,
            state_digest,
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
        Ok(Some(OidcFlowContext {
            id: row.flow_id,
            provider: ActiveOidcProvider {
                id: row.provider_id,
                organization_id: OrganizationId(row.organization_id),
                organization_slug: row.organization_slug,
                key: row.provider_key,
                display_name: row.display_name,
                issuer_url: row.issuer_url,
                client_id: row.client_id,
                encrypted_client_secret: row.encrypted_client_secret,
                redirect_uri: row.redirect_uri,
                auto_provision: row.auto_provision,
                allow_email_link: row.allow_email_link,
            },
            encrypted_pkce_verifier: row.encrypted_pkce_verifier,
            encrypted_nonce: row.encrypted_nonce,
            return_path: row.return_path,
        }))
    }

    /// Consumes a verified flow exactly once, resolves or provisions its user,
    /// links the issuer subject, and commits audit/outbox state atomically.
    pub async fn complete_login(
        &self,
        flow: &OidcFlowContext,
        identity: VerifiedOidcIdentity<'_>,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<OidcLoginMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        consume_flow(&mut tx, flow.id, flow.provider.id, now).await?;
        let provider =
            current_provider_policy(&mut tx, flow.provider.id, flow.provider.organization_id)
                .await?;
        let provider_key = format!("oidc:{}", provider.id);
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
                identity,
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
                method: "oidc_authorization_code".into(),
            },
        ));
        persist_login(&mut tx, &events, provider.id, &account, created, linked).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(OidcLoginMutation { account, events })
    }
}

async fn consume_flow(
    tx: &mut Transaction<'_, Postgres>,
    flow_id: Uuid,
    provider_id: Uuid,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    let changed = sqlx::query!(
        r#"
        UPDATE oidc_flows SET consumed_at = $3
        WHERE id = $1 AND provider_id = $2 AND consumed_at IS NULL AND expires_at > $3
          AND EXISTS (
              SELECT 1 FROM oidc_providers p
              WHERE p.id = oidc_flows.provider_id
                AND p.organization_id = oidc_flows.organization_id
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

async fn current_provider_policy(
    tx: &mut Transaction<'_, Postgres>,
    provider_id: Uuid,
    organization_id: OrganizationId,
) -> DomainResult<OidcProvisioningPolicy> {
    let row = sqlx::query!(
        r#"
        SELECT id,organization_id,issuer_url,auto_provision,allow_email_link
        FROM oidc_providers
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
    Ok(OidcProvisioningPolicy {
        id: row.id,
        organization_id: OrganizationId(row.organization_id),
        issuer_url: row.issuer_url,
        auto_provision: row.auto_provision,
        allow_email_link: row.allow_email_link,
    })
}

async fn find_identity_account(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    provider_key: &str,
    subject: &str,
) -> DomainResult<Option<OidcAccount>> {
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
    Ok(row.map(|row| OidcAccount {
        user_id: UserId(row.id),
        organization_id: OrganizationId(row.organization_id),
        display_name: row.display_name,
        email: row.email_normalized,
        email_verified: row.email_verified,
    }))
}

async fn provision_or_link_account(
    tx: &mut Transaction<'_, Postgres>,
    provider: &OidcProvisioningPolicy,
    identity: VerifiedOidcIdentity<'_>,
    normalized_email: &str,
    provider_key: &str,
    now: DateTime<Utc>,
) -> DomainResult<(OidcAccount, bool, bool)> {
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
            OidcAccount {
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
        ) VALUES ($1,$2,'oidc',$3,$4,$5,$6)
        "#,
        Uuid::now_v7(),
        account.user_id.0,
        provider_key,
        identity.subject,
        json!({
            "issuer": provider.issuer_url,
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
) -> DomainResult<OidcAccount> {
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
    Ok(OidcAccount {
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
        DomainEvent::OidcProviderChanged {
            provider_id,
            state: state.to_owned(),
        },
    )
}

fn provider_metadata(record: &OidcProviderRecord) -> serde_json::Value {
    json!({
        "key": record.key,
        "display_name": record.display_name,
        "issuer_url": record.issuer_url,
        "client_id": record.client_id,
        "redirect_uri": record.redirect_uri,
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
        .ok_or_else(|| DomainError::Validation("OIDC event must be tenant-scoped".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,$4,'oidc_provider',$5,$6,$7,$8)
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
    account: &OidcAccount,
    created: bool,
    linked: bool,
) -> DomainResult<()> {
    let login_event = events
        .last()
        .ok_or_else(|| DomainError::Validation("OIDC login event is missing".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,'auth.oidc.login','user',$4,$5,$6,$7)
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
            .ok_or_else(|| DomainError::Validation("OIDC event must be tenant-scoped".into()))?;
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
    DomainError::Unavailable(format!("postgres OIDC: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("OIDC provider or identity already exists".into())
    } else {
        unavailable(error)
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use kitsune_core::identity::{OrganizationId, UserId};
    use sha2::{Digest, Sha256};
    use sqlx::PgPool;
    use uuid::Uuid;

    use super::{
        NewOidcFlow, NewOidcProvider, OidcRepository, UpdateOidcProvider, VerifiedOidcIdentity,
    };
    use crate::{MIGRATOR, auth::AuthRepository};

    async fn first_admin(pool: &PgPool) -> (OrganizationId, UserId) {
        let organization_id = OrganizationId::new();
        let user_id = UserId::new();
        AuthRepository::new(pool.clone())
            .create_first_admin(
                organization_id,
                "Night Shrine",
                "night-shrine",
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
    async fn provider_flow_and_provisioning_are_tenant_safe(pool: PgPool) {
        let (organization_id, actor_id) = first_admin(&pool).await;
        let repository = OidcRepository::new(pool.clone());
        let provider_id = Uuid::now_v7();
        let now = Utc::now();
        let created = repository
            .create_provider(NewOidcProvider {
                id: provider_id,
                organization_id,
                actor_id,
                key: "shrine-sso",
                display_name: "Shrine SSO",
                issuer_url: "https://identity.example.test",
                client_id: "kitsune-test",
                encrypted_client_secret: b"sealed-client-secret",
                redirect_uri: "https://ctf.example.test/api/v1/auth/oidc/callback",
                enabled: true,
                auto_provision: true,
                allow_email_link: false,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("create provider");
        assert_eq!(created.record.key, "shrine-sso");
        assert_eq!(created.event.kind(), "auth.oidc_provider.changed");

        let public = repository
            .public_providers("night-shrine")
            .await
            .expect("public providers");
        assert_eq!(public.len(), 1);
        assert_eq!(public[0].display_name, "Shrine SSO");

        let active = repository
            .active_provider("night-shrine", "shrine-sso")
            .await
            .expect("active provider")
            .expect("provider exists");
        assert!(format!("{active:?}").contains("[REDACTED]"));
        assert!(!format!("{active:?}").contains("sealed-client-secret"));

        let state_digest = Sha256::digest(b"state-value");
        let binding_digest = Sha256::digest(b"browser-binding");
        let flow_id = Uuid::now_v7();
        repository
            .begin_flow(NewOidcFlow {
                id: flow_id,
                provider_id,
                organization_id,
                state_digest: state_digest.as_slice(),
                browser_binding_digest: binding_digest.as_slice(),
                encrypted_pkce_verifier: b"sealed-pkce",
                encrypted_nonce: b"sealed-nonce",
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
                    state_digest.as_slice(),
                    wrong_binding.as_slice(),
                    Utc::now()
                )
                .await
                .expect("resolve wrong binding")
                .is_none()
        );
        let flow = repository
            .resolve_flow(
                state_digest.as_slice(),
                binding_digest.as_slice(),
                Utc::now(),
            )
            .await
            .expect("resolve flow")
            .expect("flow exists");
        assert_eq!(flow.return_path, "/challenges");

        let login = repository
            .complete_login(
                &flow,
                VerifiedOidcIdentity {
                    subject: "subject-123",
                    email: "Player@Example.Test",
                    display_name: "Fox Player",
                },
                Uuid::now_v7(),
                Utc::now(),
            )
            .await
            .expect("complete login");
        assert_eq!(login.account.email, "player@example.test");
        assert!(login.account.email_verified);
        assert_eq!(login.events.len(), 2);
        assert_eq!(login.events[0].kind(), "identity.user.created");
        assert_eq!(login.events[1].kind(), "auth.succeeded");

        let password_hash = sqlx::query_scalar!(
            "SELECT password_hash FROM users WHERE id = $1",
            login.account.user_id.0,
        )
        .fetch_one(&pool)
        .await
        .expect("federated user");
        assert!(password_hash.is_none());
        let permissions = AuthRepository::new(pool.clone())
            .permission_keys(login.account.user_id, organization_id, None)
            .await
            .expect("player permissions");
        assert!(
            permissions
                .iter()
                .any(|permission| permission == "challenge_read")
        );

        assert!(
            repository
                .complete_login(
                    &flow,
                    VerifiedOidcIdentity {
                        subject: "subject-123",
                        email: "Player@Example.Test",
                        display_name: "Fox Player",
                    },
                    Uuid::now_v7(),
                    Utc::now(),
                )
                .await
                .is_err()
        );

        let updated = repository
            .update_provider(UpdateOidcProvider {
                id: provider_id,
                organization_id,
                actor_id,
                display_name: "Shrine Identity",
                issuer_url: "https://identity.example.test",
                client_id: "kitsune-test",
                encrypted_client_secret: None,
                redirect_uri: "https://ctf.example.test/api/v1/auth/oidc/callback",
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
                .public_providers("night-shrine")
                .await
                .expect("disabled providers")
                .is_empty()
        );

        let audit_count = sqlx::query_scalar!(
            r#"
            SELECT count(*) AS "count!"
            FROM audit_log
            WHERE organization_id = $1
              AND action IN (
                  'auth.oidc_provider.create',
                  'auth.oidc.login',
                  'auth.oidc_provider.update'
              )
            "#,
            organization_id.0,
        )
        .fetch_one(&pool)
        .await
        .expect("OIDC audit count");
        assert_eq!(audit_count, 3);
    }
}
