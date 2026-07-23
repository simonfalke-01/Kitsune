//! Organizer account, custom-role, and scoped-grant administration.

use std::collections::BTreeSet;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{DateTime, Utc};
use kitsune_core::{
    DomainError,
    identity::{EventId, TeamId, UserId},
};
use kitsune_db::{
    auth::normalize_email,
    identity_admin::{
        CreateGrant, CreateUser, IdentityAdminRepository, ManagedGrant, ManagedRole, ManagedUser,
        RoleMutation, UpdateUser,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{Actor, ApiError, ApiResult, AppState, ErrorBody, auth::validate_user_fields};

const CUSTOM_ROLE_PERMISSIONS: [&str; 17] = [
    "audit_read",
    "automation_manage",
    "challenge_manage",
    "challenge_read",
    "event_manage",
    "event_read",
    "identity_manage",
    "instance_manage",
    "plugin_manage",
    "scoreboard_manage",
    "scoreboard_read",
    "submission_create",
    "submission_manage",
    "team_captain",
    "team_create",
    "team_join",
    "team_manage",
];
const MAX_CUSTOM_FIELDS_BYTES: usize = 16 * 1_024;
const MAX_CUSTOM_FIELDS: usize = 32;

/// Safe organizer account document.
#[derive(Serialize, ToSchema)]
pub struct ManagedUserResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub email_verified: bool,
    pub disabled: bool,
    pub custom_fields: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Organizer-created local account input.
#[derive(Deserialize, ToSchema)]
pub struct CreateManagedUserRequest {
    pub email: String,
    pub display_name: String,
    #[schema(write_only)]
    pub password: String,
    #[serde(default)]
    pub email_verified: bool,
    #[serde(default = "empty_object")]
    pub custom_fields: Value,
}

/// Editable account profile and lifecycle input.
#[derive(Deserialize, ToSchema)]
pub struct UpdateManagedUserRequest {
    pub display_name: String,
    pub email_verified: bool,
    pub disabled: bool,
    #[serde(default = "empty_object")]
    pub custom_fields: Value,
}

/// Reusable authorization role.
#[derive(Serialize, ToSchema)]
pub struct ManagedRoleResponse {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub permissions: Vec<String>,
    pub built_in: bool,
}

/// Custom-role create/update input.
#[derive(Deserialize, ToSchema)]
pub struct RoleMutationRequest {
    pub key: String,
    pub name: String,
    pub permissions: Vec<String>,
}

/// Permission available to custom roles.
#[derive(Serialize, ToSchema)]
pub struct PermissionResponse {
    pub key: &'static str,
}

/// Scoped role assignment.
#[derive(Serialize, ToSchema)]
pub struct ManagedGrantResponse {
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

/// Scoped role-assignment input.
#[derive(Deserialize, ToSchema)]
pub struct CreateGrantRequest {
    #[serde(rename = "user_id")]
    #[schema(rename = "user_id")]
    pub user: Uuid,
    #[serde(rename = "role_id")]
    #[schema(rename = "role_id")]
    pub role: Uuid,
    #[serde(rename = "event_id")]
    #[schema(rename = "event_id")]
    pub event: Option<Uuid>,
    #[serde(rename = "team_id")]
    #[schema(rename = "team_id")]
    pub team: Option<Uuid>,
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/users",
    tag = "identity administration",
    responses(
        (status = 200, body = [ManagedUserResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_users(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<ManagedUserResponse>>> {
    actor.require("identity_manage")?;
    let users = repository(&state)
        .users(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(users.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/users",
    tag = "identity administration",
    request_body = CreateManagedUserRequest,
    responses(
        (status = 201, body = ManagedUserResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_user(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateManagedUserRequest>,
) -> ApiResult<(StatusCode, Json<ManagedUserResponse>)> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    validate_user_fields(&request.display_name, &request.email)?;
    validate_custom_fields(&request.custom_fields)?;
    let password_hash = state
        .auth
        .hash_password(request.password)
        .await
        .map_err(ApiError::from)?;
    let user_id = UserId::new();
    let now = Utc::now();
    let normalized_email = normalize_email(&request.email);
    let (user, event) = repository(&state)
        .create_user(CreateUser {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            user_id,
            email: request.email.trim(),
            email_normalized: &normalized_email,
            display_name: request.display_name.trim(),
            password_hash: &password_hash,
            email_verified: request.email_verified,
            custom_fields: &request.custom_fields,
            now,
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(user.into())))
}

#[utoipa::path(
    patch,
    path = "/api/v1/admin/users/{user_id}",
    tag = "identity administration",
    params(("user_id" = Uuid, Path, description = "Managed user ID")),
    request_body = UpdateManagedUserRequest,
    responses(
        (status = 200, body = ManagedUserResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_user(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
    Json(request): Json<UpdateManagedUserRequest>,
) -> ApiResult<Json<ManagedUserResponse>> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let repository = repository(&state);
    if repository
        .user_has_platform_authority(actor.session.account.organization_id, UserId(user_id))
        .await
        .map_err(ApiError::from)?
    {
        actor.require("platform_manage")?;
    }
    validate_display_name(&request.display_name)?;
    validate_custom_fields(&request.custom_fields)?;
    let (user, event) = repository
        .update_user(UpdateUser {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            user_id: UserId(user_id),
            display_name: request.display_name.trim(),
            email_verified: request.email_verified,
            disabled: request.disabled,
            custom_fields: &request.custom_fields,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(user.into()))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/permissions",
    tag = "identity administration",
    responses(
        (status = 200, body = [PermissionResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_permissions(actor: Actor) -> ApiResult<Json<Vec<PermissionResponse>>> {
    actor.require("identity_manage")?;
    Ok(Json(
        CUSTOM_ROLE_PERMISSIONS
            .into_iter()
            .map(|key| PermissionResponse { key })
            .collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/roles",
    tag = "identity administration",
    responses(
        (status = 200, body = [ManagedRoleResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_roles(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<ManagedRoleResponse>>> {
    actor.require("identity_manage")?;
    let roles = repository(&state)
        .roles(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(roles.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/roles",
    tag = "identity administration",
    request_body = RoleMutationRequest,
    responses(
        (status = 201, body = ManagedRoleResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_role(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<RoleMutationRequest>,
) -> ApiResult<(StatusCode, Json<ManagedRoleResponse>)> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let role_id = Uuid::now_v7();
    let (key, name, permissions) = validate_role(request)?;
    let (role, event) = repository(&state)
        .create_role(RoleMutation {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            role_id,
            key: &key,
            name: &name,
            permissions: &permissions,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(role.into())))
}

#[utoipa::path(
    put,
    path = "/api/v1/admin/roles/{role_id}",
    tag = "identity administration",
    params(("role_id" = Uuid, Path, description = "Custom role ID")),
    request_body = RoleMutationRequest,
    responses(
        (status = 200, body = ManagedRoleResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn update_role(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(role_id): Path<Uuid>,
    Json(request): Json<RoleMutationRequest>,
) -> ApiResult<Json<ManagedRoleResponse>> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let (key, name, permissions) = validate_role(request)?;
    let (role, event) = repository(&state)
        .update_role(RoleMutation {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            role_id,
            key: &key,
            name: &name,
            permissions: &permissions,
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(role.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/roles/{role_id}",
    tag = "identity administration",
    params(("role_id" = Uuid, Path, description = "Custom role ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn delete_role(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(role_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let event = repository(&state)
        .delete_role(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            role_id,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/role-grants",
    tag = "identity administration",
    responses(
        (status = 200, body = [ManagedGrantResponse]),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody)
    )
)]
pub(crate) async fn list_grants(
    State(state): State<AppState>,
    actor: Actor,
) -> ApiResult<Json<Vec<ManagedGrantResponse>>> {
    actor.require("identity_manage")?;
    let grants = repository(&state)
        .grants(actor.session.account.organization_id)
        .await
        .map_err(ApiError::from)?;
    Ok(Json(grants.into_iter().map(Into::into).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/role-grants",
    tag = "identity administration",
    request_body = CreateGrantRequest,
    responses(
        (status = 201, body = ManagedGrantResponse),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody),
        (status = 422, body = ErrorBody)
    )
)]
pub(crate) async fn create_grant(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Json(request): Json<CreateGrantRequest>,
) -> ApiResult<(StatusCode, Json<ManagedGrantResponse>)> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let repository = repository(&state);
    if repository
        .role_has_platform_authority(actor.session.account.organization_id, request.role)
        .await
        .map_err(ApiError::from)?
    {
        actor.require("platform_manage")?;
    }
    let (grant, event) = repository
        .create_grant(CreateGrant {
            organization_id: actor.session.account.organization_id,
            actor: actor.session.account.user_id,
            grant_id: Uuid::now_v7(),
            user_id: UserId(request.user),
            role_id: request.role,
            event_id: request.event.map(EventId),
            team_id: request.team.map(TeamId),
            now: Utc::now(),
        })
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok((StatusCode::CREATED, Json(grant.into())))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/role-grants/{grant_id}",
    tag = "identity administration",
    params(("grant_id" = Uuid, Path, description = "Role grant ID")),
    responses(
        (status = 204),
        (status = 401, body = ErrorBody),
        (status = 403, body = ErrorBody),
        (status = 404, body = ErrorBody),
        (status = 409, body = ErrorBody)
    )
)]
pub(crate) async fn revoke_grant(
    State(state): State<AppState>,
    actor: Actor,
    headers: HeaderMap,
    Path(grant_id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    actor.require("identity_manage")?;
    actor.require_csrf(&headers)?;
    let repository = repository(&state);
    if repository
        .grant_has_platform_authority(actor.session.account.organization_id, grant_id)
        .await
        .map_err(ApiError::from)?
    {
        actor.require("platform_manage")?;
    }
    let event = repository
        .revoke_grant(
            actor.session.account.organization_id,
            actor.session.account.user_id,
            grant_id,
            Utc::now(),
        )
        .await
        .map_err(ApiError::from)?;
    state
        .event_bus
        .publish(event)
        .await
        .map_err(ApiError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

fn repository(state: &AppState) -> IdentityAdminRepository {
    IdentityAdminRepository::new(state.db.pool().clone())
}

fn validate_role(request: RoleMutationRequest) -> ApiResult<(String, String, Vec<String>)> {
    let key = request.key.trim();
    if key.is_empty()
        || key.len() > 63
        || !key
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
        || !key.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
    {
        return Err(ApiError::from(DomainError::Validation(
            "role key must start with a lowercase letter and contain only lowercase letters, digits, or underscores".into(),
        )));
    }
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control) {
        return Err(ApiError::from(DomainError::Validation(
            "role name must contain 1 to 80 printable characters".into(),
        )));
    }
    let allowed = BTreeSet::from(CUSTOM_ROLE_PERMISSIONS);
    let permissions = request
        .permissions
        .into_iter()
        .map(|permission| permission.trim().to_owned())
        .collect::<BTreeSet<_>>();
    if permissions.is_empty()
        || permissions
            .iter()
            .any(|key| !allowed.contains(key.as_str()))
    {
        return Err(ApiError::from(DomainError::Validation(
            "custom roles require at least one supported permission".into(),
        )));
    }
    Ok((
        key.to_owned(),
        name.to_owned(),
        permissions.into_iter().collect(),
    ))
}

fn validate_display_name(display_name: &str) -> ApiResult<()> {
    let display_name = display_name.trim();
    if display_name.is_empty()
        || display_name.chars().count() > 80
        || display_name.chars().any(char::is_control)
    {
        return Err(ApiError::from(DomainError::Validation(
            "display name must contain 1 to 80 printable characters".into(),
        )));
    }
    Ok(())
}

fn validate_custom_fields(value: &Value) -> ApiResult<()> {
    let object = value.as_object().ok_or_else(|| {
        ApiError::from(DomainError::Validation(
            "custom fields must be a JSON object".into(),
        ))
    })?;
    if object.len() > MAX_CUSTOM_FIELDS
        || serde_json::to_vec(value)
            .map_err(|error| ApiError::from(DomainError::Validation(error.to_string())))?
            .len()
            > MAX_CUSTOM_FIELDS_BYTES
        || object
            .keys()
            .any(|key| key.is_empty() || key.len() > 64 || key.chars().any(char::is_control))
    {
        return Err(ApiError::from(DomainError::Validation(
            "custom fields exceed their key, count, or 16 KiB budget".into(),
        )));
    }
    Ok(())
}

fn empty_object() -> Value {
    Value::Object(serde_json::Map::default())
}

impl From<ManagedUser> for ManagedUserResponse {
    fn from(user: ManagedUser) -> Self {
        Self {
            id: user.id,
            email: user.email,
            display_name: user.display_name,
            email_verified: user.email_verified,
            disabled: user.disabled,
            custom_fields: user.custom_fields,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

impl From<ManagedRole> for ManagedRoleResponse {
    fn from(role: ManagedRole) -> Self {
        Self {
            id: role.id,
            key: role.key,
            name: role.name,
            permissions: role.permissions,
            built_in: role.built_in,
        }
    }
}

impl From<ManagedGrant> for ManagedGrantResponse {
    fn from(grant: ManagedGrant) -> Self {
        Self {
            id: grant.id,
            user_id: grant.user_id,
            role_id: grant.role_id,
            role_key: grant.role_key,
            role_name: grant.role_name,
            event_id: grant.event_id,
            team_id: grant.team_id,
            granted_by: grant.granted_by,
            granted_at: grant.granted_at,
        }
    }
}
