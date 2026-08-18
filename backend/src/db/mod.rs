pub mod queries;

pub use sqlx::PgPool;

pub async fn connect(database_url: &str) -> PgPool {
    PgPool::connect(database_url)
        .await
        .expect("failed to connect to database")
}

pub use queries::run_migrations;
