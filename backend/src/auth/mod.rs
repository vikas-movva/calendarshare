pub mod handlers;
pub mod oauth;
pub mod session;

use axum::http::HeaderMap;

pub struct AuthenticatedUser {
    pub user_id: uuid::Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub fn extract_session_id(headers: &HeaderMap) -> Option<&str> {
    headers.get("cookie").and_then(|v| v.to_str().ok()).and_then(|cookie| {
        cookie
            .split(';')
            .map(|s| s.trim())
            .find(|s| s.starts_with("sid="))
            .map(|s| &s[4..])
    })
}

pub type AuthResult<T> = Result<T, crate::error::AppError>;