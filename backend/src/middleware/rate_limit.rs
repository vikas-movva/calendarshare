use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::response::Response;
use axum::body::Body;
use axum::http::Request;

#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<tokio::sync::Mutex<RateLimitState>>,
    max: u32,
}

struct RateLimitState {
    count: u32,
    window_start: Instant,
}

impl RateLimiter {
    pub fn new(max: u32) -> Self {
        Self {
            inner: Arc::new(tokio::sync::Mutex::new(RateLimitState {
                count: 0,
                window_start: Instant::now(),
            })),
            max,
        }
    }

    pub async fn check(&self) -> bool {
        let mut state = self.inner.lock().await;
        let now = Instant::now();
        if now.duration_since(state.window_start) > Duration::from_secs(60) {
            state.count = 0;
            state.window_start = now;
        }
        state.count += 1;
        state.count <= self.max
    }
}

pub async fn rate_limit_check(
    State(limiter): State<RateLimiter>,
) -> Response<Body> {
    if !limiter.check().await {
        return Response::builder()
            .status(axum::http::StatusCode::TOO_MANY_REQUESTS)
            .body(Body::from("rate limit exceeded"))
            .unwrap();
    }
    Response::builder()
        .status(axum::http::StatusCode::OK)
        .body(Body::empty())
        .unwrap()
}