use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_redirect_uri: String,
    pub session_secret: [u8; 32],
    pub token_encryption_key: [u8; 32],
    pub public_base_url: String,
    pub redis_url: Option<String>,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = std::env::var("DATABASE_URL")
            .map_err(|_| ConfigError::Missing("DATABASE_URL"))?;
        let google_client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| ConfigError::Missing("GOOGLE_CLIENT_ID"))?;
        let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| ConfigError::Missing("GOOGLE_CLIENT_SECRET"))?;
        let google_redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
            .map_err(|_| ConfigError::Missing("GOOGLE_REDIRECT_URI"))?;
        let public_base_url = std::env::var("PUBLIC_BASE_URL")
            .map_err(|_| ConfigError::Missing("PUBLIC_BASE_URL"))?;
        let port = std::env::var("PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(3000);

        let session_secret = parse_secret(&std::env::var("SESSION_SECRET")
            .map_err(|_| ConfigError::Missing("SESSION_SECRET"))?, 32)?;
        let token_encryption_key = parse_secret(&std::env::var("TOKEN_ENCRYPTION_KEY")
            .map_err(|_| ConfigError::Missing("TOKEN_ENCRYPTION_KEY"))?, 32)?;

        Ok(Self {
            database_url,
            google_client_id,
            google_client_secret,
            google_redirect_uri,
            session_secret,
            token_encryption_key,
            public_base_url,
            redis_url: std::env::var("REDIS_URL").ok(),
            port,
        })
    }
}

fn parse_secret(value: &str, expected_len: usize) -> Result<[u8; 32], ConfigError> {
    let bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        value,
    )
    .map_err(|_| ConfigError::InvalidSecret)?;
    if bytes.len() != expected_len {
        return Err(ConfigError::InvalidSecret);
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

#[derive(Debug)]
pub enum ConfigError {
    Missing(&'static str),
    InvalidSecret,
}