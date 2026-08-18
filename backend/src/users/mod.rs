pub mod service;

use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NewUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

impl NewUser {
    pub fn from_google(email: &str, display_name: Option<&str>, avatar_url: Option<&str>) -> Self {
        Self {
            id: Uuid::new_v4(),
            email: email.to_string(),
            display_name: display_name.map(str::to_string),
            avatar_url: avatar_url.map(str::to_string),
        }
    }
}

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;
