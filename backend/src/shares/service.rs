use chrono::DateTime;
use uuid::Uuid;

use crate::shares::models::{NewShare, NewShareEvent, PublicEvent};
use crate::calendar::models::CalendarEvent;

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

        let share_id = Uuid::new_v4();
        let new_share = NewShare {
            id: share_id,
            user_id,
            calendar_id,
            token_hash: token_hash.clone(),
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
                crate::shares::models::project_event_for_visibility(&source, share.visibility_enum())
            })
            .collect();

        Ok(Some((share, projected)))
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