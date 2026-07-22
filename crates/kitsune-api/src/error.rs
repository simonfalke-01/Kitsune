//! Stable, non-leaky API error mapping.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use kitsune_core::DomainError;
use serde::Serialize;
use utoipa::ToSchema;

/// Machine-readable error response.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ErrorBody {
    /// Stable error code.
    pub code: &'static str,
    /// Safe human-readable detail.
    pub message: String,
}

/// HTTP-layer error.
#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    body: ErrorBody,
}

impl ApiError {
    /// Authentication is missing or invalid.
    pub fn unauthorized() -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            body: ErrorBody {
                code: "unauthorized",
                message: "Authentication is required.".into(),
            },
        }
    }

    /// CSRF proof is missing or invalid.
    pub fn csrf() -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            body: ErrorBody {
                code: "csrf_invalid",
                message: "The request could not be verified.".into(),
            },
        }
    }

    /// Request frequency exceeded a bounded budget.
    pub fn rate_limited() -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            body: ErrorBody {
                code: "rate_limited",
                message: "Too many attempts. Try again shortly.".into(),
            },
        }
    }
}

impl From<DomainError> for ApiError {
    fn from(error: DomainError) -> Self {
        let (status, code) = match error {
            DomainError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            DomainError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            DomainError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            DomainError::Validation(_) => (StatusCode::UNPROCESSABLE_ENTITY, "validation"),
            DomainError::LimitExceeded(_) => (StatusCode::TOO_MANY_REQUESTS, "limit_exceeded"),
            DomainError::Unavailable(_) => (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable"),
        };
        let message = match &error {
            DomainError::Unavailable(_) => "A required service is temporarily unavailable.".into(),
            _ => error.to_string(),
        };
        Self {
            status,
            body: ErrorBody { code, message },
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body)).into_response()
    }
}

/// API result alias.
pub type ApiResult<T> = Result<T, ApiError>;
