//! Tenant-scoped, replay-safe WebAuthn credential and ceremony persistence.

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

/// Server-side ceremony class.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasskeyFlowKind {
    /// An authenticated account is enrolling a new credential.
    Registration,
    /// A browser is proving possession of an existing credential.
    Authentication,
}

impl PasskeyFlowKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Registration => "registration",
            Self::Authentication => "authentication",
        }
    }
}

/// Session-ready account projection for passwordless authentication.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasskeyAccount {
    /// Account identifier.
    pub user_id: UserId,
    /// Tenant identifier.
    pub organization_id: OrganizationId,
    /// Public display name.
    pub display_name: String,
    /// Normalized email address.
    pub email: String,
    /// Email verification state.
    pub email_verified: bool,
}

/// Complete active credential material used by the WebAuthn verifier.
#[derive(Clone)]
pub struct StoredPasskey {
    /// Database identifier.
    pub id: Uuid,
    /// Owning account.
    pub user_id: UserId,
    /// Bounded serialized `webauthn-rs` passkey.
    pub credential: Vec<u8>,
}

impl std::fmt::Debug for StoredPasskey {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("StoredPasskey")
            .field("id", &self.id)
            .field("user_id", &self.user_id)
            .field("credential", &"[REDACTED]")
            .finish()
    }
}

/// Safe account-management projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PasskeyRecord {
    /// Credential database identifier.
    pub id: Uuid,
    /// Operator-authored device label.
    pub name: String,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last successful use.
    pub last_used_at: Option<DateTime<Utc>>,
    /// Revocation time.
    pub revoked_at: Option<DateTime<Utc>>,
}

/// New one-time server-side ceremony.
pub struct NewPasskeyFlow<'a> {
    /// Server-generated flow ID.
    pub id: Uuid,
    /// Account participating in the ceremony.
    pub user_id: UserId,
    /// Tenant boundary.
    pub organization_id: OrganizationId,
    /// Registration or authentication ceremony.
    pub kind: PasskeyFlowKind,
    /// SHA-256 digest of the private browser cookie.
    pub browser_binding_digest: &'a [u8],
    /// Authenticated-encrypted serialized verifier state.
    pub encrypted_state: &'a [u8],
    /// Validated local path used after authentication.
    pub return_path: &'a str,
    /// Ceremony expiry.
    pub expires_at: DateTime<Utc>,
    /// Authoritative creation time.
    pub now: DateTime<Utc>,
}

/// Validated, unconsumed ceremony state.
#[derive(Clone)]
pub struct PasskeyFlowContext {
    /// Flow identifier.
    pub id: Uuid,
    /// Account identifier.
    pub user_id: UserId,
    /// Tenant identifier.
    pub organization_id: OrganizationId,
    /// Authenticated-encrypted verifier state.
    pub encrypted_state: Vec<u8>,
    /// Validated local return path.
    pub return_path: String,
}

impl std::fmt::Debug for PasskeyFlowContext {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PasskeyFlowContext")
            .field("id", &self.id)
            .field("user_id", &self.user_id)
            .field("organization_id", &self.organization_id)
            .field("encrypted_state", &"[REDACTED]")
            .field("return_path", &self.return_path)
            .finish()
    }
}

/// Verified credential enrollment.
pub struct NewPasskey<'a> {
    /// Credential database identifier.
    pub id: Uuid,
    /// Flow being consumed.
    pub flow: &'a PasskeyFlowContext,
    /// Raw authenticator credential ID.
    pub credential_id: &'a [u8],
    /// Stable text subject for the generic identity table.
    pub credential_subject: &'a str,
    /// Bounded serialized passkey.
    pub credential: &'a [u8],
    /// Human-readable device label.
    pub name: &'a str,
    /// Audit correlation ID.
    pub correlation_id: Uuid,
    /// Authoritative completion time.
    pub now: DateTime<Utc>,
}

/// Verified passkey authentication update.
pub struct VerifiedPasskeyAuthentication<'a> {
    /// Flow being consumed.
    pub flow: &'a PasskeyFlowContext,
    /// Raw credential ID selected by the authenticator.
    pub credential_id: &'a [u8],
    /// Updated bounded serialized passkey.
    pub credential: &'a [u8],
    /// Verified authenticator signature counter.
    pub sign_count: i64,
    /// Audit correlation ID.
    pub correlation_id: Uuid,
    /// Authoritative completion time.
    pub now: DateTime<Utc>,
}

/// Credential mutation paired with its durable event.
pub struct PasskeyMutation {
    /// Safe credential metadata.
    pub record: PasskeyRecord,
    /// Event committed in the same transaction.
    pub event: EventEnvelope,
}

/// Successful authentication paired with its durable event.
pub struct PasskeyLoginMutation {
    /// Session-ready account.
    pub account: PasskeyAccount,
    /// Event committed in the same transaction.
    pub event: EventEnvelope,
}

/// PostgreSQL WebAuthn repository.
#[derive(Debug, Clone)]
pub struct PasskeyRepository {
    pool: PgPool,
}

impl PasskeyRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Resolves an enabled account for an email-first passkey ceremony.
    pub async fn account_by_email(
        &self,
        organization_slug: &str,
        email: &str,
    ) -> DomainResult<Option<PasskeyAccount>> {
        let row = sqlx::query!(
            r#"
            SELECT u.id,u.organization_id,u.display_name,u.email_normalized,u.email_verified
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            WHERE o.slug = $1 AND u.email_normalized = $2 AND u.disabled = false
            "#,
            organization_slug,
            normalize_email(email),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(row.map(|row| PasskeyAccount {
            user_id: UserId(row.id),
            organization_id: OrganizationId(row.organization_id),
            display_name: row.display_name,
            email: row.email_normalized,
            email_verified: row.email_verified,
        }))
    }

    /// Loads active credentials for one account and tenant.
    pub async fn active_credentials(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<Vec<StoredPasskey>> {
        let rows = sqlx::query!(
            r#"
            SELECT id,user_id,credential
            FROM webauthn_credentials
            WHERE organization_id = $1 AND user_id = $2 AND revoked_at IS NULL
            ORDER BY created_at,id
            "#,
            organization_id.0,
            user_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(rows
            .into_iter()
            .map(|row| StoredPasskey {
                id: row.id,
                user_id: UserId(row.user_id),
                credential: row.credential,
            })
            .collect())
    }

    /// Lists safe credential metadata for account self-service.
    pub async fn list(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<Vec<PasskeyRecord>> {
        sqlx::query_as!(
            PasskeyRecord,
            r#"
            SELECT id,name,created_at,last_used_at,revoked_at
            FROM webauthn_credentials
            WHERE organization_id = $1 AND user_id = $2
            ORDER BY created_at DESC,id DESC
            "#,
            organization_id.0,
            user_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Persists encrypted server-side verifier state for a one-time ceremony.
    pub async fn begin_flow(&self, flow: NewPasskeyFlow<'_>) -> DomainResult<()> {
        sqlx::query!(
            r#"
            INSERT INTO webauthn_flows (
                id,user_id,organization_id,kind,browser_binding_digest,
                encrypted_state,return_path,expires_at,created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            "#,
            flow.id,
            flow.user_id.0,
            flow.organization_id.0,
            flow.kind.as_str(),
            flow.browser_binding_digest,
            flow.encrypted_state,
            flow.return_path,
            flow.expires_at,
            flow.now,
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(conflict_or_unavailable)
    }

    /// Resolves an unexpired ceremony and validates its browser binding in
    /// constant time. Verification happens before the transaction consumes it.
    pub async fn resolve_flow(
        &self,
        flow_id: Uuid,
        browser_binding_digest: &[u8],
        kind: PasskeyFlowKind,
        now: DateTime<Utc>,
    ) -> DomainResult<Option<PasskeyFlowContext>> {
        struct FlowRow {
            id: Uuid,
            user_id: Uuid,
            organization_id: Uuid,
            browser_binding_digest: Vec<u8>,
            encrypted_state: Vec<u8>,
            return_path: String,
        }

        let row = sqlx::query_as!(
            FlowRow,
            r#"
            SELECT id,user_id,organization_id,browser_binding_digest,
                   encrypted_state,return_path
            FROM webauthn_flows
            WHERE id = $1 AND kind = $2 AND consumed_at IS NULL AND expires_at > $3
            "#,
            flow_id,
            kind.as_str(),
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
        Ok(Some(PasskeyFlowContext {
            id: row.id,
            user_id: UserId(row.user_id),
            organization_id: OrganizationId(row.organization_id),
            encrypted_state: row.encrypted_state,
            return_path: row.return_path,
        }))
    }

    /// Consumes a registration ceremony, inserts a globally unique credential,
    /// and commits audit/outbox state atomically.
    pub async fn complete_registration(
        &self,
        command: NewPasskey<'_>,
    ) -> DomainResult<PasskeyMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        consume_flow(
            &mut tx,
            command.flow,
            PasskeyFlowKind::Registration,
            command.now,
        )
        .await?;
        let record = sqlx::query_as!(
            PasskeyRecord,
            r#"
            INSERT INTO webauthn_credentials (
                id,user_id,organization_id,credential_id,credential,sign_count,
                transports,name,created_at
            ) VALUES ($1,$2,$3,$4,$5,0,'{}',$6,$7)
            RETURNING id,name,created_at,last_used_at,revoked_at
            "#,
            command.id,
            command.flow.user_id.0,
            command.flow.organization_id.0,
            command.credential_id,
            command.credential,
            command.name,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        sqlx::query!(
            r#"
            INSERT INTO auth_identities (
                id,user_id,provider_kind,provider_key,subject,metadata,created_at
            ) VALUES ($1,$2,'webauthn','webauthn',$3,$4,$5)
            "#,
            Uuid::now_v7(),
            command.flow.user_id.0,
            command.credential_subject,
            json!({ "credential_id": command.id }),
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let event = passkey_event(
            command.flow.organization_id,
            command.flow.user_id,
            command.id,
            "active",
            command.correlation_id,
            command.now,
        );
        persist_change(
            &mut tx,
            &event,
            "auth.passkey.register",
            command.id,
            json!({ "name": command.name }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(PasskeyMutation { record, event })
    }

    /// Consumes an authentication ceremony, advances credential state, and
    /// commits the successful-login audit/outbox boundary atomically.
    pub async fn complete_authentication(
        &self,
        command: VerifiedPasskeyAuthentication<'_>,
    ) -> DomainResult<PasskeyLoginMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        consume_flow(
            &mut tx,
            command.flow,
            PasskeyFlowKind::Authentication,
            command.now,
        )
        .await?;
        let updated = sqlx::query!(
            r#"
            UPDATE webauthn_credentials
            SET credential = $4,sign_count = $5,last_used_at = $6
            WHERE user_id = $1 AND organization_id = $2
              AND credential_id = $3 AND revoked_at IS NULL
            "#,
            command.flow.user_id.0,
            command.flow.organization_id.0,
            command.credential_id,
            command.credential,
            command.sign_count,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?
        .rows_affected();
        if updated != 1 {
            return Err(DomainError::NotFound);
        }
        let account =
            active_account(&mut tx, command.flow.organization_id, command.flow.user_id).await?;
        let event = EventEnvelope::new(
            account.organization_id,
            None,
            Some(account.user_id),
            command.correlation_id,
            command.now,
            DomainEvent::AuthenticationSucceeded {
                user_id: account.user_id,
                method: "webauthn_passkey".into(),
            },
        );
        persist_change(
            &mut tx,
            &event,
            "auth.passkey.login",
            command.flow.id,
            json!({ "credential_subject": "verified" }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(PasskeyLoginMutation { account, event })
    }

    /// Durably records a verifier rejection for a known, tenant-scoped
    /// ceremony without consuming the flow's bounded retry allowance.
    pub async fn record_authentication_failure(
        &self,
        flow: &PasskeyFlowContext,
        identity_hint: &str,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let event = EventEnvelope::new(
            flow.organization_id,
            None,
            Some(flow.user_id),
            correlation_id,
            now,
            DomainEvent::AuthenticationFailed {
                identity_hint: identity_hint.to_owned(),
                method: "webauthn_passkey".into(),
            },
        );
        persist_change(
            &mut tx,
            &event,
            "auth.passkey.failure",
            flow.id,
            json!({ "reason": "credential_rejected" }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(event)
    }

    /// Revokes an account-owned credential while preventing accidental removal
    /// of the final available authentication method.
    pub async fn revoke(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
        credential_id: Uuid,
        correlation_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<PasskeyMutation> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        assert_alternate_authentication(&mut tx, user_id, credential_id).await?;
        let record = sqlx::query_as!(
            PasskeyRecord,
            r#"
            UPDATE webauthn_credentials SET revoked_at = $4
            WHERE id = $1 AND organization_id = $2 AND user_id = $3
              AND revoked_at IS NULL
            RETURNING id,name,created_at,last_used_at,revoked_at
            "#,
            credential_id,
            organization_id.0,
            user_id.0,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let event = passkey_event(
            organization_id,
            user_id,
            credential_id,
            "revoked",
            correlation_id,
            now,
        );
        persist_change(
            &mut tx,
            &event,
            "auth.passkey.revoke",
            credential_id,
            json!({ "name": record.name.clone() }),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(PasskeyMutation { record, event })
    }
}

async fn consume_flow(
    tx: &mut Transaction<'_, Postgres>,
    flow: &PasskeyFlowContext,
    kind: PasskeyFlowKind,
    now: DateTime<Utc>,
) -> DomainResult<()> {
    let changed = sqlx::query!(
        r#"
        UPDATE webauthn_flows SET consumed_at = $5
        WHERE id = $1 AND user_id = $2 AND organization_id = $3
          AND kind = $4 AND consumed_at IS NULL AND expires_at > $5
        "#,
        flow.id,
        flow.user_id.0,
        flow.organization_id.0,
        kind.as_str(),
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

async fn active_account(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    user_id: UserId,
) -> DomainResult<PasskeyAccount> {
    let row = sqlx::query!(
        r#"
        SELECT id,organization_id,display_name,email_normalized,email_verified
        FROM users
        WHERE id = $1 AND organization_id = $2 AND disabled = false
        FOR SHARE
        "#,
        user_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    Ok(PasskeyAccount {
        user_id: UserId(row.id),
        organization_id: OrganizationId(row.organization_id),
        display_name: row.display_name,
        email: row.email_normalized,
        email_verified: row.email_verified,
    })
}

async fn assert_alternate_authentication(
    tx: &mut Transaction<'_, Postgres>,
    user_id: UserId,
    credential_id: Uuid,
) -> DomainResult<()> {
    let available = sqlx::query_scalar!(
        r#"
        SELECT (
            u.password_hash IS NOT NULL
            OR EXISTS (
                SELECT 1
                FROM auth_identities identity
                WHERE identity.user_id = u.id
                  AND identity.provider_kind IN ('oidc', 'saml')
            )
            OR EXISTS (
                SELECT 1
                FROM webauthn_credentials credential
                WHERE credential.user_id = u.id
                  AND credential.id <> $2
                  AND credential.revoked_at IS NULL
            )
        ) AS "available!"
        FROM users u
        WHERE u.id = $1
        FOR UPDATE
        "#,
        user_id.0,
        credential_id,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    if available {
        Ok(())
    } else {
        Err(DomainError::Conflict(
            "the final available authentication method cannot be removed".into(),
        ))
    }
}

fn passkey_event(
    organization_id: OrganizationId,
    user_id: UserId,
    credential_id: Uuid,
    state: &str,
    correlation_id: Uuid,
    now: DateTime<Utc>,
) -> EventEnvelope {
    EventEnvelope::new(
        organization_id,
        None,
        Some(user_id),
        correlation_id,
        now,
        DomainEvent::PasskeyChanged {
            credential_id,
            state: state.to_owned(),
        },
    )
}

async fn persist_change(
    tx: &mut Transaction<'_, Postgres>,
    event: &EventEnvelope,
    action: &str,
    resource_id: Uuid,
    metadata: serde_json::Value,
) -> DomainResult<()> {
    let organization_id = event
        .organization_id
        .ok_or_else(|| DomainError::Validation("passkey event must be tenant-scoped".into()))?;
    sqlx::query!(
        r#"
        INSERT INTO audit_log (
            id,organization_id,event_id,actor_id,action,resource_type,
            resource_id,metadata,correlation_id,occurred_at
        ) VALUES ($1,$2,NULL,$3,$4,'passkey',$5,$6,$7,$8)
        "#,
        Uuid::now_v7(),
        organization_id.0,
        event.actor_id.map(|id| id.0),
        action,
        resource_id.to_string(),
        metadata,
        event.correlation_id,
        event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    sqlx::query!(
        r#"
        INSERT INTO event_outbox (
            id,organization_id,event_id,kind,envelope,occurred_at,created_at
        ) VALUES ($1,$2,NULL,$3,$4,$5,$5)
        "#,
        event.id,
        organization_id.0,
        event.kind(),
        serde_json::to_value(event).map_err(|error| DomainError::Validation(error.to_string()))?,
        event.occurred_at,
    )
    .execute(&mut **tx)
    .await
    .map_err(unavailable)?;
    Ok(())
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres passkey: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("passkey or ceremony already exists".into())
    } else {
        unavailable(error)
    }
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};
    use sqlx::PgPool;

    use super::*;
    use crate::{MIGRATOR, auth::AuthRepository};

    #[sqlx::test(migrator = "MIGRATOR")]
    async fn ceremonies_are_bound_one_time_audited_and_revocable(pool: PgPool) {
        let organization_id = OrganizationId::new();
        let user_id = UserId::new();
        let now = Utc::now();
        AuthRepository::new(pool.clone())
            .create_first_admin(
                organization_id,
                "Passkey Shrine",
                "passkey-shrine",
                user_id,
                "owner@passkey.test",
                "Passkey Owner",
                "$argon2id$test-placeholder",
                now,
            )
            .await
            .expect("first admin");
        let repository = PasskeyRepository::new(pool.clone());
        let registration_id = Uuid::now_v7();
        let binding = Sha256::digest(b"registration browser").to_vec();
        repository
            .begin_flow(NewPasskeyFlow {
                id: registration_id,
                user_id,
                organization_id,
                kind: PasskeyFlowKind::Registration,
                browser_binding_digest: &binding,
                encrypted_state: b"encrypted registration",
                return_path: "/account/security",
                expires_at: now + chrono::Duration::minutes(5),
                now,
            })
            .await
            .expect("registration flow");
        assert!(
            repository
                .resolve_flow(
                    registration_id,
                    &Sha256::digest(b"different browser"),
                    PasskeyFlowKind::Registration,
                    now,
                )
                .await
                .expect("wrong binding")
                .is_none()
        );
        let registration = repository
            .resolve_flow(
                registration_id,
                &binding,
                PasskeyFlowKind::Registration,
                now,
            )
            .await
            .expect("resolve registration")
            .expect("registration");
        let credential_id = [7_u8; 32];
        let passkey_id = Uuid::now_v7();
        repository
            .complete_registration(NewPasskey {
                id: passkey_id,
                flow: &registration,
                credential_id: &credential_id,
                credential_subject: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc",
                credential: br#"{"credential":"registered"}"#,
                name: "Security key",
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("complete registration");
        let replay = repository
            .complete_registration(NewPasskey {
                id: Uuid::now_v7(),
                flow: &registration,
                credential_id: &[8_u8; 32],
                credential_subject: "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg",
                credential: br#"{"credential":"replayed"}"#,
                name: "Replay",
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await;
        assert!(matches!(replay, Err(DomainError::NotFound)));

        let authentication_id = Uuid::now_v7();
        let authentication_binding = Sha256::digest(b"authentication browser").to_vec();
        repository
            .begin_flow(NewPasskeyFlow {
                id: authentication_id,
                user_id,
                organization_id,
                kind: PasskeyFlowKind::Authentication,
                browser_binding_digest: &authentication_binding,
                encrypted_state: b"encrypted authentication",
                return_path: "/",
                expires_at: now + chrono::Duration::minutes(5),
                now,
            })
            .await
            .expect("authentication flow");
        let authentication = repository
            .resolve_flow(
                authentication_id,
                &authentication_binding,
                PasskeyFlowKind::Authentication,
                now,
            )
            .await
            .expect("resolve authentication")
            .expect("authentication");
        repository
            .record_authentication_failure(&authentication, "digest-only-hint", Uuid::now_v7(), now)
            .await
            .expect("record failure");
        repository
            .complete_authentication(VerifiedPasskeyAuthentication {
                flow: &authentication,
                credential_id: &credential_id,
                credential: br#"{"credential":"updated"}"#,
                sign_count: 7,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await
            .expect("complete authentication");
        let replay = repository
            .complete_authentication(VerifiedPasskeyAuthentication {
                flow: &authentication,
                credential_id: &credential_id,
                credential: br#"{"credential":"replayed"}"#,
                sign_count: 8,
                correlation_id: Uuid::now_v7(),
                now,
            })
            .await;
        assert!(matches!(replay, Err(DomainError::NotFound)));

        repository
            .revoke(organization_id, user_id, passkey_id, Uuid::now_v7(), now)
            .await
            .expect("revoke with local password fallback");
        let stored = sqlx::query!(
            r#"
            SELECT sign_count,revoked_at
            FROM webauthn_credentials
            WHERE id = $1
            "#,
            passkey_id,
        )
        .fetch_one(&pool)
        .await
        .expect("stored credential");
        assert_eq!(stored.sign_count, 7);
        assert_eq!(
            stored
                .revoked_at
                .map(|timestamp| timestamp.timestamp_micros()),
            Some(now.timestamp_micros())
        );
        let actions = sqlx::query_scalar!(
            r#"
            SELECT action
            FROM audit_log
            WHERE resource_type = 'passkey'
            ORDER BY occurred_at,id
            "#,
        )
        .fetch_all(&pool)
        .await
        .expect("audit actions");
        assert_eq!(
            actions,
            vec![
                "auth.passkey.register",
                "auth.passkey.failure",
                "auth.passkey.login",
                "auth.passkey.revoke",
            ]
        );
    }
}
