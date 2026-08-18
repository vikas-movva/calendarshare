use uuid::Uuid;

use crate::polls::models::{Poll, PollSlot, PollVote};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PollRow {
    pub id: Uuid,
    pub share_id: Uuid,
    pub title: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PollSlotRow {
    pub id: Uuid,
    pub poll_id: Uuid,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PollVoteRow {
    pub id: Uuid,
    pub slot_id: Uuid,
    pub user_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl PollRow {
    pub fn into_poll(self, slots: Vec<PollSlotRow>, votes: Vec<PollVoteRow>) -> Poll {
        let slots_map: std::collections::HashMap<Uuid, Vec<PollVote>> = votes
            .into_iter()
            .map(|v| PollVote {
                id: v.id,
                slot_id: v.slot_id,
                user_id: v.user_id,
                email: v.email,
                display_name: v.display_name,
                created_at: v.created_at,
            })
            .fold(std::collections::HashMap::new(), |mut acc, v| {
                acc.entry(v.slot_id).or_default().push(v);
                acc
            });

        let mut slots: Vec<PollSlot> = slots
            .iter()
            .map(|s| PollSlot {
                id: s.id,
                poll_id: s.poll_id,
                start_time: s.start_time,
                end_time: s.end_time,
                votes: slots_map.get(&s.id).cloned().unwrap_or_default(),
            })
            .collect();
        slots.sort_by_key(|s| s.start_time);

        Poll {
            id: self.id,
            share_id: self.share_id,
            title: self.title,
            created_at: self.created_at,
            slots,
        }
    }
}

pub async fn create_poll(
    pool: &crate::db::PgPool,
    share_id: Uuid,
    title: Option<&str>,
) -> sqlx::Result<PollRow> {
    let row = sqlx::query_as::<_, PollRow>(
        r#"
        INSERT INTO polls (id, share_id, title)
        VALUES ($1, $2, $3)
        RETURNING *
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(share_id)
    .bind(title)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn create_poll_slots(
    pool: &crate::db::PgPool,
    poll_id: Uuid,
    slots: &[(chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)],
) -> sqlx::Result<()> {
    let mut tx = pool.begin().await?;
    for (start, end) in slots {
        sqlx::query(
            r#"
            INSERT INTO poll_slots (id, poll_id, start_time, end_time)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(poll_id)
        .bind(start)
        .bind(end)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn list_polls_for_share(
    pool: &crate::db::PgPool,
    share_id: Uuid,
) -> sqlx::Result<Vec<PollRow>> {
    let rows = sqlx::query_as::<_, PollRow>(
        "SELECT * FROM polls WHERE share_id = $1 ORDER BY created_at DESC",
    )
    .bind(share_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_poll_by_id(
    pool: &crate::db::PgPool,
    poll_id: Uuid,
) -> sqlx::Result<Option<PollRow>> {
    let row = sqlx::query_as::<_, PollRow>(
        "SELECT * FROM polls WHERE id = $1",
    )
    .bind(poll_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_poll_slots(
    pool: &crate::db::PgPool,
    poll_id: Uuid,
) -> sqlx::Result<Vec<PollSlotRow>> {
    let rows = sqlx::query_as::<_, PollSlotRow>(
        "SELECT * FROM poll_slots WHERE poll_id = $1 ORDER BY start_time",
    )
    .bind(poll_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn list_poll_votes(
    pool: &crate::db::PgPool,
    poll_id: Uuid,
) -> sqlx::Result<Vec<PollVoteRow>> {
    let rows = sqlx::query_as::<_, PollVoteRow>(
        r#"
        SELECT v.* FROM poll_votes v
        JOIN poll_slots s ON s.id = v.slot_id
        WHERE s.poll_id = $1
        ORDER BY v.created_at
        "#,
    )
    .bind(poll_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn upsert_poll_vote(
    pool: &crate::db::PgPool,
    slot_id: Uuid,
    user_id: Uuid,
    email: &str,
    display_name: Option<&str>,
) -> sqlx::Result<bool> {
    // Use INSERT ... ON CONFLICT so concurrent votes for the same
    // (slot_id, user_id) can't both attempt an INSERT and trip the unique
    // constraint. `is_new` reflects whether this call created the row.
    let result = sqlx::query(
        r#"
        INSERT INTO poll_votes (id, slot_id, user_id, email, display_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (slot_id, user_id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(slot_id)
    .bind(user_id)
    .bind(email)
    .bind(display_name)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete_poll_vote(
    pool: &crate::db::PgPool,
    slot_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<bool> {
    let res = sqlx::query(
        "DELETE FROM poll_votes WHERE slot_id = $1 AND user_id = $2",
    )
    .bind(slot_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(res.rows_affected() > 0)
}