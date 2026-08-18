use uuid::Uuid;

use crate::polls::models::{Poll, PollSlot, PollVote};
use crate::polls::store;
use crate::shares::models::FreeSlot;

pub struct PollService {
    pub pool: crate::db::PgPool,
}

impl PollService {
    pub fn new(pool: crate::db::PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_poll(
        &self,
        share_id: Uuid,
        title: Option<&str>,
        slots: &[FreeSlot],
    ) -> crate::polls::AppErrorResult<Poll> {
        let row = store::create_poll(&self.pool, share_id, title).await?;
        let slot_tuples: Vec<(chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> =
            slots.iter().map(|s| (s.start, s.end)).collect();
        store::create_poll_slots(&self.pool, row.id, &slot_tuples).await?;
        self.get_poll(row.id).await
    }

    pub async fn get_poll(&self, poll_id: Uuid) -> crate::polls::AppErrorResult<Poll> {
        let row = store::get_poll_by_id(&self.pool, poll_id)
            .await?
            .ok_or(crate::error::AppError::InternalError("poll not found".into()))?;
        let slots = store::list_poll_slots(&self.pool, row.id).await?;
        let votes = store::list_poll_votes(&self.pool, row.id).await?;
        Ok(row.into_poll(slots, votes))
    }

    pub async fn list_polls_for_share(
        &self,
        share_id: Uuid,
    ) -> crate::polls::AppErrorResult<Vec<Poll>> {
        let rows = store::list_polls_for_share(&self.pool, share_id).await?;
        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let slots = store::list_poll_slots(&self.pool, row.id).await?;
            let votes = store::list_poll_votes(&self.pool, row.id).await?;
            out.push(row.into_poll(slots, votes));
        }
        Ok(out)
    }

    pub async fn vote(
        &self,
        slot_id: Uuid,
        user_id: Uuid,
        email: &str,
        display_name: Option<&str>,
    ) -> crate::polls::AppErrorResult<PollSlot> {
        store::upsert_poll_vote(&self.pool, slot_id, user_id, email, display_name).await?;
        let poll_id = self.get_poll_id_for_slot(slot_id).await?;
        let rows = store::list_poll_slots(&self.pool, poll_id).await?;
        let votes = store::list_poll_votes(&self.pool, poll_id).await?;
        let target = rows
            .iter()
            .find(|r| r.id == slot_id)
            .ok_or(crate::error::AppError::InternalError("slot not found".into()))?;
        let votes_for_slot: Vec<PollVote> = votes
            .iter()
            .filter(|v| v.slot_id == slot_id)
            .map(|v| PollVote {
                id: v.id,
                slot_id: v.slot_id,
                user_id: v.user_id,
                email: v.email.clone(),
                display_name: v.display_name.clone(),
                created_at: v.created_at,
            })
            .collect();
        Ok(PollSlot {
            id: target.id,
            poll_id: target.poll_id,
            start_time: target.start_time,
            end_time: target.end_time,
            votes: votes_for_slot,
        })
    }

    pub async fn unvote(
        &self,
        slot_id: Uuid,
        user_id: Uuid,
    ) -> crate::polls::AppErrorResult<bool> {
        store::delete_poll_vote(&self.pool, slot_id, user_id)
            .await
            .map_err(|e| crate::error::AppError::InternalError(e.to_string()))
    }

    async fn get_poll_id_for_slot(
        &self,
        slot_id: Uuid,
    ) -> crate::polls::AppErrorResult<Uuid> {
        let row: Option<Uuid> = sqlx::query_scalar(
            "SELECT poll_id FROM poll_slots WHERE id = $1",
        )
        .bind(slot_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| crate::error::AppError::InternalError(e.to_string()))?;
        row.ok_or(crate::error::AppError::InternalError("slot not found".into()))
    }
}