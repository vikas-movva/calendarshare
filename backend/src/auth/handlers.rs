use axum::{
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::oauth::AuthState;
use crate::auth::AuthenticatedUser;
use crate::calendar::provider::CalendarProvider;
use crate::error::AppError;
use crate::shares::models::{OwnerInfo, PublicShareResponse, ShareRange, Visibility};
use crate::shares::service::{RealTokenService, ShareService};

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

pub async fn me_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<Json<crate::auth::oauth::MeResponse>, AppError> {
    crate::auth::oauth::me(State(state), headers).await
}

pub async fn list_calendars(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let provider = make_provider(&state, user.user_id);
    let calendars = provider.list_calendars().await?;
    Ok(Json(serde_json::json!({
        "calendars": calendars.into_iter().map(|c| serde_json::json!({
            "id": c.id,
            "name": c.name,
            "timezone": c.timezone,
        })).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    pub start: chrono::DateTime<chrono::Utc>,
    pub end: chrono::DateTime<chrono::Utc>,
}

pub async fn list_events(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(calendar_id): Path<Uuid>,
    Query(params): Query<EventsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let calendar = crate::db::queries::get_calendar_by_id(&state.pool, calendar_id, user.user_id)
        .await?
        .ok_or(AppError::CalendarNotFound)?;

    let provider = make_provider_with_connection(&state, user.user_id, calendar.connection_id);
    let events = provider
        .list_events(&calendar.provider_calendar_id, params.start, params.end)
        .await?;
    Ok(Json(serde_json::json!({
        "events": events.into_iter().map(|e| serde_json::json!({
            "provider_event_id": e.provider_event_id,
            "title": e.title,
            "start": e.start,
            "end": e.end,
            "timezone": e.timezone,
            "location": e.location,
            "description": e.description,
            "is_all_day": e.is_all_day,
        })).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
pub struct CreateShareRequest {
    pub calendar_id: Uuid,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: chrono::DateTime<chrono::Utc>,
    pub visibility: String,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub timezone: Option<String>,
}

pub async fn create_share_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Json(req): Json<CreateShareRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    let user = authenticate(&state, &headers).await?;
    let calendar =
        crate::db::queries::get_calendar_by_id(&state.pool, req.calendar_id, user.user_id)
            .await?
            .ok_or(AppError::CalendarNotFound)?;

    let visibility = Visibility::parse(&req.visibility)
        .ok_or(AppError::InvalidVisibility(req.visibility.clone()))?;
    let timezone = req
        .timezone
        .unwrap_or_else(|| calendar.timezone.clone().unwrap_or_else(|| "UTC".into()));

    let provider = make_provider_with_connection(&state, user.user_id, calendar.connection_id);
    let events = provider
        .list_events(&calendar.provider_calendar_id, req.start_time, req.end_time)
        .await?;

    let service = ShareService {
        pool: state.pool.clone(),
        token_service: RealTokenService,
        public_base_url: state.config.public_base_url_or("http://localhost:3000"),
    };

    let result = service
        .create_share(
            user.user_id,
            req.calendar_id,
            events,
            crate::shares::service::CreateShareRequest {
                calendar_id: req.calendar_id,
                start_time: req.start_time,
                end_time: req.end_time,
                visibility,
                expires_at: req.expires_at,
                timezone,
            },
        )
        .await
        .map_err(|e| AppError::InternalError(e))?;

    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({
            "id": result.share.id,
            "url": result.url,
            "expires_at": result.share.expires_at,
        })),
    ))
}

pub async fn list_shares_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let shares = crate::db::queries::list_shares_for_user(&state.pool, user.user_id).await?;
    Ok(Json(serde_json::json!({
        "shares": shares.into_iter().map(|s| serde_json::json!({
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "timezone": s.timezone,
            "visibility": s.visibility_enum().as_str(),
            "expires_at": s.expires_at,
            "revoked_at": s.revoked_at,
            "created_at": s.created_at,
        })).collect::<Vec<_>>()
    })))
}

pub async fn revoke_share_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(share_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let share = crate::db::queries::revoke_share(&state.pool, share_id, user.user_id)
        .await?
        .ok_or(AppError::ShareAccessDenied)?;
    Ok(Json(serde_json::json!({ "revoked": true, "id": share.id })))
}

pub async fn public_share(
    State(state): State<AuthState>,
    Path(token): Path<String>,
) -> Result<Json<PublicShareResponse>, AppError> {
    let service = ShareService {
        pool: state.pool.clone(),
        token_service: RealTokenService,
        public_base_url: state.config.public_base_url_or("http://localhost:3000"),
    };

    let (share, events) = service
        .public_share_events(&token)
        .await
        .map_err(|e| match e.as_str() {
            "share revoked" => AppError::ShareRevoked,
            "share expired" => AppError::ShareExpired,
            _ => AppError::InternalError(e),
        })?
        .ok_or(AppError::ShareNotFound)?;

    let user = crate::db::queries::get_user_by_email(&state.pool, &share.user_id.to_string())
        .await?
        .ok_or(AppError::InternalError("owner not found".into()))?;

    let visibility = share.visibility_enum().as_str().to_string();
    Ok(Json(PublicShareResponse {
        owner: OwnerInfo {
            display_name: user.display_name,
        },
        range: ShareRange {
            start: share.start_time,
            end: share.end_time,
        },
        timezone: share.timezone,
        visibility,
        events,
    }))
}

fn make_provider(
    state: &AuthState,
    user_id: Uuid,
) -> crate::calendar::google::GoogleCalendarProvider<crate::calendar::models::RealGoogleOAuthClient>
{
    let oauth = crate::calendar::models::RealGoogleOAuthClient::new(
        state.config.google_client_id_or(""),
        state.config.google_client_secret_or(""),
        state.config.google_redirect_uri_or(""),
    );
    crate::calendar::google::GoogleCalendarProvider::new(oauth, state.pool.clone(), user_id)
}

fn make_provider_with_connection(
    state: &AuthState,
    user_id: Uuid,
    connection_id: Uuid,
) -> crate::calendar::google::GoogleCalendarProvider<crate::calendar::models::RealGoogleOAuthClient>
{
    make_provider(state, user_id).with_connection(connection_id)
}

async fn authenticate(
    state: &AuthState,
    headers: &HeaderMap,
) -> Result<AuthenticatedUser, AppError> {
    let session_id = crate::auth::extract_session_id(headers)
        .ok_or(AppError::AuthError("missing session".into()))?;
    let parts: Vec<&str> = session_id.split(':').collect();
    if parts.len() != 2 {
        return Err(AppError::AuthError("invalid session".into()));
    }
    let user_id: Uuid = parts[0]
        .parse()
        .map_err(|_| AppError::AuthError("invalid session".into()))?;
    let signature = parts[1];

    if !crate::auth::session::verify_session(state.config.session_secret_or(), &user_id, signature)
    {
        return Err(AppError::AuthError("invalid session signature".into()));
    }

    let user = crate::db::queries::get_user_by_email(&state.pool, &parts[0])
        .await?
        .ok_or(AppError::AuthError("user not found".into()))?;

    Ok(AuthenticatedUser {
        user_id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
    })
}

pub fn router() -> Router<AuthState> {
    Router::new()
        .route("/health", get(health))
        .route("/api/me", get(me_handler))
        .route("/api/calendars", get(list_calendars))
        .route("/api/calendars/:id/events", get(list_events))
        .route(
            "/api/shares",
            post(create_share_handler).get(list_shares_handler),
        )
        .route("/api/shares/:id", delete(revoke_share_handler))
        .route("/api/public/shares/:token", get(public_share))
}
