use chrono::DateTime;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct Poll {
    pub id: Uuid,
    pub share_id: Uuid,
    pub title: Option<String>,
    pub created_at: DateTime<chrono::Utc>,
    pub slots: Vec<PollSlot>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PollSlot {
    pub id: Uuid,
    pub poll_id: Uuid,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub votes: Vec<PollVote>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PollVote {
    pub id: Uuid,
    pub slot_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub created_at: DateTime<chrono::Utc>,
}

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;