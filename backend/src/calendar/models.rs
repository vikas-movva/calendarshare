use chrono::DateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Calendar {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub provider_calendar_id: String,
    pub name: String,
    pub timezone: Option<String>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CalendarConnection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_account_id: Option<String>,
    pub access_token_encrypted: String,
    pub refresh_token_encrypted: Option<String>,
    pub expires_at: Option<DateTime<chrono::Utc>>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertCalendar {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub provider_calendar_id: String,
    pub name: String,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertConnection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_account_id: Option<String>,
    pub access_token_encrypted: String,
    pub refresh_token_encrypted: Option<String>,
    pub expires_at: Option<DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleUserInfo {
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarList {
    pub items: Vec<GoogleCalendarItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleCalendarItem {
    pub id: String,
    pub summary: Option<String>,
    pub timeZone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventsList {
    pub items: Vec<GoogleEventItem>,
    #[serde(rename = "nextPageToken")]
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventItem {
    pub id: Option<String>,
    pub summary: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub start: Option<GoogleEventDateTime>,
    pub end: Option<GoogleEventDateTime>,
}

use async_trait::async_trait;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleEventDateTime {
    pub date: Option<String>,
    #[serde(rename = "dateTime")]
    pub date_time: Option<String>,
    pub timezone: Option<String>,
}

#[async_trait]
pub trait GoogleOAuthClient: Send + Sync {
    async fn exchange_code(&self, code: &str) -> Result<GoogleTokenResponse, reqwest::Error>;
    async fn refresh_token(&self, refresh_token: &str) -> Result<GoogleTokenResponse, reqwest::Error>;
    async fn get_user_info(&self, access_token: &str) -> Result<GoogleUserInfo, reqwest::Error>;
    async fn list_calendars(&self, access_token: &str) -> Result<GoogleCalendarList, reqwest::Error>;
    async fn list_events(
        &self,
        access_token: &str,
        calendar_id: &str,
        time_min: &str,
        time_max: &str,
    ) -> Result<GoogleEventsList, reqwest::Error>;
}

#[derive(Debug, Clone)]
pub struct RealGoogleOAuthClient {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub http: reqwest::Client,
}

impl RealGoogleOAuthClient {
    pub fn new(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        Self {
            client_id,
            client_secret,
            redirect_uri,
            http: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl GoogleOAuthClient for RealGoogleOAuthClient {
    async fn exchange_code(&self, code: &str) -> Result<GoogleTokenResponse, reqwest::Error> {
        self.http
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("code", code),
                ("grant_type", "authorization_code"),
                ("redirect_uri", self.redirect_uri.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<GoogleTokenResponse>()
            .await
    }

    async fn refresh_token(&self, refresh_token: &str) -> Result<GoogleTokenResponse, reqwest::Error> {
        self.http
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("refresh_token", refresh_token),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<GoogleTokenResponse>()
            .await
    }

    async fn get_user_info(&self, access_token: &str) -> Result<GoogleUserInfo, reqwest::Error> {
        self.http
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await?
            .error_for_status()?
            .json::<GoogleUserInfo>()
            .await
    }

    async fn list_calendars(&self, access_token: &str) -> Result<GoogleCalendarList, reqwest::Error> {
        self.http
            .get("https://www.googleapis.com/calendar/v3/users/me/calendarlist")
            .bearer_auth(access_token)
            .send()
            .await?
            .error_for_status()?
            .json::<GoogleCalendarList>()
            .await
    }

    async fn list_events(
        &self,
        access_token: &str,
        calendar_id: &str,
        time_min: &str,
        time_max: &str,
    ) -> Result<GoogleEventsList, reqwest::Error> {
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events",
            urlencoding::encode(calendar_id)
        );
        self.http
            .get(&url)
            .bearer_auth(access_token)
            .query(&[
                ("timeMin", time_min),
                ("timeMax", time_max),
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("maxResults", "2500"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<GoogleEventsList>()
            .await
    }
}

#[derive(Debug, Clone)]
pub struct CalendarEvent {
    pub provider_event_id: Option<String>,
    pub title: Option<String>,
    pub start: DateTime<chrono::Utc>,
    pub end: DateTime<chrono::Utc>,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub is_all_day: bool,
}

impl CalendarEvent {
    pub fn intersects(&self, start: DateTime<chrono::Utc>, end: DateTime<chrono::Utc>) -> bool {
        self.start < end && self.end > start
    }
}