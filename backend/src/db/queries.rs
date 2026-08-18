use sqlx::PgPool;
use uuid::Uuid;

pub async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub async fn get_user_by_email(
    pool: &crate::db::PgPool,
    email: &str,
) -> sqlx::Result<Option<crate::users::User>> {
    let row = sqlx::query_as::<_, crate::users::User>("SELECT * FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn get_user_by_id(
    pool: &crate::db::PgPool,
    user_id: uuid::Uuid,
) -> sqlx::Result<Option<crate::users::User>> {
    let row = sqlx::query_as::<_, crate::users::User>("SELECT * FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(row)
}

pub async fn create_user(
    pool: &PgPool,
    user: &crate::users::NewUser,
) -> sqlx::Result<crate::users::User> {
    let row = sqlx::query_as::<_, crate::users::User>(
        "INSERT INTO users (id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(user.id)
    .bind(&user.email)
    .bind(&user.display_name)
    .bind(&user.avatar_url)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn get_calendar_connection_by_id(
    pool: &PgPool,
    connection_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<crate::calendar::models::CalendarConnection>> {
    let row = sqlx::query_as::<_, crate::calendar::models::CalendarConnection>(
        "SELECT * FROM calendar_connections WHERE id = $1 AND user_id = $2",
    )
    .bind(connection_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_calendars_for_user(
    pool: &PgPool,
    user_id: Uuid,
) -> sqlx::Result<Vec<crate::calendar::models::Calendar>> {
    let rows = sqlx::query_as::<_, crate::calendar::models::Calendar>(
        r#"
        SELECT c.* FROM calendars c
        JOIN calendar_connections cc ON cc.id = c.connection_id
        WHERE cc.user_id = $1
        ORDER BY c.name
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_calendar_by_id(
    pool: &PgPool,
    calendar_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<crate::calendar::models::Calendar>> {
    let row = sqlx::query_as::<_, crate::calendar::models::Calendar>(
        r#"
        SELECT c.* FROM calendars c
        JOIN calendar_connections cc ON cc.id = c.connection_id
        WHERE c.id = $1 AND cc.user_id = $2
        "#,
    )
    .bind(calendar_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_calendar(
    pool: &PgPool,
    calendar: &crate::calendar::models::UpsertCalendar,
) -> sqlx::Result<crate::calendar::models::Calendar> {
    let row = sqlx::query_as::<_, crate::calendar::models::Calendar>(
        r#"
        INSERT INTO calendars (id, connection_id, provider_calendar_id, name, timezone)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (connection_id, provider_calendar_id)
        DO UPDATE SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(calendar.id)
    .bind(calendar.connection_id)
    .bind(&calendar.provider_calendar_id)
    .bind(&calendar.name)
    .bind(&calendar.timezone)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn upsert_connection(
    pool: &PgPool,
    connection: &crate::calendar::models::UpsertConnection,
) -> sqlx::Result<crate::calendar::models::CalendarConnection> {
    let row = sqlx::query_as::<_, crate::calendar::models::CalendarConnection>(
        r#"
        INSERT INTO calendar_connections
            (id, user_id, provider, provider_account_id, access_token_encrypted, refresh_token_encrypted, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, provider)
        DO UPDATE SET
            access_token_encrypted = EXCLUDED.access_token_encrypted,
            refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        RETURNING *
        "#,
    )
    .bind(connection.id)
    .bind(connection.user_id)
    .bind(&connection.provider)
    .bind(&connection.provider_account_id)
    .bind(&connection.access_token_encrypted)
    .bind(&connection.refresh_token_encrypted)
    .bind(&connection.expires_at)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn create_share(
    pool: &PgPool,
    share: &crate::shares::models::NewShare,
) -> sqlx::Result<crate::shares::models::Share> {
    let row = sqlx::query_as::<_, crate::shares::models::Share>(
        r#"
        INSERT INTO shares
            (id, user_id, calendar_id, token_hash, start_time, end_time, timezone, visibility, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        "#,
    )
    .bind(share.id)
    .bind(share.user_id)
    .bind(share.calendar_id)
    .bind(&share.token_hash)
    .bind(share.start_time)
    .bind(share.end_time)
    .bind(&share.timezone)
    .bind(&share.visibility)
    .bind(share.expires_at)
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn create_share_events(
    pool: &PgPool,
    events: &[crate::shares::models::NewShareEvent],
) -> sqlx::Result<()> {
    let mut tx = pool.begin().await?;
    for event in events {
        sqlx::query(
            r#"
            INSERT INTO share_events
                (id, share_id, provider_event_id, title, start_time, end_time, location, description, is_all_day)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(event.id)
        .bind(event.share_id)
        .bind(&event.provider_event_id)
        .bind(&event.title)
        .bind(event.start_time)
        .bind(event.end_time)
        .bind(&event.location)
        .bind(&event.description)
        .bind(event.is_all_day)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_share_by_token_hash(
    pool: &PgPool,
    token_hash: &str,
) -> sqlx::Result<Option<crate::shares::models::Share>> {
    let row = sqlx::query_as::<_, crate::shares::models::Share>(
        "SELECT * FROM shares WHERE token_hash = $1",
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_shares_for_user(
    pool: &PgPool,
    user_id: Uuid,
) -> sqlx::Result<Vec<crate::shares::models::Share>> {
    let rows = sqlx::query_as::<_, crate::shares::models::Share>(
        "SELECT * FROM shares WHERE user_id = $1 ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn get_share_for_user(
    pool: &PgPool,
    share_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<crate::shares::models::Share>> {
    let row = sqlx::query_as::<_, crate::shares::models::Share>(
        "SELECT * FROM shares WHERE id = $1 AND user_id = $2",
    )
    .bind(share_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn revoke_share(
    pool: &PgPool,
    share_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<crate::shares::models::Share>> {
    let row = sqlx::query_as::<_, crate::shares::models::Share>(
        r#"
        UPDATE shares SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING *
        "#,
    )
    .bind(share_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub async fn list_share_events(
    pool: &PgPool,
    share_id: Uuid,
) -> sqlx::Result<Vec<crate::shares::models::ShareEvent>> {
    let rows = sqlx::query_as::<_, crate::shares::models::ShareEvent>(
        "SELECT * FROM share_events WHERE share_id = $1 ORDER BY start_time",
    )
    .bind(share_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
