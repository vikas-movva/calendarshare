use async_trait::async_trait;
use chrono::DateTime;

use crate::calendar::models::{Calendar, CalendarEvent};

#[derive(Debug)]
pub enum CalendarProviderError {
    MissingCredentials,
    ProviderError(String),
    TokenExpired,
    Network(String),
    Database(String),
    Config(String),
}

impl std::fmt::Display for CalendarProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalendarProviderError::MissingCredentials => write!(f, "missing credentials"),
            CalendarProviderError::ProviderError(e) => write!(f, "provider error: {}", e),
            CalendarProviderError::TokenExpired => write!(f, "token expired"),
            CalendarProviderError::Network(e) => write!(f, "network error: {}", e),
            CalendarProviderError::Database(e) => write!(f, "database error: {}", e),
            CalendarProviderError::Config(e) => write!(f, "config error: {:?}", e),
        }
    }
}

impl std::error::Error for CalendarProviderError {}

impl From<String> for CalendarProviderError {
    fn from(err: String) -> Self {
        CalendarProviderError::ProviderError(err)
    }
}

impl From<sqlx::Error> for CalendarProviderError {
    fn from(err: sqlx::Error) -> Self {
        CalendarProviderError::Database(err.to_string())
    }
}

impl From<crate::config::ConfigError> for CalendarProviderError {
    fn from(err: crate::config::ConfigError) -> Self {
        CalendarProviderError::Config(format!("{:?}", err))
    }
}

impl From<CalendarProviderError> for crate::error::AppError {
    fn from(err: CalendarProviderError) -> Self {
        match err {
            CalendarProviderError::MissingCredentials => {
                crate::error::AppError::CalendarNotConnected
            }
            CalendarProviderError::TokenExpired => {
                crate::error::AppError::CalendarProviderUnavailable("token expired".into())
            }
            CalendarProviderError::ProviderError(e) => {
                crate::error::AppError::CalendarProviderUnavailable(e)
            }
            CalendarProviderError::Network(e) => {
                crate::error::AppError::CalendarProviderUnavailable(e)
            }
            CalendarProviderError::Database(e) => crate::error::AppError::InternalError(e),
            CalendarProviderError::Config(e) => crate::error::AppError::Config(e),
        }
    }
}

#[async_trait]
pub trait CalendarProvider: Send + Sync {
    async fn list_calendars(&self) -> Result<Vec<Calendar>, CalendarProviderError>;
    async fn list_events(
        &self,
        calendar_id: &str,
        start: DateTime<chrono::Utc>,
        end: DateTime<chrono::Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarProviderError>;
}
