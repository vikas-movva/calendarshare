pub mod google;
pub mod models;
pub mod provider;

use uuid::Uuid;

use crate::calendar::models::{Calendar, CalendarConnection};

pub struct CalendarService {
    pool: crate::db::PgPool,
}

impl CalendarService {
    pub fn new(pool: crate::db::PgPool) -> Self {
        Self { pool }
    }

    pub async fn list_calendars(
        &self,
        user_id: Uuid,
    ) -> crate::error::AppErrorResult<Vec<Calendar>> {
        let calendars = crate::db::queries::list_calendars_for_user(&self.pool, user_id).await?;
        Ok(calendars)
    }

    pub async fn get_calendar(
        &self,
        calendar_id: Uuid,
        user_id: Uuid,
    ) -> crate::error::AppErrorResult<Option<Calendar>> {
        let calendar =
            crate::db::queries::get_calendar_by_id(&self.pool, calendar_id, user_id).await?;
        Ok(calendar)
    }

    pub async fn get_connection(
        &self,
        user_id: Uuid,
    ) -> crate::error::AppErrorResult<Option<CalendarConnection>> {
        let conn = sqlx::query_as::<_, CalendarConnection>(
            "SELECT * FROM calendar_connections WHERE user_id = $1 AND provider = 'google'",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(conn)
    }
}

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;
