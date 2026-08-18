use async_trait::async_trait;
use tracing::info_span;

use crate::calendar::models::{Calendar, CalendarEvent};
use crate::calendar::provider::CalendarProviderError;
use crate::encryption;

pub struct GoogleCalendarProvider<C: crate::calendar::models::GoogleOAuthClient> {
    oauth: C,
    pool: crate::db::PgPool,
    user_id: uuid::Uuid,
    connection_id: Option<uuid::Uuid>,
}

impl<C: crate::calendar::models::GoogleOAuthClient> GoogleCalendarProvider<C> {
    pub fn new(oauth: C, pool: crate::db::PgPool, user_id: uuid::Uuid) -> Self {
        Self {
            oauth,
            pool,
            user_id,
            connection_id: None,
        }
    }

    pub fn with_connection(mut self, connection_id: uuid::Uuid) -> Self {
        self.connection_id = Some(connection_id);
        self
    }

    async fn get_valid_access_token(&self) -> Result<String, CalendarProviderError> {
        self.get_valid_access_token_inner(false).await
    }

    /// Force a refresh regardless of the stored expiry. Used to recover when
    /// Google rejects the access token (401/403/404) even though the stored
    /// expiry is still in the future — e.g. clock skew or a revoked token.
    async fn force_refresh_access_token(&self) -> Result<String, CalendarProviderError> {
        self.get_valid_access_token_inner(true).await
    }

    async fn get_valid_access_token_inner(
        &self,
        force: bool,
    ) -> Result<String, CalendarProviderError> {
        let conn =
            match self.connection_id {
                Some(id) => {
                    crate::db::queries::get_calendar_connection_by_id(&self.pool, id, self.user_id)
                        .await?
                }
                None => sqlx::query_as::<_, crate::calendar::models::CalendarConnection>(
                    "SELECT * FROM calendar_connections WHERE user_id = $1 AND provider = 'google'",
                )
                .bind(self.user_id)
                .fetch_optional(&self.pool)
                .await?,
            };

        let conn = conn.ok_or(CalendarProviderError::MissingCredentials)?;

        let now = chrono::Utc::now();
        let expired = match conn.expires_at {
            Some(expires_at) => expires_at < now + chrono::Duration::minutes(2),
            None => true,
        };
        if force || expired {
            let refresh_token = match conn.refresh_token_encrypted {
                Some(rt) => rt,
                None => {
                    tracing::error!("google token expired and no refresh token stored");
                    return Err(CalendarProviderError::TokenExpired);
                }
            };
            let decrypted = match encryption::decrypt(
                &refresh_token,
                crate::config::Config::from_env()?.token_encryption_key_or(),
            ) {
                Ok(t) => t,
                Err(e) => {
                    tracing::error!(error = %e, "failed to decrypt refresh token");
                    return Err(CalendarProviderError::Config(e));
                }
            };
            let token = match self.oauth.refresh_token(&decrypted).await {
                Ok(t) => t,
                Err(e) => {
                    tracing::error!(error = %e, status = ?e.status(), "google refresh_token failed");
                    return Err(CalendarProviderError::Network(e.to_string()));
                }
            };

            let expires_at = now + chrono::Duration::seconds(token.expires_in);
            let new_access = match encryption::encrypt(
                &token.access_token,
                crate::config::Config::from_env()?.token_encryption_key_or(),
            ) {
                Ok(a) => a,
                Err(e) => {
                    tracing::error!(error = %e, "failed to encrypt new access token");
                    return Err(CalendarProviderError::Config(e));
                }
            };
            let new_refresh = match token.refresh_token.as_ref() {
                Some(r) => Some(encryption::encrypt(
                    r,
                    crate::config::Config::from_env()?.token_encryption_key_or(),
                )?),
                None => None,
            };

            match sqlx::query(
                "UPDATE calendar_connections SET access_token_encrypted = $1, refresh_token_encrypted = $2, expires_at = $3, updated_at = NOW() WHERE id = $4",
            )
            .bind(&new_access)
            .bind(&new_refresh)
            .bind(expires_at)
            .bind(conn.id)
            .execute(&self.pool)
            .await
            {
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "failed to persist refreshed token");
                    return Err(CalendarProviderError::Network(e.to_string()));
                }
            }

            tracing::info!("refreshed google token");
            return Ok(token.access_token);
        }

        let decrypted = match encryption::decrypt(
            &conn.access_token_encrypted,
            crate::config::Config::from_env()?.token_encryption_key_or(),
        ) {
            Ok(t) => t,
            Err(e) => {
                tracing::error!(error = %e, "failed to decrypt access token");
                return Err(CalendarProviderError::Config(e));
            }
        };
        Ok(decrypted)
    }

    fn normalize_event(
        &self,
        item: &crate::calendar::models::GoogleEventItem,
    ) -> Option<CalendarEvent> {
        let start = item.start.as_ref()?;
        let end = item.end.as_ref()?;

        let (start_dt, end_dt, is_all_day, timezone) = if let Some(date_str) = &start.date {
            let naive_start = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()?;
            let naive_end_str = end.date.as_deref().unwrap_or(date_str);
            let naive_end = chrono::NaiveDate::parse_from_str(naive_end_str, "%Y-%m-%d").ok()?;
            let start_local = naive_start.and_hms_opt(0, 0, 0)?;
            let end_local = if naive_end > naive_start {
                naive_end.and_hms_opt(0, 0, 0)?
            } else {
                (naive_start + chrono::Duration::days(1)).and_hms_opt(0, 0, 0)?
            };
            let tz: chrono_tz::Tz = start
                .timezone
                .as_deref()
                .unwrap_or("UTC")
                .parse()
                .unwrap_or(chrono_tz::UTC);
            let start_utc = start_local
                .and_local_timezone(tz)
                .earliest()
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|| start_local.and_utc().with_timezone(&chrono::Utc));
            let end_utc = end_local
                .and_local_timezone(tz)
                .earliest()
                .map(|d| d.with_timezone(&chrono::Utc))
                .unwrap_or_else(|| end_local.and_utc().with_timezone(&chrono::Utc));
            (
                start_utc,
                end_utc,
                true,
                start.timezone.clone().or(end.timezone.clone()),
            )
        } else {
            let tz = start.timezone.as_deref().unwrap_or("UTC");
            let start_dt = parse_rfc3339(&start.date_time.as_deref()?, tz)?;
            let end_tz = end.timezone.as_deref().unwrap_or(tz);
            let end_dt = parse_rfc3339(&end.date_time.as_deref()?, end_tz)?;
            (
                start_dt,
                end_dt,
                false,
                start.timezone.clone().or(end.timezone.clone()),
            )
        };

        Some(CalendarEvent {
            provider_event_id: item.id.clone(),
            title: item.summary.clone(),
            start: start_dt,
            end: end_dt,
            timezone,
            location: item.location.clone(),
            description: item.description.clone(),
            is_all_day,
        })
    }
}

fn parse_rfc3339(value: &str, fallback_tz: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S") {
        let tz: chrono_tz::Tz = fallback_tz.parse().unwrap_or(chrono_tz::UTC);
        let dt = naive
            .and_local_timezone(tz)
            .earliest()
            .map(|d| d.with_timezone(&chrono::Utc))
            .unwrap_or_else(|| naive.and_utc());
        return Some(dt);
    }
    None
}

#[async_trait]
impl<C: crate::calendar::models::GoogleOAuthClient> crate::calendar::provider::CalendarProvider
    for GoogleCalendarProvider<C>
{
    async fn list_calendars(&self) -> Result<Vec<Calendar>, CalendarProviderError> {
        let span = info_span!("google_list_calendars");
        let _enter = span.enter();
        let access_token = self.get_valid_access_token().await.map_err(|e| {
            tracing::error!(error = ?e, "get_valid_access_token failed");
            e
        })?;
        let list = match self.oauth.list_calendars(&access_token).await {
            Ok(l) => l,
            Err(e) if e.is_status() && e.status().map_or(false, |s| s.is_client_error()) => {
                tracing::warn!(
                    error = %e,
                    "google list_calendars failed with client error, retrying after token refresh"
                );
                let token = self.force_refresh_access_token().await?;
                self.oauth.list_calendars(&token).await.map_err(|e2| {
                    tracing::error!(error = %e2, "google list_calendars failed after token refresh");
                    CalendarProviderError::Network(e2.to_string())
                })?
            }
            Err(e) => {
                tracing::error!(error = %e, "google list_calendars failed");
                return Err(CalendarProviderError::Network(e.to_string()));
            }
        };

        let mut calendars = Vec::new();
        for item in list.items {
            let name = item.summary.unwrap_or_else(|| "Calendar".into());
            let upsert = crate::calendar::models::UpsertCalendar {
                id: uuid::Uuid::new_v4(),
                connection_id: self.connection_id.unwrap_or(uuid::Uuid::nil()),
                provider_calendar_id: item.id,
                name: name.clone(),
                timezone: item.timeZone,
            };
            let saved = crate::db::queries::upsert_calendar(&self.pool, &upsert).await?;
            calendars.push(Calendar {
                id: saved.id,
                connection_id: saved.connection_id,
                provider_calendar_id: saved.provider_calendar_id,
                name: saved.name,
                timezone: saved.timezone,
                created_at: saved.created_at,
                updated_at: saved.updated_at,
            });
        }
        Ok(calendars)
    }

    async fn list_events(
        &self,
        calendar_id: &str,
        start: chrono::DateTime<chrono::Utc>,
        end: chrono::DateTime<chrono::Utc>,
    ) -> Result<Vec<CalendarEvent>, CalendarProviderError> {
        let access_token = self.get_valid_access_token().await?;
        let time_min = start.to_rfc3339();
        let time_max = end.to_rfc3339();
        let list = match self
            .oauth
            .list_events(&access_token, calendar_id, &time_min, &time_max)
            .await
        {
            Ok(l) => l,
            Err(e) if e.is_status() && e.status().map_or(false, |s| s.is_client_error()) => {
                tracing::warn!(
                    error = %e,
                    "google list_events failed with client error, retrying after token refresh"
                );
                let token = self.force_refresh_access_token().await?;
                self.oauth
                    .list_events(&token, calendar_id, &time_min, &time_max)
                    .await
                    .map_err(|e2| {
                        tracing::error!(error = %e2, "google list_events failed after token refresh");
                        CalendarProviderError::Network(e2.to_string())
                    })?
            }
            Err(e) => {
                tracing::error!(error = %e, "google list_events failed");
                return Err(CalendarProviderError::Network(e.to_string()));
            }
        };

        let mut events = Vec::new();
        for item in list.items {
            if let Some(event) = self.normalize_event(&item) {
                events.push(event);
            }
        }
        Ok(events)
    }
}
