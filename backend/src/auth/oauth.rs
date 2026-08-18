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
    fn auth_url(&self, redirect_uri: &str) -> String;
    async fn handle_callback(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<CallbackResult, AppError>;
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

    fn auth_url(&self, redirect_uri: &str) -> String {
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
            urlencoding::encode(&self.config.google_client_id_or("")),
            urlencoding::encode(redirect_uri),
            urlencoding::encode(&scopes.join(" ")),
        )
    }

    async fn exchange_code(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<crate::calendar::models::GoogleTokenResponse, reqwest::Error> {
        let client = reqwest::Client::new();
        client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.config.google_client_id_or("").as_str()),
                (
                    "client_secret",
                    self.config.google_client_secret_or("").as_str(),
                ),
                ("code", code),
                ("grant_type", "authorization_code"),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<crate::calendar::models::GoogleTokenResponse>()
            .await
    }
}

impl OauthClient for GoogleOauthClient {
    fn auth_url(&self, redirect_uri: &str) -> String {
        self.auth_url(redirect_uri)
    }

    async fn handle_callback(
        &self,
        code: &str,
        redirect_uri: &str,
    ) -> Result<CallbackResult, AppError> {
        let token = self
            .exchange_code(code, redirect_uri)
            .await
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

        let access_encrypted =
            crate::encryption::encrypt(&token.access_token, self.config.token_encryption_key_or())
                .map_err(|e| AppError::InternalError(e))?;
        let refresh_encrypted = token.refresh_token.as_ref().map(|r| {
            crate::encryption::encrypt(r, self.config.token_encryption_key_or())
                .unwrap_or_else(|_| r.clone())
        });

        let expires_at = chrono::Utc::now() + chrono::Duration::seconds(token.expires_in);

        let user = crate::users::service::get_or_create_user(
            &self.pool,
            &user_info.email,
            user_info.name.as_deref(),
            user_info.picture.as_deref(),
        )
        .await?;

        let connection = crate::calendar::models::UpsertConnection {
            id: uuid::Uuid::new_v4(),
            user_id: user.id,
            provider: "google".into(),
            provider_account_id: Some(user_info.email.clone()),
            access_token_encrypted: access_encrypted,
            refresh_token_encrypted: refresh_encrypted,
            expires_at: Some(expires_at),
        };

        crate::db::queries::upsert_connection(&self.pool, &connection)
            .await
            .map_err(|e| AppError::InternalError(e.to_string()))?;

        let signature =
            crate::auth::session::sign_session(self.config.session_secret_or(), &user.id);
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

pub async fn login(State(state): State<AuthState>, headers: HeaderMap) -> impl IntoResponse {
    let redirect_uri = redirect_uri_from_request(&headers, &state.config);
    let client = GoogleOauthClient::new(state.config.clone(), state.pool.clone());
    Redirect::temporary(&client.auth_url(&redirect_uri))
}

pub async fn callback(
    State(state): State<AuthState>,
    headers: HeaderMap,
    Query(query): Query<OAuthCallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    if let Some(err) = query.error {
        return Err(AppError::AuthError(format!("oauth error: {}", err)));
    }
    let code = query
        .code
        .ok_or(AppError::AuthError("missing code".into()))?;

    // Derive the redirect URI from the request itself so the token exchange
    // matches the URI used in the authorization request — this makes the flow
    // work on any domain (custom domain, onrender.com, localhost, etc.).
    let redirect_uri = redirect_uri_from_request(&headers, &state.config);
    let client = GoogleOauthClient::new(state.config.clone(), state.pool.clone());
    let result = client.handle_callback(&code, &redirect_uri).await?;

    let cookie_value = format!("{}:{}", result.user_id, result.signature);
    let mut headers = HeaderMap::new();
    headers.insert(
        "set-cookie",
        set_cookie_header(&cookie_value, 365 * 24 * 3600),
    );

    let redirect = format!(
        "{}/dashboard",
        redirect_origin(&headers, &state.config).trim_end_matches('/')
    );
    Ok((headers, Redirect::temporary(&redirect)))
}

/// Build the post-login redirect origin from the incoming request's Host
/// header. The session cookie is set on this same origin, so the user stays
/// on one origin (works on onrender.com, custom domains, and localhost).
fn redirect_origin(headers: &HeaderMap, config: &Config) -> String {
    if let Some(host) = headers.get("host").and_then(|v| v.to_str().ok()) {
        let scheme = if host.contains("localhost") || host.contains("127.0.0.1") {
            "http"
        } else {
            "https"
        };
        return format!("{}://{}", scheme, host);
    }
    config.public_base_url_or("http://localhost:3000")
}

/// Build the OAuth redirect URI from the incoming request's Host header, so the
/// flow works on any domain without configuring a separate URI per environment.
/// Falls back to the configured value when the header is absent (e.g. tests).
fn redirect_uri_from_request(headers: &HeaderMap, config: &Config) -> String {
    if let Some(host) = headers.get("host").and_then(|v| v.to_str().ok()) {
        // Preserve the scheme: assume https in production, http on localhost.
        let scheme = if host.contains("localhost") || host.contains("127.0.0.1") {
            "http"
        } else {
            "https"
        };
        return format!("{}://{}/auth/google/callback", scheme, host);
    }
    config.google_redirect_uri_or("http://localhost:3000/auth/google/callback")
}

pub async fn logout(State(state): State<AuthState>) -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert("set-cookie", set_cookie_header("", 0));

    let redirect = format!(
        "{}/",
        state
            .config
            .public_base_url_or("http://localhost:3000")
            .trim_end_matches('/')
    );
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
    let session_id = crate::auth::extract_session_id(&headers)
        .ok_or(AppError::AuthError("missing session".into()))?;
    let parts: Vec<&str> = session_id.split(':').collect();
    if parts.len() != 2 {
        return Err(AppError::AuthError("invalid session".into()));
    }
    let user_id: uuid::Uuid = parts[0]
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

    Ok(Json(MeResponse {
        id: user.id.to_string(),
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
    }))
}
