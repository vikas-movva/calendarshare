use std::net::SocketAddr;

use axum::body::Body;
use axum::http::Request;
use axum::routing::get;
use tower::{util::service_fn, Service};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let config = calendarshare::config::Config::from_env().expect("invalid config");

    let pool = calendarshare::db::connect(&config.database_url).await;
    calendarshare::db::run_migrations(&pool).await.expect("migrations failed");

    let app_state = calendarshare::auth::oauth::AuthState {
        config: config.clone(),
        pool: pool.clone(),
    };

    let auth_routes = axum::Router::new()
        .route("/auth/login", get(calendarshare::auth::oauth::login))
        .route("/auth/logout", get(calendarshare::auth::oauth::logout))
        .route("/auth/google/callback", get(calendarshare::auth::oauth::callback));

    let api_routes = calendarshare::auth::handlers::router()
        .merge(auth_routes)
        .with_state(app_state.clone());

    // Serve the compiled frontend from ./../frontend/dist, falling back to
    // index.html for client-side routes (SPA routing). API/auth routes above
    // take precedence, so they are never shadowed by the static fallback.
    let frontend_dir =
        std::env::var("FRONTEND_DIR").unwrap_or_else(|_| "../frontend/dist".into());

    let serve_dir = ServeDir::new(&frontend_dir);

    let spa = service_fn(move |mut req: Request<Body>| {
        let mut serve_dir = serve_dir.clone();
        async move {
            let method = req.method().clone();
            let path = req.uri().path().to_string();

            // Only rewrite GET requests for client-side routes: not API/auth,
            // and not asset paths that contain a dot (e.g. /assets/app.js).
            if method == axum::http::Method::GET
                && !path.starts_with("/api")
                && !path.starts_with("/auth")
                && !path.contains('.')
            {
                let query = req
                    .uri()
                    .query()
                    .map(|q| format!("?{}", q))
                    .unwrap_or_default();
                // Rewrite to a clean absolute path so ServeDir serves index.html.
                *req.uri_mut() = format!("/index.html{}", query).parse().unwrap();
            }

            serve_dir.call(req).await
        }
    });

    let app = axum::Router::new()
        .merge(api_routes)
        .fallback_service(spa)
        .layer(
            tower::ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(tower_http::compression::CompressionLayer::new())
                .layer(calendarshare::middleware::cors::cors_layer(&[])),
        );

    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse().expect("invalid port");
    tracing::info!(%addr, %frontend_dir, "listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}