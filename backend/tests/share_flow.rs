use calendarshare::shares::service::{RealTokenService, TokenService};
use chrono::Duration;
use uuid::Uuid;

async fn setup_pool() -> sqlx::PgPool {
    let _ = dotenvy::dotenv();
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    sqlx::PgPool::connect(&url).await.expect("db connect")
}

#[tokio::test]
async fn public_share_flow_roundtrip() {
    let pool = setup_pool().await;

    let user_id = Uuid::new_v4();
    let connection_id = Uuid::new_v4();
    let calendar_id = Uuid::new_v4();
    let share_id = Uuid::new_v4();

    sqlx::query("INSERT INTO users (id, email) VALUES ($1, $2)")
        .bind(user_id)
        .bind(format!("owner-{}@example.com", user_id))
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "INSERT INTO calendar_connections (id, user_id, provider, access_token_encrypted) VALUES ($1, $2, 'google', 'encrypted')",
    )
    .bind(connection_id)
    .bind(user_id)
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO calendars (id, connection_id, provider_calendar_id, name) VALUES ($1, $2, $3, $4)",
    )
    .bind(calendar_id)
    .bind(connection_id)
    .bind("primary")
    .bind("Personal")
    .execute(&pool)
    .await
    .unwrap();

    let token = RealTokenService.generate().unwrap();
    let token_hash = RealTokenService.hash(&token).unwrap();

    let start = chrono::Utc::now() - Duration::days(2);
    let end = chrono::Utc::now() + Duration::days(2);

    sqlx::query(
        "INSERT INTO shares (id, user_id, calendar_id, token_hash, start_time, end_time, timezone, visibility) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(share_id)
    .bind(user_id)
    .bind(calendar_id)
    .bind(&token_hash)
    .bind(start)
    .bind(end)
    .bind("UTC")
    .bind("title_time")
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO share_events (id, share_id, title, start_time, end_time) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(share_id)
    .bind("Test event")
    .bind(start + Duration::hours(1))
    .bind(start + Duration::hours(2))
    .execute(&pool)
    .await
    .unwrap();

    let service = calendarshare::shares::service::ShareService {
        pool: pool.clone(),
        token_service: RealTokenService,
        public_base_url: "https://example.com".into(),
        token_encryption_key: [0u8; 32],
    };

    let result = service.public_share_events(&token).await.unwrap();
    let (share, events) = result.expect("share should resolve");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].title.as_deref(), Some("Test event"));
    assert_eq!(share.visibility_enum().as_str(), "title_time");

    // A wrong token must not resolve.
    let wrong = service.public_share_events("not-the-token").await.unwrap();
    assert!(wrong.is_none());

    sqlx::query("DELETE FROM share_events WHERE share_id = $1")
        .bind(share_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM shares WHERE id = $1")
        .bind(share_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM calendars WHERE id = $1")
        .bind(calendar_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM calendar_connections WHERE id = $1")
        .bind(connection_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&pool)
        .await
        .unwrap();
}
