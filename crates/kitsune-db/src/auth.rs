//! Compile-time checked authentication and first-run setup repository.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult,
    identity::{OrganizationId, UserId},
};
use sqlx::PgPool;
use uuid::Uuid;

/// Account record needed for password authentication. The hash is PHC-formatted
/// and must never be serialized to an API response or log.
pub struct LocalAccount {
    /// User identifier.
    pub user_id: UserId,
    /// Organization identifier.
    pub organization_id: OrganizationId,
    /// Public display name.
    pub display_name: String,
    /// Normalized email.
    pub email: String,
    /// Argon2 PHC string.
    pub password_hash: String,
    /// Account disabled state.
    pub disabled: bool,
    /// Verification state.
    pub email_verified: bool,
}

impl std::fmt::Debug for LocalAccount {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("LocalAccount")
            .field("user_id", &self.user_id)
            .field("organization_id", &self.organization_id)
            .field("display_name", &self.display_name)
            .field("email", &self.email)
            .field("password_hash", &"[REDACTED]")
            .field("disabled", &self.disabled)
            .field("email_verified", &self.email_verified)
            .finish()
    }
}

/// Authenticated session projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionAccount {
    /// Session identifier.
    pub session_id: Uuid,
    /// User identifier.
    pub user_id: UserId,
    /// Organization identifier.
    pub organization_id: OrganizationId,
    /// Public display name.
    pub display_name: String,
    /// Normalized email.
    pub email: String,
    /// Email ownership state.
    pub email_verified: bool,
    /// Session expiry.
    pub expires_at: DateTime<Utc>,
}

/// Persisted TOTP state. The secret is application-encrypted.
#[derive(Debug, Clone)]
pub struct TotpCredential {
    /// Nonce-prefixed authenticated ciphertext.
    pub encrypted_secret: Vec<u8>,
    /// Highest accepted timestep, preventing replay.
    pub last_counter: Option<i64>,
}

/// Safe session-management projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRecord {
    /// Session identifier.
    pub id: Uuid,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Last activity time.
    pub last_seen_at: DateTime<Utc>,
    /// Expiry time.
    pub expires_at: DateTime<Utc>,
}

/// First-run and authentication persistence.
#[derive(Debug, Clone)]
pub struct AuthRepository {
    pool: PgPool,
}

impl AuthRepository {
    /// Wraps a PostgreSQL pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns true before the first account exists.
    pub async fn needs_setup(&self) -> DomainResult<bool> {
        let count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(unavailable)?;
        Ok(count == 0)
    }

    /// Atomically creates the first organization, admin role, user, and grant.
    /// The database lock makes simultaneous first-run requests deterministic.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_first_admin(
        &self,
        organization_id: OrganizationId,
        organization_name: &str,
        organization_slug: &str,
        user_id: UserId,
        email: &str,
        display_name: &str,
        password_hash: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        sqlx::query!("SELECT pg_advisory_xact_lock(1263487811)")
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let count = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM users")
            .fetch_one(&mut *tx)
            .await
            .map_err(unavailable)?;
        if count != 0 {
            return Err(DomainError::Conflict(
                "first-run setup is already complete".into(),
            ));
        }
        sqlx::query!(
            "INSERT INTO organizations (id,name,slug,created_at) VALUES ($1,$2,$3,$4)",
            organization_id.0,
            organization_name,
            organization_slug,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        sqlx::query!(
            r#"
            INSERT INTO users (
                id,organization_id,email,email_normalized,display_name,password_hash,
                email_verified,disabled,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,true,false,'{}',$7,$7)
            "#,
            user_id.0,
            organization_id.0,
            email,
            normalize_email(email),
            display_name,
            password_hash,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let role_id = Uuid::now_v7();
        let permissions: Vec<String> = [
            "event_read",
            "event_manage",
            "challenge_read",
            "challenge_manage",
            "submission_create",
            "submission_manage",
            "scoreboard_read",
            "scoreboard_manage",
            "team_create",
            "team_join",
            "team_captain",
            "team_manage",
            "identity_manage",
            "instance_manage",
            "automation_manage",
            "plugin_manage",
            "audit_read",
            "platform_manage",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect();
        sqlx::query!(
            r#"
            INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
            VALUES ($1,$2,'super_admin','Super Admin',$3,true)
            "#,
            role_id,
            organization_id.0,
            &permissions,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!(
            r#"
            INSERT INTO role_grants (
                id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
            ) VALUES ($1,$2,$3,$4,NULL,NULL,$2,$5)
            "#,
            Uuid::now_v7(),
            user_id.0,
            role_id,
            organization_id.0,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)
    }

    /// Registers a local player and an expiring email-verification token.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_local_player(
        &self,
        organization_slug: &str,
        user_id: UserId,
        email: &str,
        display_name: &str,
        password_hash: &str,
        verification_digest: &[u8],
        verification_expires_at: DateTime<Utc>,
        now: DateTime<Utc>,
    ) -> DomainResult<LocalAccount> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let organization_id = sqlx::query_scalar!(
            "SELECT id FROM organizations WHERE slug = $1 FOR SHARE",
            organization_slug,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        let normalized = normalize_email(email);
        sqlx::query!(
            r#"
            INSERT INTO users (
                id,organization_id,email,email_normalized,display_name,password_hash,
                email_verified,disabled,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,false,false,'{}',$7,$7)
            "#,
            user_id.0,
            organization_id,
            email.trim(),
            normalized,
            display_name.trim(),
            password_hash,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let role_id = Uuid::now_v7();
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
            role_id,
            organization_id,
            &player_permissions,
        )
        .fetch_one(&mut *tx)
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
            organization_id,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!(
            r#"
            INSERT INTO email_verifications (
                id,user_id,token_digest,expires_at,created_at
            ) VALUES ($1,$2,$3,$4,$5)
            "#,
            Uuid::now_v7(),
            user_id.0,
            verification_digest,
            verification_expires_at,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(LocalAccount {
            user_id,
            organization_id: OrganizationId(organization_id),
            display_name: display_name.trim().to_owned(),
            email: normalize_email(email),
            password_hash: password_hash.to_owned(),
            disabled: false,
            email_verified: false,
        })
    }

    /// Consumes an email-verification token once and marks the account verified.
    pub async fn consume_email_verification(
        &self,
        token_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<UserId> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let user_id = sqlx::query_scalar!(
            r#"
            UPDATE email_verifications SET consumed_at = $2
            WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > $2
            RETURNING user_id
            "#,
            token_digest,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        sqlx::query!(
            "UPDATE users SET email_verified = true, updated_at = $2 WHERE id = $1",
            user_id,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(UserId(user_id))
    }

    /// Creates a one-time account-recovery token without revealing whether the
    /// submitted identity exists.
    pub async fn begin_account_recovery(
        &self,
        organization_slug: &str,
        email: &str,
        token_digest: &[u8],
        expires_at: DateTime<Utc>,
        now: DateTime<Utc>,
    ) -> DomainResult<Option<UserId>> {
        let user_id = sqlx::query_scalar!(
            r#"
            SELECT u.id FROM users u
            JOIN organizations o ON o.id = u.organization_id
            WHERE o.slug = $1 AND u.email_normalized = $2 AND u.disabled = false
            "#,
            organization_slug,
            normalize_email(email),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        if let Some(user_id) = user_id {
            sqlx::query!(
                r#"
                INSERT INTO account_recovery_tokens (
                    id,user_id,token_digest,expires_at,created_at
                ) VALUES ($1,$2,$3,$4,$5)
                "#,
                Uuid::now_v7(),
                user_id,
                token_digest,
                expires_at,
                now,
            )
            .execute(&self.pool)
            .await
            .map_err(unavailable)?;
        }
        Ok(user_id.map(UserId))
    }

    /// Atomically consumes a recovery token, replaces the password, and revokes
    /// every existing session.
    pub async fn complete_account_recovery(
        &self,
        token_digest: &[u8],
        password_hash: &str,
        now: DateTime<Utc>,
    ) -> DomainResult<UserId> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let user_id = sqlx::query_scalar!(
            r#"
            UPDATE account_recovery_tokens SET consumed_at = $2
            WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > $2
            RETURNING user_id
            "#,
            token_digest,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        sqlx::query!(
            "UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1",
            user_id,
            password_hash,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!(
            "UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
            user_id,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(UserId(user_id))
    }

    /// Finds a local credential by tenant slug and normalized email.
    pub async fn local_account(
        &self,
        organization_slug: &str,
        email: &str,
    ) -> DomainResult<Option<LocalAccount>> {
        let row = sqlx::query!(
            r#"
            SELECT u.id, u.organization_id, u.display_name, u.email_normalized,
                   u.password_hash, u.disabled, u.email_verified
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            WHERE o.slug = $1 AND u.email_normalized = $2
            "#,
            organization_slug,
            normalize_email(email),
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(row.and_then(|row| {
            row.password_hash.map(|password_hash| LocalAccount {
                user_id: UserId(row.id),
                organization_id: OrganizationId(row.organization_id),
                display_name: row.display_name,
                email: row.email_normalized,
                password_hash,
                disabled: row.disabled,
                email_verified: row.email_verified,
            })
        }))
    }

    /// Creates a server-side opaque session from token and CSRF digests.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_session(
        &self,
        session_id: Uuid,
        user_id: UserId,
        token_digest: &[u8],
        csrf_digest: &[u8],
        user_agent_digest: Option<&[u8]>,
        expires_at: DateTime<Utc>,
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        sqlx::query!(
            r#"
            INSERT INTO sessions (
                id,user_id,token_digest,csrf_digest,user_agent_digest,created_at,
                last_seen_at,expires_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7)
            "#,
            session_id,
            user_id.0,
            token_digest,
            csrf_digest,
            user_agent_digest,
            now,
            expires_at,
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(unavailable)
    }

    /// Resolves an active session and touches its last-seen time.
    pub async fn session_by_token(
        &self,
        token_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<Option<(SessionAccount, Vec<u8>)>> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let row = sqlx::query!(
            r#"
            SELECT s.id AS session_id, s.expires_at, s.csrf_digest,
                   u.id AS user_id, u.organization_id, u.display_name, u.email_normalized,
                   u.email_verified
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_digest = $1 AND s.revoked_at IS NULL
              AND s.expires_at > $2 AND u.disabled = false
            FOR UPDATE OF s
            "#,
            token_digest,
            now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?;
        let Some(row) = row else {
            tx.commit().await.map_err(unavailable)?;
            return Ok(None);
        };
        sqlx::query!(
            "UPDATE sessions SET last_seen_at = $1 WHERE id = $2",
            now,
            row.session_id,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(Some((
            SessionAccount {
                session_id: row.session_id,
                user_id: UserId(row.user_id),
                organization_id: OrganizationId(row.organization_id),
                display_name: row.display_name,
                email: row.email_normalized,
                email_verified: row.email_verified,
                expires_at: row.expires_at,
            },
            row.csrf_digest,
        )))
    }

    /// Revokes one session by token digest.
    pub async fn revoke_session(
        &self,
        token_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        sqlx::query!(
            "UPDATE sessions SET revoked_at = $1 WHERE token_digest = $2 AND revoked_at IS NULL",
            now,
            token_digest,
        )
        .execute(&self.pool)
        .await
        .map(|_| ())
        .map_err(unavailable)
    }

    /// Lists active sessions for account self-service.
    pub async fn active_sessions(
        &self,
        user_id: UserId,
        now: DateTime<Utc>,
    ) -> DomainResult<Vec<SessionRecord>> {
        let rows = sqlx::query_as!(
            SessionRecord,
            r#"
            SELECT id,created_at,last_seen_at,expires_at
            FROM sessions
            WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
            ORDER BY last_seen_at DESC
            "#,
            user_id.0,
            now,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(rows)
    }

    /// Revokes an account-owned session by ID.
    pub async fn revoke_owned_session(
        &self,
        user_id: UserId,
        session_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<bool> {
        let changed = sqlx::query!(
            r#"
            UPDATE sessions SET revoked_at = $3
            WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            "#,
            session_id,
            user_id.0,
            now,
        )
        .execute(&self.pool)
        .await
        .map_err(unavailable)?
        .rows_affected();
        Ok(changed == 1)
    }

    /// Replaces TOTP and recovery-code state after a successful setup proof.
    pub async fn enable_totp(
        &self,
        user_id: UserId,
        encrypted_secret: &[u8],
        recovery_digests: &[Vec<u8>],
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        sqlx::query!(
            r#"
            INSERT INTO totp_credentials (user_id,encrypted_secret,enabled_at,last_counter)
            VALUES ($1,$2,$3,NULL)
            ON CONFLICT (user_id) DO UPDATE SET
                encrypted_secret = EXCLUDED.encrypted_secret,
                enabled_at = EXCLUDED.enabled_at,
                last_counter = NULL
            "#,
            user_id.0,
            encrypted_secret,
            now,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        sqlx::query!("DELETE FROM recovery_codes WHERE user_id = $1", user_id.0)
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        for digest in recovery_digests {
            sqlx::query!(
                "INSERT INTO recovery_codes (user_id,code_digest) VALUES ($1,$2)",
                user_id.0,
                digest,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }
        tx.commit().await.map_err(unavailable)
    }

    /// Loads encrypted TOTP material for a user.
    pub async fn totp_credential(&self, user_id: UserId) -> DomainResult<Option<TotpCredential>> {
        sqlx::query_as!(
            TotpCredential,
            "SELECT encrypted_secret,last_counter FROM totp_credentials WHERE user_id = $1",
            user_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Advances the accepted TOTP timestep iff it was not previously used.
    pub async fn accept_totp_counter(&self, user_id: UserId, counter: i64) -> DomainResult<bool> {
        let changed = sqlx::query!(
            r#"
            UPDATE totp_credentials SET last_counter = $2
            WHERE user_id = $1 AND (last_counter IS NULL OR last_counter < $2)
            "#,
            user_id.0,
            counter,
        )
        .execute(&self.pool)
        .await
        .map_err(unavailable)?
        .rows_affected();
        Ok(changed == 1)
    }

    /// Atomically consumes one recovery code.
    pub async fn consume_recovery_code(
        &self,
        user_id: UserId,
        code_digest: &[u8],
        now: DateTime<Utc>,
    ) -> DomainResult<bool> {
        let changed = sqlx::query!(
            r#"
            UPDATE recovery_codes SET consumed_at = $3
            WHERE user_id = $1 AND code_digest = $2 AND consumed_at IS NULL
            "#,
            user_id.0,
            code_digest,
            now,
        )
        .execute(&self.pool)
        .await
        .map_err(unavailable)?
        .rows_affected();
        Ok(changed == 1)
    }

    /// Loads all permission keys applicable in organization and optional event
    /// scope. Platform grants automatically apply.
    pub async fn permission_keys(
        &self,
        user_id: UserId,
        organization_id: OrganizationId,
        event_id: Option<Uuid>,
    ) -> DomainResult<Vec<String>> {
        let rows = sqlx::query!(
            r#"
            SELECT DISTINCT unnest(r.permissions) AS "permission!"
            FROM role_grants g
            JOIN roles r ON r.id = g.role_id
            WHERE g.user_id = $1 AND g.organization_id = $2
              AND (g.event_id IS NULL OR g.event_id = $3)
            "#,
            user_id.0,
            organization_id.0,
            event_id,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)?;
        Ok(rows.into_iter().map(|row| row.permission).collect())
    }
}

/// Applies stable conservative email normalization. Provider-specific aliasing
/// is deliberately not attempted.
pub fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres auth: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("identity already exists".into())
    } else {
        unavailable(error)
    }
}
