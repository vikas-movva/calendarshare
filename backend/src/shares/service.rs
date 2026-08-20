use chrono::{DateTime, Datelike, Duration, LocalResult, NaiveDateTime, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
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

/// Converts a NaiveDateTime to Utc safely, handling DST transitions without panicking.
fn safe_local_to_utc(naive: NaiveDateTime, tz: Tz) -> DateTime<Utc> {
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => dt.with_timezone(&Utc),
        LocalResult::Ambiguous(dt, _) => dt.with_timezone(&Utc),
        LocalResult::None => {
            // Spring-forward gap: advance local time by 1 hour to fall into valid time
            tz.from_local_datetime(&(naive + Duration::hours(1)))
                .single()
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|| naive.and_utc())
        }
    }
}

pub fn compute_free_slots(
    range_start: DateTime<Utc>,
    range_end: DateTime<Utc>,
    events: &[PublicEvent],
    timezone: &str,
) -> Vec<crate::shares::models::FreeSlot> {
    if range_start >= range_end {
        return Vec::new();
    }

    let tz: Tz = timezone.parse().unwrap_or(chrono_tz::UTC);
    let range_start_local = range_start.with_timezone(&tz);
    let range_end_local = range_end.with_timezone(&tz);

    let range_start_day = range_start_local.date_naive();
    // Prevent an extra zero-length day iteration if range_end falls exactly on local midnight
    let range_end_day = if range_end_local.time()
        == chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap()
        && range_end_local > range_start_local
    {
        (range_end_local - Duration::milliseconds(1)).date_naive()
    } else {
        range_end_local.date_naive()
    };

    let mut slots = Vec::new();
    let mut cursor = range_start_day;

    while cursor <= range_end_day {
        let day_midnight = match cursor.and_hms_opt(0, 0, 0) {
            Some(dt) => dt,
            None => continue,
        };

        let work_start_naive = day_midnight + Duration::minutes(WORK_START_MIN);
        let work_end_naive = day_midnight + Duration::minutes(WORK_END_MIN);

        let work_start_utc = safe_local_to_utc(work_start_naive, tz);
        let work_end_utc = safe_local_to_utc(work_end_naive, tz);

        // Clamp today's working hours window to the overall query range
        let window_start = work_start_utc.max(range_start);
        let window_end = work_end_utc.min(range_end);

        if window_start >= window_end {
            cursor += Duration::days(1);
            continue;
        }

        // Intersect events with today's clamped working window directly in UTC
        let mut day_busy: Vec<(DateTime<Utc>, DateTime<Utc>)> = events
            .iter()
            .map(|e| (e.start_time.max(window_start), e.end_time.min(window_end)))
            .filter(|(s, e)| s < e)
            .collect();

        day_busy.sort_by_key(|(s, _)| *s);

        // Merge overlapping/adjacent busy intervals
        let mut merged_busy: Vec<(DateTime<Utc>, DateTime<Utc>)> = Vec::new();
        for (s, e) in day_busy {
            if let Some(last) = merged_busy.last_mut() {
                if s <= last.1 {
                    last.1 = last.1.max(e);
                    continue;
                }
            }
            merged_busy.push((s, e));
        }

        // Walk today's working window to emit free gaps
        let mut current = window_start;
        for (b_start, b_end) in merged_busy {
            if current < b_start {
                slots.push(crate::shares::models::FreeSlot {
                    start: current,
                    end: b_start,
                });
            }
            current = current.max(b_end);
        }

        if current < window_end {
            slots.push(crate::shares::models::FreeSlot {
                start: current,
                end: window_end,
            });
        }

        cursor += Duration::days(1);
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
    /// Days of the week (0=Sun … 6=Sat) the 09:00–17:00 blocks apply to.
    /// An empty vec means every day in the range.
    pub working_hours_days: Vec<u8>,
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
            working_hours_days: sqlx::types::Json(req.working_hours_days.clone()),
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
            for block in Self::working_hours_blocks(
                req.start_time,
                req.end_time,
                &timezone,
                &req.working_hours_days,
            ) {
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
    ///
    /// `working_hours_days` (0=Sun … 6=Sat) selects which days get a block.
    /// An empty vec means every day in the range.
    fn working_hours_blocks(
        start: DateTime<chrono::Utc>,
        end: DateTime<chrono::Utc>,
        tz: &str,
        working_hours_days: &[u8],
    ) -> Vec<CalendarEvent> {
        let tz: chrono_tz::Tz = tz.parse().unwrap_or(chrono_tz::UTC);
        let start_local = start.with_timezone(&tz);
        let end_local = end.with_timezone(&tz);

        let mut cursor = start_local.date_naive();
        let last = end_local.date_naive();
        let mut blocks = Vec::new();
        while cursor <= last {
            // JS Date.getDay() and NaiveDate.weekday() disagree on numbering
            // (weekday() is Mon=0). Map to the JS convention: Sun=0 … Sat=6.
            let js_day = (cursor.weekday().num_days_from_monday() + 1) % 7;
            let applies =
                working_hours_days.is_empty() || working_hours_days.contains(&(js_day as u8));

            if applies {
                // Build the 09:00–17:00 block in the share's local timezone.
                // `from_local_datetime` anchors the naive wall-clock time to
                // `tz` (e.g. 09:00 EDT → 13:00 UTC), so it displays back as
                // 09:00 to viewers in that zone. Using `.and_utc()` instead
                // would store 09:00 UTC and render as 05:00 in Eastern.
                let day_start = tz
                    .from_local_datetime(&cursor.and_hms_opt(9, 0, 0).unwrap())
                    .unwrap();
                let day_end = tz
                    .from_local_datetime(&cursor.and_hms_opt(17, 0, 0).unwrap())
                    .unwrap();
                // Skip the block if the working window falls entirely outside the
                // share range (only relevant on boundary days).
                if day_end.with_timezone(&chrono::Utc) > start
                    && day_start.with_timezone(&chrono::Utc) < end
                {
                    blocks.push(CalendarEvent {
                        provider_event_id: None,
                        title: Some("Working hours".to_string()),
                        start: day_start.with_timezone(&chrono::Utc),
                        end: day_end.with_timezone(&chrono::Utc),
                        timezone: Some(tz.to_string()),
                        location: None,
                        description: None,
                        is_all_day: false,
                    });
                }
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
        let owner_ids: Vec<Uuid> = events.iter().filter_map(|e| e.owner_user_id).collect();
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono_tz::America;

    /// The 09:00–17:00 working-hours block must be anchored to the share's
    /// local timezone, not UTC. Storing it as a UTC naive datetime renders
    /// as 05:00–13:00 in Eastern (and similarly offset elsewhere).
    #[test]
    fn working_hours_blocks_are_local_to_share_timezone() {
        // A single day fully inside the range, in Eastern (UTC-4 in August).
        let start = "2026-08-18T00:00:00Z"
            .parse::<DateTime<chrono::Utc>>()
            .unwrap();
        let end = "2026-08-19T00:00:00Z"
            .parse::<DateTime<chrono::Utc>>()
            .unwrap();

        let blocks = ShareService::<RealTokenService>::working_hours_blocks(
            start,
            end,
            "America/New_York",
            &[],
        );

        assert_eq!(blocks.len(), 1, "one full day in range → one block");

        let back_to_eastern = |dt: &DateTime<chrono::Utc>| dt.with_timezone(&America::New_York);

        let s = back_to_eastern(&blocks[0].start);
        let e = back_to_eastern(&blocks[0].end);

        assert_eq!(
            (s.hour(), s.minute()),
            (9, 0),
            "block starts at 09:00 local"
        );
        assert_eq!((e.hour(), e.minute()), (17, 0), "block ends at 17:00 local");
    }

    /// Free slots must be anchored to the share's local timezone too. The old
    /// code emitted naive midnight interpreted as UTC, so a free window that
    /// should read 00:00–09:00 in Eastern rendered as 20:00–05:00 locally.
    #[test]
    fn free_slots_are_local_to_share_timezone() {
        // 2026-08-18T04:00Z == 00:00 EDT; 2026-08-19T04:00Z == 00:00 EDT the
        // next day — a single full local day in Eastern.
        let start = "2026-08-18T04:00:00Z"
            .parse::<DateTime<chrono::Utc>>()
            .unwrap();
        let end = "2026-08-19T04:00:00Z"
            .parse::<DateTime<chrono::Utc>>()
            .unwrap();

        // A single busy event 09:00–17:00 local Eastern leaves 00:00–09:00
        // and 17:00–24:00 free.
        let events = vec![crate::shares::models::PublicEvent {
            title: Some("Work".into()),
            start_time: "2026-08-18T13:00:00Z".parse().unwrap(), // 09:00 EDT
            end_time: "2026-08-18T21:00:00Z".parse().unwrap(),   // 17:00 EDT
            location: None,
            description: None,
            is_all_day: false,
            owner_user_id: None,
            owner_display_name: None,
        }];

        let slots = compute_free_slots(start, end, &events, "America/New_York");

        assert_eq!(slots.len(), 2, "two free gaps around the busy block");
        let eastern = |dt: &DateTime<chrono::Utc>| dt.with_timezone(&America::New_York);
        let s0 = eastern(&slots[0].start);
        let e0 = eastern(&slots[0].end);
        assert_eq!(
            (s0.hour(), s0.minute()),
            (0, 0),
            "first free slot starts at midnight local"
        );
        assert_eq!(
            (e0.hour(), e0.minute()),
            (9, 0),
            "first free slot ends at 09:00 local"
        );
    }
}
