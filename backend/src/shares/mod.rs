pub mod models;
pub mod service;

use uuid::Uuid;

use crate::calendar::models::CalendarEvent;

pub use models::{
    NewShare, NewShareEvent, OwnerInfo, PublicEvent, PublicShareResponse, Share, ShareEvent,
    ShareRange, Visibility,
};

pub use service::{RealTokenService, ShareService, TokenService};

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;

#[derive(Debug, Clone)]
pub struct ShareQueryService {
    pool: crate::db::PgPool,
}

impl ShareQueryService {
    pub fn new(pool: crate::db::PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_shares(&self, user_id: Uuid) -> crate::error::AppErrorResult<Vec<Share>> {
        let shares = crate::db::queries::list_shares_for_user(&self.pool, user_id).await?;
        Ok(shares)
    }

    pub async fn get_share(&self, share_id: Uuid, user_id: Uuid) -> crate::error::AppErrorResult<Option<Share>> {
        let share = crate::db::queries::get_share_for_user(&self.pool, share_id, user_id).await?;
        Ok(share)
    }

    pub async fn revoke_share(&self, share_id: Uuid, user_id: Uuid) -> crate::error::AppErrorResult<Option<Share>> {
        let share = crate::db::queries::revoke_share(&self.pool, share_id, user_id).await?;
        Ok(share)
    }

    pub async fn list_events(&self, share_id: Uuid) -> crate::error::AppErrorResult<Vec<ShareEvent>> {
        let events = crate::db::queries::list_share_events(&self.pool, share_id).await?;
        Ok(events)
    }
}

pub fn validate_share_range(
    start: chrono::DateTime<chrono::Utc>,
    end: chrono::DateTime<chrono::Utc>,
) -> Result<(), String> {
    crate::shares::models::validate_share_range(start, end)
}

pub fn project_event_for_visibility(event: &CalendarEvent, visibility: Visibility) -> PublicEvent {
    crate::shares::models::project_event_for_visibility(event, visibility)
}