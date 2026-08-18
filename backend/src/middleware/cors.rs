use axum::http::{HeaderName, Method, StatusCode};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub fn cors_layer(allowed_origins: &[String]) -> CorsLayer {
    let origins: Vec<axum::http::HeaderValue> = if allowed_origins.is_empty() {
        vec!["http://localhost:3000".parse().unwrap()]
    } else {
        allowed_origins.iter().map(|o| o.parse().unwrap()).collect()
    };

    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            HeaderName::from_static("content-type"),
            HeaderName::from_static("cookie"),
        ])
        .allow_credentials(true)
        .max_age(std::time::Duration::from_secs(3600))
}

#[allow(dead_code)]
fn _status() -> StatusCode {
    StatusCode::OK
}
