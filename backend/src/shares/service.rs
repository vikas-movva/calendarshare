use chrono::{DateTime, Timelike};
use uuid::Uuid;

use crate::calendar::models::CalendarEvent;
use crate::calendar::provider::CalendarProvider;
use crate::shares::models::{NewShare, NewShareEvent, PublicEvent};

/// Default working window, in minutes-of-day (local time), used when
/// computing free slots. Slots are 30 minutes and only fall inside this
/// window on each calendar day.
const WORK_START_MIN: i64 = 9 * 60;
const WORK_END_MIN: i64 = 17 * 60;
const SLOT_MINUTES: i64 = 30;

/// Compute the free time slots inside a share's range, given the share's
/// busy events. Busy intervals are merged (overlapping/adjacent), then the
/// working window of each calendar day is walked to find gaps. Each
/// contiguous free gap is emitted as a single slot.
pub fn compute_free_slots(
    range_start: DateTime<chrono::Utc>,
    range_end: DateTime<chrono::Utc>,
    events: &[PublicEvent],
    timezone: &str,
) -> Vec<crate::shares::models::FreeSlot> {
    let tz: chrono_tz::Tz = timezone.parse().unwrap_or(chrono_tz::UTC);
    let mut slots = Vec::new();

    // Convert each event to a busy interval expressed in local minutes of day.
    let mut busy: Vec<(i64, i64)> = events
        .iter()
        .map(|e| {
            let s = e.start_time.with_timezone(&tz);
            let en = e.end_time.with_timezone(&tz);
            let start_min = s.hour() as i64 * 60 + s.minute() as i64;
            let end_min = en.hour() as i64 * 60 + en.minute() as i64;
            let end_min = if end_min <= start_min {
                WORK_END_MIN
            } else {
                end_min
            };
            (start_min, end_min)
        })
        .collect();

    busy.sort_by_key(|b| b.0);

    // Merge overlapping/adjacent busy intervals.
    let mut merged: Vec<(i64, i64)> = Vec::new();
    for (s, e) in busy {
        if let Some(last) = merged.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        merged.push((s, e));
    }

    // Walk each calendar day in the range.
    let mut cursor = range_start.with_timezone(&tz).date_naive();
    let last = range_end.with_timezone(&tz).date_naive();
    while cursor <= last {
        let work_start_min =
            cursor.and_hms_opt(0, 0, 0).unwrap() + chrono::Duration::minutes(WORK_START_MIN);
        let _work_end_min =
            cursor.and_hms_opt(0, 0, 0).unwrap() + chrono::Duration::minutes(WORK_END_MIN);

        // Busy intervals for this day, clamped to the working window.
        let day_busy: Vec<(i64, i64)> = merged
            .iter()
            .map(|(s, e)| {
                let cs = (*s).max(WORK_START_MIN);
                let ce = (*e).min(WORK_END_MIN);
                (cs, ce)
            })
            .filter(|(s, e)| e > s)
            .collect();

        // Walk the working window and emit free gaps.
        let mut t = WORK_START_MIN;
        let end = WORK_END_MIN;
        while t < end {
            let blocked = day_busy.iter().any(|(s, e)| t >= *s && t < *e);
            if blocked {
                t += SLOT_MINUTES;
                continue;
            }
            // Find the end of this free gap (next busy start, or work end).
            let mut gap_end = end;
            for (s, e) in &day_busy {
                if *s > t && *s < gap_end {
                    gap_end = *s;
                }
                let _ = e;
            }
            let slot_start = work_start_min + chrono::Duration::minutes(t - WORK_START_MIN);
            let slot_end = work_start_min + chrono::Duration::minutes(gap_end - WORK_START_MIN);
            if slot_end > slot_start {
                slots.push(crate::shares::models::FreeSlot {
                    start: slot_start.and_utc().with_timezone(&chrono::Utc),
                    end: slot_end.and_utc().with_timezone(&chrono::Utc),
                });
            }
            t = gap_end;
        }
        cursor += chrono::Duration::days(1);
    }

    slots
}

pub struct CreateShareRequest {
    pub calendar_id: Uuid,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub visibility: crate::shares::models::Visibility,
    pub expires_at: Option<DateTime<chrono::Utc>>,
    pub timezone: String,
}

pub struct CreateShareResult {
    pub share: crate::shares::models::Share,
    pub url: String,
}

pub struct ShareService<S> {
    pub pool: crate::db::PgPool,
    pub token_service: S,
    pub public_base_url: String,
    pub token_encryption_key: [u8; 32],
}

impl<S: TokenService> ShareService<S> {
    pub async fn create_share(
        &self,
        user_id: Uuid,
        calendar_id: Uuid,
        events: Vec<CalendarEvent>,
        req: CreateShareRequest,
    ) -> Result<CreateShareResult, String> {
        crate::shares::models::validate_share_range(req.start_time, req.end_time)?;

        let visibility = req.visibility;
        let timezone = req.timezone.clone();

        let filtered: Vec<CalendarEvent> = events
            .into_iter()
            .filter(|e| e.intersects(req.start_time, req.end_time))
            .collect();

        let token = self.token_service.generate()?;
        let token_hash = self.token_service.hash(&token)?;

        let token_encrypted = crate::encryption::encrypt(&token, &self.token_encryption_key).ok();

        let share_id = Uuid::new_v4();
        let new_share = NewShare {
            id: share_id,
            user_id,
            calendar_id,
            token_hash: token_hash.clone(),
            token_encrypted,
            start_time: req.start_time,
            end_time: req.end_time,
            timezone: timezone.clone(),
            visibility: visibility.as_str().to_string(),
            expires_at: req.expires_at,
        };

        let share = crate::db::queries::create_share(&self.pool, &new_share)
            .await
            .map_err(|e| e.to_string())?;

        let new_events: Vec<NewShareEvent> = filtered
            .iter()
            .map(|e| NewShareEvent {
                id: Uuid::new_v4(),
                share_id,
                provider_event_id: e.provider_event_id.clone(),
                title: e.title.clone(),
                start_time: e.start,
                end_time: e.end,
                location: e.location.clone(),
                description: e.description.clone(),
                is_all_day: e.is_all_day,
            })
            .collect();

        crate::db::queries::create_share_events(&self.pool, &new_events)
            .await
            .map_err(|e| e.to_string())?;

        let url = format!("{}/s/{}", self.public_base_url, token);

        Ok(CreateShareResult { share, url })
    }

    pub async fn public_share_events(
        &self,
        token: &str,
    ) -> Result<Option<(crate::shares::models::Share, Vec<PublicEvent>)>, String> {
        let token_hash = self.token_service.hash(token)?;
        let share = crate::db::queries::get_share_by_token_hash(&self.pool, &token_hash)
            .await
            .map_err(|e| e.to_string())?;

        let share = match share {
            Some(s) => s,
            None => return Ok(None),
        };

        if share.revoked_at.is_some() {
            return Err("share revoked".into());
        }
        if let Some(expires_at) = share.expires_at {
            if expires_at <= chrono::Utc::now() {
                return Err("share expired".into());
            }
        }

        let events = crate::db::queries::list_share_events(&self.pool, share.id)
            .await
            .map_err(|e| e.to_string())?;

        let projected: Vec<PublicEvent> = events
            .iter()
            .map(|e| {
                let source = CalendarEvent {
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start: e.start_time,
                    end: e.end_time,
                    timezone: None,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                };
                crate::shares::models::project_event_for_visibility(
                    &source,
                    share.visibility_enum(),
                )
            })
            .collect();

        Ok(Some((share, projected)))
    }

    pub fn decrypt_token(&self, share: &crate::shares::models::Share) -> Option<String> {
        let encrypted = share.token_encrypted.as_ref()?;
        crate::encryption::decrypt(encrypted, &self.token_encryption_key).ok()
    }

    /// Project a share's stored events for public viewing (used by handlers
    /// that need the events without resolving a token).
    pub async fn public_share_events_for_id(
        &self,
        share: &crate::shares::models::Share,
    ) -> Result<Vec<PublicEvent>, String> {
        let events = crate::db::queries::list_share_events(&self.pool, share.id)
            .await
            .map_err(|e| e.to_string())?;
        let projected: Vec<PublicEvent> = events
            .iter()
            .map(|e| {
                let source = CalendarEvent {
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start: e.start_time,
                    end: e.end_time,
                    timezone: None,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                };
                crate::shares::models::project_event_for_visibility(
                    &source,
                    share.visibility_enum(),
                )
            })
            .collect();
        Ok(projected)
    }

    /// Compute the free time slots for a share, given its current events.
    pub async fn free_slots(
        &self,
        token: &str,
    ) -> Result<Option<Vec<crate::shares::models::FreeSlot>>, String> {
        let Some((share, events)) = self.public_share_events(token).await? else {
            return Ok(None);
        };
        let projected: Vec<PublicEvent> = events;
        let slots = compute_free_slots(
            share.start_time,
            share.end_time,
            &projected,
            &share.timezone,
        );
        Ok(Some(slots))
    }

    /// Add a contributor's calendar to this share (by token) and recompute the
    /// merged busy events. Returns the updated share and events.
    pub async fn add_contributor_by_token(
        &self,
        token: &str,
        calendar_id: Uuid,
        user_id: Uuid,
    ) -> Result<(crate::shares::models::Share, Vec<PublicEvent>), String> {
        let Some((share, _existing)) = self.public_share_events(token).await? else {
            return Err("share not found".into());
        };
        self.add_contributor(share.id, calendar_id, user_id).await
    }

    /// Add a contributor's calendar to this share (by id) and recompute the
    /// merged busy events. Returns the updated share and events.
    pub async fn add_contributor(
        &self,
        share_id: Uuid,
        calendar_id: Uuid,
        user_id: Uuid,
    ) -> Result<(crate::shares::models::Share, Vec<PublicEvent>), String> {
        let share = crate::db::queries::get_share_by_id(&self.pool, share_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "share not found".to_string())?;

        // Fetch the calendar's events for the share's range.
        let calendar = crate::db::queries::get_calendar_by_id(&self.pool, calendar_id, user_id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "calendar not found".to_string())?;

        let provider = self.make_provider(user_id, calendar.connection_id).await;
        let new_events = provider
            .list_events(
                &calendar.provider_calendar_id,
                share.start_time,
                share.end_time,
            )
            .await
            .map_err(|e| e.to_string())?;

        // Record the contributor.
        crate::db::queries::add_share_contributor(&self.pool, share_id, user_id, calendar_id)
            .await
            .map_err(|e| e.to_string())?;

        // Merge the new events into the share's existing events (dedupe by
        // provider_event_id), then recompute the projected public events.
        let mut existing = crate::db::queries::list_share_events(&self.pool, share_id)
            .await
            .map_err(|e| e.to_string())?;
        let mut seen: std::collections::HashSet<Option<String>> = std::collections::HashSet::new();
        existing.retain(|e| seen.insert(e.provider_event_id.clone()));
        for e in &new_events {
            if seen.insert(e.provider_event_id.clone()) {
                existing.push(crate::shares::models::ShareEvent {
                    id: Uuid::new_v4(),
                    share_id,
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start_time: e.start,
                    end_time: e.end,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                    created_at: chrono::Utc::now(),
                });
            }
        }
        crate::db::queries::create_share_events(
            &self.pool,
            &existing
                .iter()
                .map(|e| crate::shares::models::NewShareEvent {
                    id: e.id,
                    share_id: e.share_id,
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start_time: e.start_time,
                    end_time: e.end_time,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                })
                .collect::<Vec<_>>(),
        )
        .await
        .map_err(|e| e.to_string())?;

        let projected: Vec<PublicEvent> = existing
            .iter()
            .map(|e| {
                let source = CalendarEvent {
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start: e.start_time,
                    end: e.end_time,
                    timezone: None,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                };
                crate::shares::models::project_event_for_visibility(
                    &source,
                    share.visibility_enum(),
                )
            })
            .collect();

        Ok((share, projected))
    }

    async fn make_provider(
        &self,
        user_id: Uuid,
        connection_id: Uuid,
    ) -> crate::calendar::google::GoogleCalendarProvider<
        crate::calendar::models::RealGoogleOAuthClient,
    > {
        let config = crate::config::Config::from_env().unwrap_or_else(|_| crate::config::Config {
            database_url: None,
            google_client_id: None,
            google_client_secret: None,
            google_redirect_uri: None,
            session_secret: None,
            token_encryption_key: None,
            public_base_url: None,
            redis_url: None,
            port: 3000,
        });
        let oauth = crate::calendar::models::RealGoogleOAuthClient::new(
            config.google_client_id_or(""),
            config.google_client_secret_or(""),
            config.google_redirect_uri_or(""),
        );
        crate::calendar::google::GoogleCalendarProvider::new(oauth, self.pool.clone(), user_id)
            .with_connection(connection_id)
    }
}

pub trait TokenService: Send + Sync {
    fn generate(&self) -> Result<String, String>;
    fn hash(&self, token: &str) -> Result<String, String>;
}

pub struct RealTokenService;

impl TokenService for RealTokenService {
    fn generate(&self) -> Result<String, String> {
        use base64::Engine;
        use rand::RngCore;
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
    }

    fn hash(&self, token: &str) -> Result<String, String> {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        Ok(format!("{:x}", hasher.finalize()))
    }
}
