//! Tenant-safe organizer identity and authorization administration.

use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError, DomainResult, EventEnvelope,
    events::DomainEvent,
    identity::{EventId, OrganizationId, TeamId, UserId},
};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::resources::persist_audit_event;

/// Safe organizer account projection.
#[derive(Debug, Clone, PartialEq)]
pub struct ManagedUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub email_verified: bool,
    pub disabled: bool,
    pub custom_fields: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Safe reusable role projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedRole {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub permissions: Vec<String>,
    pub built_in: bool,
}

/// Safe scoped assignment projection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedGrant {
    pub id: Uuid,
    pub user_id: Uuid,
    pub role_id: Uuid,
    pub role_key: String,
    pub role_name: String,
    pub event_id: Option<Uuid>,
    pub team_id: Option<Uuid>,
    pub granted_by: Option<Uuid>,
    pub granted_at: DateTime<Utc>,
}

/// New local account command.
pub struct CreateUser<'a> {
    pub organization_id: OrganizationId,
    pub actor: UserId,
    pub user_id: UserId,
    pub email: &'a str,
    pub email_normalized: &'a str,
    pub display_name: &'a str,
    pub password_hash: &'a str,
    pub email_verified: bool,
    pub custom_fields: &'a Value,
    pub now: DateTime<Utc>,
}

/// Account profile and lifecycle command.
pub struct UpdateUser<'a> {
    pub organization_id: OrganizationId,
    pub actor: UserId,
    pub user_id: UserId,
    pub display_name: &'a str,
    pub email_verified: bool,
    pub disabled: bool,
    pub custom_fields: &'a Value,
    pub now: DateTime<Utc>,
}

/// Custom-role create or update command.
pub struct RoleMutation<'a> {
    pub organization_id: OrganizationId,
    pub actor: UserId,
    pub role_id: Uuid,
    pub key: &'a str,
    pub name: &'a str,
    pub permissions: &'a [String],
    pub now: DateTime<Utc>,
}

/// Scoped role-assignment command.
pub struct CreateGrant {
    pub organization_id: OrganizationId,
    pub actor: UserId,
    pub grant_id: Uuid,
    pub user_id: UserId,
    pub role_id: Uuid,
    pub event_id: Option<EventId>,
    pub team_id: Option<TeamId>,
    pub now: DateTime<Utc>,
}

/// PostgreSQL identity-administration repository.
#[derive(Debug, Clone)]
pub struct IdentityAdminRepository {
    pool: PgPool,
}

impl IdentityAdminRepository {
    /// Wraps an existing pool.
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Lists every account in stable creation order.
    pub async fn users(&self, organization_id: OrganizationId) -> DomainResult<Vec<ManagedUser>> {
        sqlx::query_as!(
            ManagedUser,
            r#"
            SELECT id,email,display_name,email_verified,disabled,custom_fields,
                   created_at,updated_at
            FROM users
            WHERE organization_id = $1
            ORDER BY created_at DESC,id DESC
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Returns whether the tenant user currently has unscoped platform authority.
    pub async fn user_has_platform_authority(
        &self,
        organization_id: OrganizationId,
        user_id: UserId,
    ) -> DomainResult<bool> {
        sqlx::query_scalar!(
            r#"
            SELECT EXISTS(
                SELECT 1
                FROM role_grants g
                JOIN roles r ON r.id = g.role_id
                JOIN users u ON u.id = g.user_id
                WHERE g.organization_id = $1 AND g.user_id = $2
                  AND u.organization_id = $1
                  AND g.event_id IS NULL AND g.team_id IS NULL
                  AND 'platform_manage' = ANY(r.permissions)
            ) AS "exists!"
            "#,
            organization_id.0,
            user_id.0,
        )
        .fetch_one(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Returns whether the referenced tenant-visible role grants platform authority.
    pub async fn role_has_platform_authority(
        &self,
        organization_id: OrganizationId,
        role_id: Uuid,
    ) -> DomainResult<bool> {
        role_contains_platform_permission_from_pool(&self.pool, organization_id, role_id).await
    }

    /// Returns whether the referenced grant carries platform authority.
    pub async fn grant_has_platform_authority(
        &self,
        organization_id: OrganizationId,
        grant_id: Uuid,
    ) -> DomainResult<bool> {
        sqlx::query_scalar!(
            r#"
            SELECT ('platform_manage' = ANY(r.permissions)) AS "platform!"
            FROM role_grants g
            JOIN roles r ON r.id = g.role_id
            JOIN users u ON u.id = g.user_id
            WHERE g.id = $1 AND g.organization_id = $2 AND u.organization_id = $2
            "#,
            grant_id,
            organization_id.0,
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)
    }

    /// Creates a local account with the built-in player role.
    pub async fn create_user(
        &self,
        command: CreateUser<'_>,
    ) -> DomainResult<(ManagedUser, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let user = sqlx::query_as!(
            ManagedUser,
            r#"
            INSERT INTO users (
                id,organization_id,email,email_normalized,display_name,password_hash,
                email_verified,disabled,custom_fields,created_at,updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$9)
            RETURNING id,email,display_name,email_verified,disabled,custom_fields,
                      created_at,updated_at
            "#,
            command.user_id.0,
            command.organization_id.0,
            command.email,
            command.email_normalized,
            command.display_name,
            command.password_hash,
            command.email_verified,
            command.custom_fields,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let player_role_id = ensure_player_role(&mut tx, command.organization_id).await?;
        sqlx::query!(
            r#"
            INSERT INTO role_grants (
                id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
            ) VALUES ($1,$2,$3,$4,NULL,NULL,$5,$6)
            "#,
            Uuid::now_v7(),
            command.user_id.0,
            player_role_id,
            command.organization_id.0,
            command.actor.0,
            command.now,
        )
        .execute(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            command.organization_id,
            None,
            Some(command.actor),
            Uuid::now_v7(),
            command.now,
            DomainEvent::UserCreated {
                user_id: command.user_id,
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "identity.user.create",
            "user",
            &command.user_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((user, envelope))
    }

    /// Updates an account and revokes active credentials when it is disabled.
    pub async fn update_user(
        &self,
        command: UpdateUser<'_>,
    ) -> DomainResult<(ManagedUser, EventEnvelope)> {
        if command.actor == command.user_id && command.disabled {
            return Err(DomainError::Conflict(
                "an organizer cannot disable their own active account".into(),
            ));
        }
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let was_disabled = lock_user(&mut tx, command.organization_id, command.user_id).await?;
        if !was_disabled && command.disabled {
            ensure_another_platform_manager(&mut tx, command.organization_id, command.user_id)
                .await?;
        }
        let user = sqlx::query_as!(
            ManagedUser,
            r#"
            UPDATE users
            SET display_name = $3,email_verified = $4,disabled = $5,
                custom_fields = $6,updated_at = $7
            WHERE id = $1 AND organization_id = $2
            RETURNING id,email,display_name,email_verified,disabled,custom_fields,
                      created_at,updated_at
            "#,
            command.user_id.0,
            command.organization_id.0,
            command.display_name,
            command.email_verified,
            command.disabled,
            command.custom_fields,
            command.now,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?
        .ok_or(DomainError::NotFound)?;
        if command.disabled {
            sqlx::query!(
                "UPDATE sessions SET revoked_at = COALESCE(revoked_at,$2) WHERE user_id = $1",
                command.user_id.0,
                command.now,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
            sqlx::query!(
                "UPDATE api_tokens SET revoked_at = COALESCE(revoked_at,$2) WHERE user_id = $1",
                command.user_id.0,
                command.now,
            )
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        }
        let state = if command.disabled {
            "disabled"
        } else {
            "updated"
        };
        let envelope = EventEnvelope::new(
            command.organization_id,
            None,
            Some(command.actor),
            Uuid::now_v7(),
            command.now,
            DomainEvent::UserChanged {
                user_id: command.user_id,
                state: state.into(),
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "identity.user.update",
            "user",
            &command.user_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((user, envelope))
    }

    /// Lists organization and platform roles.
    pub async fn roles(&self, organization_id: OrganizationId) -> DomainResult<Vec<ManagedRole>> {
        sqlx::query_as!(
            ManagedRole,
            r#"
            SELECT id,key,name,permissions,built_in
            FROM roles
            WHERE organization_id = $1 OR organization_id IS NULL
            ORDER BY built_in DESC,name,id
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Creates a tenant-owned custom role.
    pub async fn create_role(
        &self,
        command: RoleMutation<'_>,
    ) -> DomainResult<(ManagedRole, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let role = sqlx::query_as!(
            ManagedRole,
            r#"
            INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
            VALUES ($1,$2,$3,$4,$5,false)
            RETURNING id,key,name,permissions,built_in
            "#,
            command.role_id,
            command.organization_id.0,
            command.key,
            command.name,
            command.permissions,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = role_event(&command, "created");
        persist_audit_event(
            &mut tx,
            &envelope,
            "authorization.role.create",
            "role",
            &command.role_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((role, envelope))
    }

    /// Updates a tenant-owned custom role without mutating built-ins.
    pub async fn update_role(
        &self,
        command: RoleMutation<'_>,
    ) -> DomainResult<(ManagedRole, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        reject_built_in_role(&mut tx, command.organization_id, command.role_id).await?;
        let role = sqlx::query_as!(
            ManagedRole,
            r#"
            UPDATE roles
            SET key = $3,name = $4,permissions = $5
            WHERE id = $1 AND organization_id = $2 AND built_in = false
            RETURNING id,key,name,permissions,built_in
            "#,
            command.role_id,
            command.organization_id.0,
            command.key,
            command.name,
            command.permissions,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?
        .ok_or(DomainError::NotFound)?;
        let envelope = role_event(&command, "updated");
        persist_audit_event(
            &mut tx,
            &envelope,
            "authorization.role.update",
            "role",
            &command.role_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((role, envelope))
    }

    /// Deletes an unassigned custom role.
    pub async fn delete_role(
        &self,
        organization_id: OrganizationId,
        actor: UserId,
        role_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        reject_built_in_role(&mut tx, organization_id, role_id).await?;
        let assigned = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM role_grants WHERE role_id = $1) AS \"exists!\"",
            role_id,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(unavailable)?;
        if assigned {
            return Err(DomainError::Conflict(
                "role is assigned; revoke its grants before deletion".into(),
            ));
        }
        let deleted = sqlx::query!(
            "DELETE FROM roles WHERE id = $1 AND organization_id = $2 AND built_in = false",
            role_id,
            organization_id.0,
        )
        .execute(&mut *tx)
        .await
        .map_err(unavailable)?;
        if deleted.rows_affected() == 0 {
            return Err(DomainError::NotFound);
        }
        let envelope = EventEnvelope::new(
            organization_id,
            None,
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::RoleChanged {
                role_id,
                state: "deleted".into(),
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "authorization.role.delete",
            "role",
            &role_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }

    /// Lists scoped grants with their role labels.
    pub async fn grants(&self, organization_id: OrganizationId) -> DomainResult<Vec<ManagedGrant>> {
        sqlx::query_as!(
            ManagedGrant,
            r#"
            SELECT g.id,g.user_id,g.role_id,r.key AS role_key,r.name AS role_name,
                   g.event_id,g.team_id,g.granted_by,g.granted_at
            FROM role_grants g
            JOIN roles r ON r.id = g.role_id
            JOIN users u ON u.id = g.user_id
            WHERE g.organization_id = $1 AND u.organization_id = $1
            ORDER BY g.granted_at DESC,g.id DESC
            "#,
            organization_id.0,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(unavailable)
    }

    /// Adds one validated scoped role assignment.
    pub async fn create_grant(
        &self,
        command: CreateGrant,
    ) -> DomainResult<(ManagedGrant, EventEnvelope)> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        lock_user(&mut tx, command.organization_id, command.user_id).await?;
        let platform_role =
            role_contains_platform_permission(&mut tx, command.organization_id, command.role_id)
                .await?;
        if platform_role && (command.event_id.is_some() || command.team_id.is_some()) {
            return Err(DomainError::Validation(
                "platform authority cannot be narrowed to event or team scope".into(),
            ));
        }
        validate_scope(
            &mut tx,
            command.organization_id,
            command.event_id,
            command.team_id,
        )
        .await?;
        let grant = sqlx::query_as!(
            ManagedGrant,
            r#"
            WITH inserted AS (
                INSERT INTO role_grants (
                    id,user_id,role_id,organization_id,event_id,team_id,granted_by,granted_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING *
            )
            SELECT g.id,g.user_id,g.role_id,r.key AS role_key,r.name AS role_name,
                   g.event_id,g.team_id,g.granted_by,g.granted_at
            FROM inserted g
            JOIN roles r ON r.id = g.role_id
            "#,
            command.grant_id,
            command.user_id.0,
            command.role_id,
            command.organization_id.0,
            command.event_id.map(|id| id.0),
            command.team_id.map(|id| id.0),
            command.actor.0,
            command.now,
        )
        .fetch_one(&mut *tx)
        .await
        .map_err(conflict_or_unavailable)?;
        let envelope = EventEnvelope::new(
            command.organization_id,
            command.event_id,
            Some(command.actor),
            Uuid::now_v7(),
            command.now,
            DomainEvent::RoleGrantChanged {
                grant_id: command.grant_id,
                user_id: command.user_id,
                state: "created".into(),
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "authorization.grant.create",
            "role_grant",
            &command.grant_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok((grant, envelope))
    }

    /// Revokes one grant while preserving at least one active platform manager.
    pub async fn revoke_grant(
        &self,
        organization_id: OrganizationId,
        actor: UserId,
        grant_id: Uuid,
        now: DateTime<Utc>,
    ) -> DomainResult<EventEnvelope> {
        let mut tx = self.pool.begin().await.map_err(unavailable)?;
        let grant = sqlx::query!(
            r#"
            SELECT g.user_id,g.event_id,g.team_id,
                   ('platform_manage' = ANY(r.permissions)) AS "platform!"
            FROM role_grants g
            JOIN roles r ON r.id = g.role_id
            JOIN users u ON u.id = g.user_id
            WHERE g.id = $1 AND g.organization_id = $2 AND u.organization_id = $2
            FOR UPDATE OF g
            "#,
            grant_id,
            organization_id.0,
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(unavailable)?
        .ok_or(DomainError::NotFound)?;
        if grant.platform {
            ensure_another_platform_manager(&mut tx, organization_id, UserId(grant.user_id))
                .await?;
        }
        sqlx::query!("DELETE FROM role_grants WHERE id = $1", grant_id)
            .execute(&mut *tx)
            .await
            .map_err(unavailable)?;
        let envelope = EventEnvelope::new(
            organization_id,
            grant.event_id.map(EventId),
            Some(actor),
            Uuid::now_v7(),
            now,
            DomainEvent::RoleGrantChanged {
                grant_id,
                user_id: UserId(grant.user_id),
                state: "revoked".into(),
            },
        );
        persist_audit_event(
            &mut tx,
            &envelope,
            "authorization.grant.revoke",
            "role_grant",
            &grant_id.to_string(),
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(envelope)
    }
}

async fn ensure_player_role(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
) -> DomainResult<Uuid> {
    let role_id = Uuid::now_v7();
    let permissions = vec![
        "event_read".to_owned(),
        "challenge_read".to_owned(),
        "submission_create".to_owned(),
        "scoreboard_read".to_owned(),
        "team_create".to_owned(),
        "team_join".to_owned(),
        "team_captain".to_owned(),
    ];
    sqlx::query_scalar!(
        r#"
        INSERT INTO roles (id,organization_id,key,name,permissions,built_in)
        VALUES ($1,$2,'player','Player',$3,true)
        ON CONFLICT (organization_id,key) DO UPDATE
        SET permissions = EXCLUDED.permissions
        RETURNING id
        "#,
        role_id,
        organization_id.0,
        &permissions,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)
}

async fn lock_user(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    user_id: UserId,
) -> DomainResult<bool> {
    sqlx::query_scalar!(
        "SELECT disabled FROM users WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        user_id.0,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)
}

async fn ensure_another_platform_manager(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    excluded_user: UserId,
) -> DomainResult<()> {
    let exists = sqlx::query_scalar!(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM users u
            JOIN role_grants g ON g.user_id = u.id AND g.organization_id = u.organization_id
            JOIN roles r ON r.id = g.role_id
            WHERE u.organization_id = $1 AND u.id <> $2 AND u.disabled = false
              AND g.event_id IS NULL AND g.team_id IS NULL
              AND 'platform_manage' = ANY(r.permissions)
        ) AS "exists!"
        "#,
        organization_id.0,
        excluded_user.0,
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(unavailable)?;
    if exists {
        Ok(())
    } else {
        Err(DomainError::Conflict(
            "the organization must retain an active platform manager".into(),
        ))
    }
}

async fn reject_built_in_role(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    role_id: Uuid,
) -> DomainResult<()> {
    let built_in = sqlx::query_scalar!(
        "SELECT built_in FROM roles WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        role_id,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)?;
    if built_in {
        Err(DomainError::Conflict(
            "built-in roles are managed by Kitsune".into(),
        ))
    } else {
        Ok(())
    }
}

async fn role_contains_platform_permission(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    role_id: Uuid,
) -> DomainResult<bool> {
    sqlx::query_scalar!(
        r#"
        SELECT ('platform_manage' = ANY(permissions)) AS "platform!"
        FROM roles
        WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)
        FOR SHARE
        "#,
        role_id,
        organization_id.0,
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)
}

async fn role_contains_platform_permission_from_pool(
    pool: &PgPool,
    organization_id: OrganizationId,
    role_id: Uuid,
) -> DomainResult<bool> {
    sqlx::query_scalar!(
        r#"
        SELECT ('platform_manage' = ANY(permissions)) AS "platform!"
        FROM roles
        WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)
        "#,
        role_id,
        organization_id.0,
    )
    .fetch_optional(pool)
    .await
    .map_err(unavailable)?
    .ok_or(DomainError::NotFound)
}

async fn validate_scope(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: OrganizationId,
    event_id: Option<EventId>,
    team_id: Option<TeamId>,
) -> DomainResult<()> {
    if let Some(event_id) = event_id {
        let owned = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM events WHERE id = $1 AND organization_id = $2) AS \"exists!\"",
            event_id.0,
            organization_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
        if !owned {
            return Err(DomainError::NotFound);
        }
    }
    if let Some(team_id) = team_id {
        let owned = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM teams WHERE id = $1 AND organization_id = $2) AS \"exists!\"",
            team_id.0,
            organization_id.0,
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
        if !owned {
            return Err(DomainError::NotFound);
        }
    }
    Ok(())
}

fn role_event(command: &RoleMutation<'_>, state: &str) -> EventEnvelope {
    EventEnvelope::new(
        command.organization_id,
        None,
        Some(command.actor),
        Uuid::now_v7(),
        command.now,
        DomainEvent::RoleChanged {
            role_id: command.role_id,
            state: state.into(),
        },
    )
}

fn unavailable(error: impl std::fmt::Display) -> DomainError {
    DomainError::Unavailable(format!("postgres identity administration: {error}"))
}

fn conflict_or_unavailable(error: sqlx::Error) -> DomainError {
    if error
        .as_database_error()
        .and_then(sqlx::error::DatabaseError::code)
        .as_deref()
        == Some("23505")
    {
        DomainError::Conflict("identity resource already exists".into())
    } else {
        unavailable(error)
    }
}
