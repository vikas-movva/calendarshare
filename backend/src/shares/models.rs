use chrono::DateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::calendar::models::CalendarEvent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Visibility {
    Busy,
    TitleTime,
    Details,
}

impl Visibility {
    pub fn parse(value: &str) -> Option<Visibility> {
        match value {
            "busy" => Some(Visibility::Busy),
            "title_time" => Some(Visibility::TitleTime),
            "details" => Some(Visibility::Details),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Visibility::Busy => "busy",
            Visibility::TitleTime => "title_time",
            Visibility::Details => "details",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PublicEvent {
    pub title: Option<String>,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub is_all_day: bool,
}

pub fn project_event_for_visibility(event: &CalendarEvent, visibility: Visibility) -> PublicEvent {
    match visibility {
        Visibility::Busy => PublicEvent {
            title: None,
            start_time: event.start,
            end_time: event.end,
            location: None,
            description: None,
            is_all_day: event.is_all_day,
        },
        Visibility::TitleTime => PublicEvent {
            title: event.title.clone(),
            start_time: event.start,
            end_time: event.end,
            location: None,
            description: None,
            is_all_day: event.is_all_day,
        },
        Visibility::Details => PublicEvent {
            title: event.title.clone(),
            start_time: event.start,
            end_time: event.end,
            location: event.location.clone(),
            description: event.description.clone(),
            is_all_day: event.is_all_day,
        },
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Share {
    pub id: Uuid,
    pub user_id: Uuid,
    pub calendar_id: Uuid,
    pub token_hash: String,
    pub token_encrypted: Option<String>,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub timezone: String,
    pub visibility: String,
    pub expires_at: Option<DateTime<chrono::Utc>>,
    pub revoked_at: Option<DateTime<chrono::Utc>>,
    pub created_at: DateTime<chrono::Utc>,
}

impl Share {
    pub fn visibility_enum(&self) -> Visibility {
        Visibility::parse(&self.visibility).unwrap_or(Visibility::Busy)
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ShareEvent {
    pub id: Uuid,
    pub share_id: Uuid,
    pub provider_event_id: Option<String>,
    pub title: Option<String>,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub is_all_day: bool,
    pub created_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewShare {
    pub id: Uuid,
    pub user_id: Uuid,
    pub calendar_id: Uuid,
    pub token_hash: String,
    pub token_encrypted: Option<String>,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub timezone: String,
    pub visibility: String,
    pub expires_at: Option<DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewShareEvent {
    pub id: Uuid,
    pub share_id: Uuid,
    pub provider_event_id: Option<String>,
    pub title: Option<String>,
    pub start_time: DateTime<chrono::Utc>,
    pub end_time: DateTime<chrono::Utc>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub is_all_day: bool,
}

pub fn validate_share_range(
    start: DateTime<chrono::Utc>,
    end: DateTime<chrono::Utc>,
) -> Result<(), String> {
    if start >= end {
        return Err("start_time must be before end_time".into());
    }
    let duration = end - start;
    if duration > chrono::Duration::days(366) {
        return Err("share range must not exceed 366 days".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct PublicShareResponse {
    pub owner: OwnerInfo,
    pub range: ShareRange,
    pub timezone: String,
    pub visibility: String,
    pub events: Vec<PublicEvent>,
    pub contributors: Vec<ShareContributorInfo>,
    pub polls: Vec<crate::polls::models::Poll>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OwnerInfo {
    pub display_name: Option<String>,
}

/// A free time window derived from a share's busy events. Free slots are
/// computed from the share's events at poll-creation time and are immutable.
#[derive(Debug, Clone, Serialize)]
pub struct FreeSlot {
    pub start: DateTime<chrono::Utc>,
    pub end: DateTime<chrono::Utc>,
}

/// A contributor to a share: a user whose calendars were merged into the
/// share's busy-time snapshot.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ShareContributor {
    pub id: Uuid,
    pub share_id: Uuid,
    pub user_id: Uuid,
    pub calendar_id: Uuid,
    pub created_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShareContributorInfo {
    pub user_id: Uuid,
    pub display_name: Option<String>,
    pub calendars: Vec<ContributorCalendar>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContributorCalendar {
    pub calendar_id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShareRange {
    pub start: DateTime<chrono::Utc>,
    pub end: DateTime<chrono::Utc>,
}

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;
