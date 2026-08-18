use axum::{
    extract::{Query, State},
    http::{HeaderMap, HeaderValue},
    response::{IntoResponse, Redirect},
    Json,
};

use crate::config::Config;
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct AuthState {
    pub config: Config,
    pub pool: crate::db::PgPool,
}

#[derive(Debug, serde::Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub trait OauthClient: Send + Sync {
    fn auth_url(&self) -> String;
    async fn handle_callback(&self, code: String) -> Result<CallbackResult, AppError>;
}

pub struct CallbackResult {
    pub user_id: String,
    pub signature: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub struct GoogleOauthClient {
    config: Config,
    pool: crate::db::PgPool,
}

impl GoogleOauthClient {
    pub fn new(config: Config, pool: crate::db::PgPool) -> Self {
        Self { config, pool }
    }

    fn auth_url(&self) -> String {
        let scopes = [
            "https://www.googleapis.com/auth/calendar.readonly",
            "openid",
            "email",
            "profile",
        ];
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?\
client_id={}&\
redirect_uri={}&\
response_type=code&\
scope={}&\
access_type=offline&\
prompt=consent&\
state=calendarshare",
            urlencoding::encode(&self.config.google_client_id),
            urlencoding::encode(&self.config.google_redirect_uri),
            urlencoding::encode(&scopes.join(" ")),
        )
    }

    async fn exchange_code(&self, code: &str) -> Result<crate::calendar::models::GoogleTokenResponse, reqwest::Error> {
        let client = reqwest::Client::new();
        client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.config.google_client_id.as_str()),
                ("client_secret", self.config.google_client_secret.as_str()),
                ("code", code),
                ("grant_type", "authorization_code"),
                ("redirect_uri", self.config.google_redirect_uri.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<crate::calendar::models::GoogleTokenResponse>()
            .await
    }
}

impl OauthClient for GoogleOauthClient {
    fn auth_url(&self) -> String {
        self.auth_url()
    }

    async fn handle_callback(&self, code: String) -> Result<CallbackResult, AppError> {
        let token = self.exchange_code(&code).await
            .map_err(|e| AppError::CalendarProviderUnavailable(e.to_string()))?;

        let user_info = reqwest::Client::new()
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(&token.access_token)
            .send()
            .await
            .map_err(|e| AppError::CalendarProviderUnavailable(e.to_string()))?
            .error_for_status()
            .map_err(|e| AppError::CalendarProviderUnavailable(e.to_string()))?
            .json::<crate::calendar::models::GoogleUserInfo>()
            .await
            .map_err(|e| AppError::CalendarProviderUnavailable(e.to_string()))?;

        let access_encrypted = crate::encryption::encrypt(&token.access_token, &self.config.token_encryption_key)
            .map_err(|e| AppError::InternalError(e))?;
        let refresh_encrypted = token.refresh_token.as_ref()
            .map(|r| crate::encryption::encrypt(r, &self.config.token_encryption_key).unwrap_or_else(|_| r.clone()));

        let expires_at = chrono::Utc::now() + chrono::Duration::seconds(token.expires_in);

        let user = crate::users::service::get_or_create_user(
            &self.pool,
            &user_info.email,
            user_info.name.as_deref(),
            user_info.picture.as_deref(),
        ).await?;

        let connection = crate::calendar::models::UpsertConnection {
            id: uuid::Uuid::new_v4(),
            user_id: user.id,
            provider: "google".into(),
            provider_account_id: Some(user_info.email.clone()),
            access_token_encrypted: access_encrypted,
            refresh_token_encrypted: refresh_encrypted,
            expires_at: Some(expires_at),
        };

        crate::db::queries::upsert_connection(&self.pool, &connection).await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

        let signature = crate::auth::session::sign_session(&self.config.session_secret, &user.id);
        Ok(CallbackResult {
            user_id: user.id.to_string(),
            signature,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
        })
    }
}

fn set_cookie_header(value: &str, max_age: i64) -> HeaderValue {
    let cookie = format!(
        "sid={}; Path=/; HttpOnly; SameSite=Lax; MaxAge={}",
        value, max_age
    );
    cookie.parse().expect("invalid cookie header")
}

pub async fn login(State(state): State<AuthState>) -> impl IntoResponse {
    let client = GoogleOauthClient::new(state.config.clone(), state.pool.clone());
    Redirect::temporary(&client.auth_url())
}

pub async fn callback(
    State(state): State<AuthState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(err) = query.error {
        return Err(AppError::AuthError(format!("oauth error: {}", err)));
    }
    let code = query.code.ok_or(AppError::AuthError("missing code".into()))?;

    let client = GoogleOauthClient::new(state.config.clone(), state.pool.clone());
    let result = client.handle_callback(code).await?;

    let cookie_value = format!("{}:{}", result.user_id, result.signature);
    let mut headers = HeaderMap::new();
    headers.insert("set-cookie", set_cookie_header(&cookie_value, 365 * 24 * 3600));

    let redirect = format!("{}/dashboard", state.config.public_base_url.trim_end_matches('/'));
    Ok((headers, Redirect::temporary(&redirect)))
}

pub async fn logout(State(state): State<AuthState>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert("set-cookie", set_cookie_header("", 0));

    let redirect = format!("{}/", state.config.public_base_url.trim_end_matches('/'));
    (headers, Redirect::temporary(&redirect))
}

#[derive(Debug, serde::Serialize)]
pub struct MeResponse {
    pub id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

pub async fn me(
    State(state): State<AuthState>,
    headers: HeaderMap,
) -> Result<Json<MeResponse>, AppError> {
    let session_id = crate::auth::extract_session_id(&headers).ok_or(AppError::AuthError("missing session".into()))?;
    let parts: Vec<&str> = session_id.split(':').collect();
    if parts.len() != 2 {
        return Err(AppError::AuthError("invalid session".into()));
    }
    let user_id: uuid::Uuid = parts[0].parse().map_err(|_| AppError::AuthError("invalid session".into()))?;
    let signature = parts[1];

    if !crate::auth::session::verify_session(&state.config.session_secret, &user_id, signature) {
        return Err(AppError::AuthError("invalid session signature".into()));
    }

    let user = crate::db::queries::get_user_by_email(&state.pool, &parts[0]).await?
        .ok_or(AppError::AuthError("user not found".into()))?;

    Ok(Json(MeResponse {
        id: user.id.to_string(),
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
    }))
}