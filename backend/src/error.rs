use crate::config::ConfigError;

use axum::{
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde_json::json;

pub type AppErrorResult<T> = Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    AuthError(String),
    CalendarNotConnected,
    CalendarNotFound,
    CalendarProviderUnavailable(String),
    InvalidDateRange(String),
    InvalidVisibility(String),
    ShareNotFound,
    ShareExpired,
    ShareRevoked,
    ShareAccessDenied,
    RateLimited(String),
    InternalError(String),
    Config(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        tracing::error!(%err, "database error");
        AppError::InternalError("database error".into())
    }
}

impl From<ConfigError> for AppError {
    fn from(err: ConfigError) -> Self {
        AppError::Config(format!("{:?}", err))
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, code) = match self {
            AppError::AuthError(_) => (StatusCode::UNAUTHORIZED, "auth_error"),
            AppError::CalendarNotConnected => (StatusCode::NOT_FOUND, "calendar_not_connected"),
            AppError::CalendarNotFound => (StatusCode::NOT_FOUND, "calendar_not_found"),
            AppError::CalendarProviderUnavailable(_) => {
                (StatusCode::BAD_GATEWAY, "provider_unavailable")
            }
            AppError::InvalidDateRange(_) => (StatusCode::BAD_REQUEST, "invalid_date_range"),
            AppError::InvalidVisibility(_) => (StatusCode::BAD_REQUEST, "invalid_visibility"),
            AppError::ShareNotFound => (StatusCode::NOT_FOUND, "share_not_found"),
            AppError::ShareExpired => (StatusCode::GONE, "share_expired"),
            AppError::ShareRevoked => (StatusCode::GONE, "share_revoked"),
            AppError::ShareAccessDenied => (StatusCode::FORBIDDEN, "access_denied"),
            AppError::RateLimited(_) => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            AppError::InternalError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
            AppError::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "config_error"),
        };

        let message = match &self {
            AppError::AuthError(m)
            | AppError::CalendarProviderUnavailable(m)
            | AppError::InvalidDateRange(m)
            | AppError::InvalidVisibility(m)
            | AppError::RateLimited(m)
            | AppError::InternalError(m)
            | AppError::Config(m) => m.clone(),
            _ => code.replace('_', " ").into(),
        };

        let body = Json(json!({
            "error": {
                "code": code,
                "message": message,
            }
        }));

        (status, body).into_response()
    }
}
