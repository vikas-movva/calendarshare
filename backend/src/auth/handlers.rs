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
use crate::polls::service::PollService;
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
    let provider = make_provider(&state, user.user_id).await;
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

    let provider =
        make_provider_with_connection(&state, user.user_id, calendar.connection_id).await;
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
    /// When true, every calendar day in the range is marked busy from
    /// 09:00 to 17:00 (share-local time), so free times only show outside
    /// business hours.
    #[serde(default)]
    pub mark_working_hours_busy: bool,
    /// Days of the week (0=Sun … 6=Sat) the 09:00–17:00 blocks apply to.
    /// An empty vec means every day in the range.
    #[serde(default)]
    pub working_hours_days: Vec<u8>,
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

    let provider =
        make_provider_with_connection(&state, user.user_id, calendar.connection_id).await;
    let events = provider
        .list_events(&calendar.provider_calendar_id, req.start_time, req.end_time)
        .await?;

    let service = ShareService {
        pool: state.pool.clone(),
        token_service: RealTokenService,
        public_base_url: state.config.public_base_url_or("http://localhost:3000"),
        token_encryption_key: state.config.token_encryption_key_or().clone(),
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
                mark_working_hours_busy: req.mark_working_hours_busy,
                working_hours_days: req.working_hours_days,
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
    let service = ShareService {
        pool: state.pool.clone(),
        token_service: RealTokenService,
        public_base_url: state.config.public_base_url_or("http://localhost:3000"),
        token_encryption_key: state.config.token_encryption_key_or().clone(),
    };

    let shares = crate::db::queries::list_shares_for_user(&state.pool, user.user_id).await?;
    Ok(Json(serde_json::json!({
        "shares": shares.into_iter().map(|s| {
            let token = service.decrypt_token(&s);
            serde_json::json!({
                "id": s.id,
                "token": token,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "timezone": s.timezone,
                "visibility": s.visibility_enum().as_str(),
                "expires_at": s.expires_at,
                "revoked_at": s.revoked_at,
                "created_at": s.created_at,
            })
        }).collect::<Vec<_>>()
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
    let service = make_share_service(&state);

    let (share, events) = service
        .public_share_events(&token)
        .await
        .map_err(|e| match e.as_str() {
            "share revoked" => AppError::ShareRevoked,
            "share expired" => AppError::ShareExpired,
            _ => AppError::InternalError(e),
        })?
        .ok_or(AppError::ShareNotFound)?;

    let user = crate::db::queries::get_user_by_id(&state.pool, share.user_id)
        .await?
        .ok_or(AppError::InternalError("owner not found".into()))?;

    let contributors = crate::db::queries::list_share_contributors(&state.pool, share.id)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let owner_ids: Vec<Uuid> = contributors.iter().map(|c| c.user_id).collect();
    let names = crate::db::queries::get_display_names_by_ids(&state.pool, &owner_ids)
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;

    let mut contributors: Vec<crate::shares::models::ShareContributorInfo> = contributors
        .into_iter()
        .map(|c| crate::shares::models::ShareContributorInfo {
            user_id: c.user_id,
            display_name: names.get(&c.user_id).cloned().flatten(),
            calendars: Vec::new(),
        })
        .collect();
    // Group contributor rows by user and attach the calendar name each row
    // points to.
    for info in &mut contributors {
        let rows = crate::db::queries::list_contributor_calendars_for_share(
            &state.pool,
            share.id,
            info.user_id,
        )
        .await
        .map_err(|e| AppError::InternalError(e.to_string()))?;
        info.calendars = rows
            .into_iter()
            .map(|c| crate::shares::models::ContributorCalendar {
                calendar_id: c.id,
                name: c.name,
            })
            .collect();
    }

    let poll_service = PollService::new(state.pool.clone());
    let polls = poll_service.list_polls_for_share(share.id).await?;

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
        contributors,
        polls,
    }))
}

async fn make_provider(
    state: &AuthState,
    user_id: Uuid,
) -> crate::calendar::google::GoogleCalendarProvider<crate::calendar::models::RealGoogleOAuthClient>
{
    let oauth = crate::calendar::models::RealGoogleOAuthClient::new(
        state.config.google_client_id_or(""),
        state.config.google_client_secret_or(""),
        state.config.google_redirect_uri_or(""),
    );
    let provider =
        crate::calendar::google::GoogleCalendarProvider::new(oauth, state.pool.clone(), user_id);

    // Resolve the user's Google connection so saved calendars are linked to a
    // real connection_id (not Uuid::nil()). Otherwise the calendars row is
    // orphaned and the JOIN in list_calendars_for_user never returns them.
    let connection_id = get_google_connection_id(state.pool.clone(), user_id)
        .await
        .ok()
        .flatten();
    match connection_id {
        Some(id) => provider.with_connection(id),
        None => provider,
    }
}

async fn get_google_connection_id(
    pool: crate::db::PgPool,
    user_id: Uuid,
) -> sqlx::Result<Option<uuid::Uuid>> {
    let row: Option<uuid::Uuid> = sqlx::query_scalar(
        "SELECT id FROM calendar_connections WHERE user_id = $1 AND provider = 'google'",
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await?;
    Ok(row)
}

async fn make_provider_with_connection(
    state: &AuthState,
    user_id: Uuid,
    connection_id: Uuid,
) -> crate::calendar::google::GoogleCalendarProvider<crate::calendar::models::RealGoogleOAuthClient>
{
    make_provider(state, user_id)
        .await
        .with_connection(connection_id)
}

fn make_share_service(state: &AuthState) -> ShareService<crate::shares::service::RealTokenService> {
    ShareService {
        pool: state.pool.clone(),
        token_service: RealTokenService,
        public_base_url: state.config.public_base_url_or("http://localhost:3000"),
        token_encryption_key: state.config.token_encryption_key_or().clone(),
    }
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

    let user = crate::db::queries::get_user_by_id(&state.pool, user_id)
        .await?
        .ok_or(AppError::AuthError("user not found".into()))?;

    Ok(AuthenticatedUser {
        user_id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
    })
}

pub async fn free_slots_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(share_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let service = make_share_service(&state);
    let share = crate::db::queries::get_share_by_id(&state.pool, share_id)
        .await?
        .ok_or(AppError::ShareNotFound)?;
    if share.user_id != user.user_id {
        return Err(AppError::ShareAccessDenied);
    }
    let events = service
        .public_share_events_for_id(&share)
        .await
        .map_err(|e| AppError::InternalError(e))?;
    let slots = crate::shares::service::compute_free_slots(
        share.start_time,
        share.end_time,
        &events,
        &share.timezone,
    );
    Ok(Json(serde_json::json!({
        "slots": slots.into_iter().map(|s| serde_json::json!({
            "start": s.start,
            "end": s.end,
        })).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
pub struct AddContributorRequest {
    pub calendar_id: Uuid,
}

pub async fn add_contributor_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(share_id): Path<Uuid>,
    Json(req): Json<AddContributorRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    let user = authenticate(&state, &headers).await?;
    let service = make_share_service(&state);
    let (share, events) = service
        .add_contributor(share_id, req.calendar_id, user.user_id)
        .await
        .map_err(|e| AppError::InternalError(e))?;
    let slots = crate::shares::service::compute_free_slots(
        share.start_time,
        share.end_time,
        &events,
        &share.timezone,
    );
    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({
            "share_id": share.id,
            "slots": slots.into_iter().map(|s| serde_json::json!({
                "start": s.start,
                "end": s.end,
            })).collect::<Vec<_>>()
        })),
    ))
}

#[derive(Debug, Deserialize)]
pub struct CreatePollRequest {
    pub title: Option<String>,
}

pub async fn create_poll_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(share_id): Path<Uuid>,
    Json(req): Json<CreatePollRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    let user = authenticate(&state, &headers).await?;
    let share = crate::db::queries::get_share_by_id(&state.pool, share_id)
        .await?
        .ok_or(AppError::ShareNotFound)?;
    if share.user_id != user.user_id {
        return Err(AppError::ShareAccessDenied);
    }
    let service = make_share_service(&state);
    let events = service
        .public_share_events_for_id(&share)
        .await
        .map_err(|e| AppError::InternalError(e))?;
    let slots = crate::shares::service::compute_free_slots(
        share.start_time,
        share.end_time,
        &events,
        &share.timezone,
    );
    let poll_service = PollService::new(state.pool.clone());
    let poll = poll_service
        .create_poll(share_id, req.title.as_deref(), &slots)
        .await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({
            "id": poll.id,
            "share_id": poll.share_id,
            "title": poll.title,
            "slots": poll.slots.into_iter().map(|s| serde_json::json!({
                "id": s.id,
                "start": s.start,
                "end": s.end,
            })).collect::<Vec<_>>()
        })),
    ))
}

pub async fn list_polls_handler(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Path(share_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = authenticate(&state, &headers).await?;
    let share = crate::db::queries::get_share_by_id(&state.pool, share_id)
        .await?
        .ok_or(AppError::ShareNotFound)?;
    if share.user_id != user.user_id {
        return Err(AppError::ShareAccessDenied);
    }
    let poll_service = PollService::new(state.pool.clone());
    let polls = poll_service.list_polls_for_share(share_id).await?;
    Ok(Json(serde_json::json!({
        "polls": polls.into_iter().map(|p| serde_json::json!({
            "id": p.id,
            "share_id": p.share_id,
            "title": p.title,
            "slots": p.slots.into_iter().map(|s| serde_json::json!({
                "id": s.id,
                "start": s.start,
                "end": s.end,
                "votes": s.votes.into_iter().map(|v| serde_json::json!({
                    "id": v.id,
                    "user_id": v.user_id,
                    "email": v.email,
                    "display_name": v.display_name,
                })).collect::<Vec<_>>()
            })).collect::<Vec<_>>()
        })).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
pub struct VoteRequest {
    pub email: String,
    pub display_name: Option<String>,
}

pub async fn vote_slot_handler(
    State(state): State<AuthState>,
    Path(slot_id): Path<Uuid>,
    Json(req): Json<VoteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = crate::polls::store::user_id_for_email(&state.pool, &req.email).await?;
    let poll_service = PollService::new(state.pool.clone());
    let slot = poll_service
        .vote(slot_id, user_id, &req.email, req.display_name.as_deref())
        .await?;
    Ok(Json(serde_json::json!({
        "id": slot.id,
        "poll_id": slot.poll_id,
        "start": slot.start,
        "end": slot.end,
        "votes": slot.votes.into_iter().map(|v| serde_json::json!({
            "id": v.id,
            "user_id": v.user_id,
            "email": v.email,
            "display_name": v.display_name,
        })).collect::<Vec<_>>()
    })))
}

#[derive(Debug, Deserialize)]
pub struct UnvoteRequest {
    pub email: String,
}

pub async fn unvote_slot_handler(
    State(state): State<AuthState>,
    Path(slot_id): Path<Uuid>,
    Json(req): Json<UnvoteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = crate::polls::store::user_id_for_email(&state.pool, &req.email).await?;
    let poll_service = PollService::new(state.pool.clone());
    let ok = poll_service.unvote(slot_id, user_id).await?;
    Ok(Json(serde_json::json!({ "unvoted": ok })))
}

pub async fn public_free_slots_handler(
    State(state): State<AuthState>,
    Path(token): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let service = make_share_service(&state);
    let Some(slots) = service
        .free_slots(&token)
        .await
        .map_err(|e| AppError::InternalError(e))?
    else {
        return Err(AppError::ShareNotFound);
    };
    Ok(Json(serde_json::json!({
        "slots": slots.into_iter().map(|s| serde_json::json!({
            "start": s.start,
            "end": s.end,
        })).collect::<Vec<_>>()
    })))
}

pub async fn public_add_contributor_handler(
    State(state): State<AuthState>,
    Path(token): Path<String>,
    headers: HeaderMap,
    Json(req): Json<AddContributorRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    let user = authenticate(&state, &headers).await?;
    let service = make_share_service(&state);
    let (share, events) = service
        .add_contributor_by_token(&token, req.calendar_id, user.user_id)
        .await
        .map_err(|e| AppError::InternalError(e))?;
    let slots = crate::shares::service::compute_free_slots(
        share.start_time,
        share.end_time,
        &events,
        &share.timezone,
    );
    Ok((
        axum::http::StatusCode::CREATED,
        Json(serde_json::json!({
            "share_id": share.id,
            "slots": slots.into_iter().map(|s| serde_json::json!({
                "start": s.start,
                "end": s.end,
            })).collect::<Vec<_>>()
        })),
    ))
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
        .route("/api/shares/:id/free-slots", get(free_slots_handler))
        .route(
            "/api/shares/:id/contributors",
            post(add_contributor_handler),
        )
        .route(
            "/api/shares/:id/polls",
            post(create_poll_handler).get(list_polls_handler),
        )
        .route("/api/public/shares/:token", get(public_share))
        .route(
            "/api/public/shares/:token/free-slots",
            get(public_free_slots_handler),
        )
        .route(
            "/api/public/shares/:token/contributors",
            post(public_add_contributor_handler),
        )
        .route(
            "/api/polls/slots/:slot_id/vote",
            post(vote_slot_handler).delete(unvote_slot_handler),
        )
}
