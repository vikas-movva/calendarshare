use chrono::{DateTime, Timelike};
use std::collections::HashMap;
use uuid::Uuid;

use crate::calendar::models::CalendarEvent;
use crate::calendar::provider::CalendarProvider;
use crate::shares::models::{NewShare, NewShareEvent, PublicEvent};

/// Working window, in minutes-of-day (share-local time), used when computing
/// free slots. Free slots are 30-minute granularity and only fall inside this
/// window on each calendar day. The window spans the full day so the computed
/// free times are not artificially truncated to business hours.
const WORK_START_MIN: i64 = 0;
const WORK_END_MIN: i64 = 24 * 60;
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
    let range_start_local = range_start.with_timezone(&tz);
    let range_end_local = range_end.with_timezone(&tz);
    let range_start_day = range_start_local.date_naive();
    let range_end_day = range_end_local.date_naive();
    let range_start_min = range_start_local.time().hour() as i64 * 60 + range_start_local.time().minute() as i64;
    let range_end_min = range_end_local.time().hour() as i64 * 60 + range_end_local.time().minute() as i64;

    let mut cursor = range_start_day;
    while cursor <= range_end_day {
        let day_start = cursor.and_hms_opt(0, 0, 0).unwrap();
        let t0 = if cursor == range_start_day {
            WORK_START_MIN.max(range_start_min)
        } else {
            WORK_START_MIN
        };
        let t1 = if cursor == range_end_day {
            WORK_END_MIN.min(range_end_min)
        } else {
            WORK_END_MIN
        };

        // Busy intervals for this day, clamped to the working window.
        let day_busy: Vec<(i64, i64)> = merged
            .iter()
            .map(|(s, e)| {
                let cs = (*s).max(t0);
                let ce = (*e).min(t1);
                (cs, ce)
            })
            .filter(|(s, e)| e > s)
            .collect();

        // Walk the working window and emit free gaps.
        let mut t = t0;
        while t < t1 {
            let blocked = day_busy.iter().any(|(s, e)| t >= *s && t < *e);
            if blocked {
                t += SLOT_MINUTES;
                continue;
            }
            // Find the end of this free gap (next busy start, or work end).
            let mut gap_end = t1;
            for (s, e) in &day_busy {
                if *s > t && *s < gap_end {
                    gap_end = *s;
                }
                let _ = e;
            }
            let slot_start = day_start + chrono::Duration::minutes(t - WORK_START_MIN);
            let slot_end = day_start + chrono::Duration::minutes(gap_end - WORK_START_MIN);
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
    /// When true, every calendar day in the range is marked busy from
    /// 09:00 to 17:00 (share-local time) in addition to the owner's real
    /// events. Recipients then only see free time outside business hours.
    pub mark_working_hours_busy: bool,
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

        // Optionally mark 09:00–17:00 (share-local time) as busy on every
        // calendar day in the range. These are synthetic "busy" blocks with no
        // real event backing them; they shrink the computed free times to
        // outside business hours.
        let mut new_events: Vec<NewShareEvent> = filtered
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
                owner_user_id: Some(user_id),
            })
            .collect();
        if req.mark_working_hours_busy {
                for block in Self::working_hours_blocks(req.start_time, req.end_time, &timezone) {
                    new_events.push(NewShareEvent {
                        id: Uuid::new_v4(),
                        share_id,
                        provider_event_id: Some(format!("working-hours-{}", block.start.to_rfc3339())),
                        title: Some("Working hours".to_string()),
                        start_time: block.start,
                        end_time: block.end,
                        location: None,
                        description: None,
                        is_all_day: false,
                        owner_user_id: Some(user_id),
                    });
                }
            }

        crate::db::queries::create_share_events(&self.pool, &new_events)
            .await
            .map_err(|e| e.to_string())?;

        let url = format!("{}/s/{}", self.public_base_url, token);

        Ok(CreateShareResult { share, url })
    }

    /// Build one 09:00–17:00 busy block per calendar day in [start, end), in the
    /// share's timezone, as UTC instants. Days are enumerated in the local
    /// timezone so the blocks always land on the owner's calendar days.
    fn working_hours_blocks(
        start: DateTime<chrono::Utc>,
        end: DateTime<chrono::Utc>,
        tz: &str,
    ) -> Vec<CalendarEvent> {
        let tz: chrono_tz::Tz = tz.parse().unwrap_or(chrono_tz::UTC);
        let start_local = start.with_timezone(&tz);
        let end_local = end.with_timezone(&tz);

        let mut cursor = start_local.date_naive();
        let last = end_local.date_naive();
        let mut blocks = Vec::new();
        while cursor <= last {
            let day_start = cursor.and_hms_opt(9, 0, 0).unwrap();
            let day_end = cursor.and_hms_opt(17, 0, 0).unwrap();
            // Skip the block if the working window falls entirely outside the
            // share range (only relevant on boundary days).
            if day_end.and_utc().with_timezone(&chrono::Utc) > start
                && day_start.and_utc().with_timezone(&chrono::Utc) < end
            {
                blocks.push(CalendarEvent {
                    provider_event_id: None,
                    title: Some("Working hours".to_string()),
                    start: day_start.and_utc().with_timezone(&chrono::Utc),
                    end: day_end.and_utc().with_timezone(&chrono::Utc),
                    timezone: Some(tz.to_string()),
                    location: None,
                    description: None,
                    is_all_day: false,
                });
            }
            cursor += chrono::Duration::days(1);
        }
        blocks
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

        let projected = self.project_events(&share, &events).await?;

        Ok(Some((share, projected)))
    }

    pub fn decrypt_token(&self, share: &crate::shares::models::Share) -> Option<String> {
        let encrypted = share.token_encrypted.as_ref()?;
        crate::encryption::decrypt(encrypted, &self.token_encryption_key).ok()
    }

    /// Project a share's stored events for public viewing, resolving each
    /// event's owner_user_id to a display name. Used by handlers that need the
    /// events without resolving a token.
    pub async fn public_share_events_for_id(
        &self,
        share: &crate::shares::models::Share,
    ) -> Result<Vec<PublicEvent>, String> {
        let events = crate::db::queries::list_share_events(&self.pool, share.id)
            .await
            .map_err(|e| e.to_string())?;
        self.project_events(share, &events).await
    }

    async fn project_events(
        &self,
        share: &crate::shares::models::Share,
        events: &[crate::shares::models::ShareEvent],
    ) -> Result<Vec<PublicEvent>, String> {
        let owner_ids: Vec<Uuid> = events
            .iter()
            .filter_map(|e| e.owner_user_id)
            .collect();
        let names: HashMap<Uuid, Option<String>> =
            crate::db::queries::get_display_names_by_ids(&self.pool, &owner_ids)
                .await
                .map_err(|e| e.to_string())?;

        Ok(events
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
                let owner_name = e
                    .owner_user_id
                    .and_then(|uid| names.get(&uid))
                    .cloned()
                    .flatten();
                crate::shares::models::project_event_for_visibility(
                    &source,
                    share.visibility_enum(),
                    e.owner_user_id,
                    owner_name,
                )
            })
            .collect())
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
        // provider_event_id), preserving each event's owner_user_id, then
        // recompute the projected public events. Only the genuinely new events
        // are inserted — existing rows are left untouched, so re-adding a
        // contributor never violates the share_events primary key.
        let mut existing = crate::db::queries::list_share_events(&self.pool, share_id)
            .await
            .map_err(|e| e.to_string())?;
        let mut seen: std::collections::HashSet<Option<String>> = existing
            .iter()
            .map(|e| e.provider_event_id.clone())
            .collect();
        let mut new_rows: Vec<crate::shares::models::NewShareEvent> = Vec::new();
        for e in &new_events {
            if seen.insert(e.provider_event_id.clone()) {
                new_rows.push(crate::shares::models::NewShareEvent {
                    id: Uuid::new_v4(),
                    share_id,
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start_time: e.start,
                    end_time: e.end,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                    owner_user_id: Some(user_id),
                });
                existing.push(crate::shares::models::ShareEvent {
                    id: new_rows.last().unwrap().id,
                    share_id,
                    provider_event_id: e.provider_event_id.clone(),
                    title: e.title.clone(),
                    start_time: e.start,
                    end_time: e.end,
                    location: e.location.clone(),
                    description: e.description.clone(),
                    is_all_day: e.is_all_day,
                    created_at: chrono::Utc::now(),
                    owner_user_id: Some(user_id),
                });
            }
        }
        if !new_rows.is_empty() {
            crate::db::queries::create_share_events(&self.pool, &new_rows)
                .await
                .map_err(|e| e.to_string())?;
        }

        let projected = self.project_events(&share, &existing).await?;

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
