#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: Option<String>,
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_redirect_uri: Option<String>,
    pub session_secret: Option<[u8; 32]>,
    pub token_encryption_key: Option<[u8; 32]>,
    pub public_base_url: Option<String>,
    pub redis_url: Option<String>,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = std::env::var("DATABASE_URL").ok();
        let google_client_id = std::env::var("GOOGLE_CLIENT_ID").ok();
        let google_client_secret = std::env::var("GOOGLE_CLIENT_SECRET").ok();
        let google_redirect_uri = std::env::var("GOOGLE_REDIRECT_URI").ok();
        let public_base_url = std::env::var("PUBLIC_BASE_URL").ok();
        let redis_url = std::env::var("REDIS_URL").ok();
        let port = std::env::var("PORT")
            .ok()
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(3000);

        let session_secret = std::env::var("SESSION_SECRET")
            .ok()
            .map(|v| parse_secret(&v, 32))
            .transpose()?;
        let token_encryption_key = std::env::var("TOKEN_ENCRYPTION_KEY")
            .ok()
            .map(|v| parse_secret(&v, 32))
            .transpose()?;

        Ok(Self {
            database_url,
            google_client_id,
            google_client_secret,
            google_redirect_uri,
            session_secret,
            token_encryption_key,
            public_base_url,
            redis_url,
            port,
        })
    }

    /// Validates the config required for the full application. Returns a clear
    /// error listing exactly what is missing. Use this at startup so the
    /// failure is diagnostic instead of a panic — the health check still
    /// responds, which is far easier to debug in production.
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut missing = Vec::new();
        if self.database_url.is_none() {
            missing.push("DATABASE_URL".into());
        }
        if self.google_client_id.is_none() {
            missing.push("GOOGLE_CLIENT_ID".into());
        }
        if self.google_client_secret.is_none() {
            missing.push("GOOGLE_CLIENT_SECRET".into());
        }
        if self.google_redirect_uri.is_none() {
            missing.push("GOOGLE_REDIRECT_URI".into());
        }
        if self.session_secret.is_none() {
            missing.push("SESSION_SECRET".into());
        }
        if self.token_encryption_key.is_none() {
            missing.push("TOKEN_ENCRYPTION_KEY".into());
        }
        if self.public_base_url.is_none() {
            missing.push("PUBLIC_BASE_URL".into());
        }
        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }

    pub fn require_database_url(&self) -> Result<&str, String> {
        self.database_url
            .as_deref()
            .ok_or_else(|| "DATABASE_URL is not set".into())
    }

    pub fn google_client_id(&self) -> Result<&str, String> {
        self.google_client_id
            .as_deref()
            .ok_or_else(|| "GOOGLE_CLIENT_ID is not set".into())
    }

    pub fn google_client_secret(&self) -> Result<&str, String> {
        self.google_client_secret
            .as_deref()
            .ok_or_else(|| "GOOGLE_CLIENT_SECRET is not set".into())
    }

    pub fn google_redirect_uri(&self) -> Result<&str, String> {
        self.google_redirect_uri
            .as_deref()
            .ok_or_else(|| "GOOGLE_REDIRECT_URI is not set".into())
    }

    pub fn session_secret(&self) -> Result<&[u8; 32], String> {
        self.session_secret
            .as_ref()
            .ok_or_else(|| "SESSION_SECRET is not set".into())
    }

    pub fn token_encryption_key(&self) -> Result<&[u8; 32], String> {
        self.token_encryption_key
            .as_ref()
            .ok_or_else(|| "TOKEN_ENCRYPTION_KEY is not set".into())
    }

    pub fn public_base_url(&self) -> Result<&str, String> {
        self.public_base_url
            .as_deref()
            .ok_or_else(|| "PUBLIC_BASE_URL is not set".into())
    }

    /// Convenience: returns the value or a default. Prefer the `Result`-returning
    /// accessors in auth paths, which should fail fast if config is incomplete.
    pub fn public_base_url_or(&self, default: &str) -> String {
        self.public_base_url
            .as_deref()
            .unwrap_or(default)
            .to_string()
    }

    pub fn google_client_id_or(&self, default: &str) -> String {
        self.google_client_id
            .as_deref()
            .unwrap_or(default)
            .to_string()
    }

    pub fn google_client_secret_or(&self, default: &str) -> String {
        self.google_client_secret
            .as_deref()
            .unwrap_or(default)
            .to_string()
    }

    pub fn google_redirect_uri_or(&self, default: &str) -> String {
        self.google_redirect_uri
            .as_deref()
            .unwrap_or(default)
            .to_string()
    }

    /// Returns the session secret, or a zero key if unset. The startup
    /// `validate()` call guarantees these are present before any auth code
    /// runs, so the fallback here is only for the compiler.
    pub fn session_secret_or(&self) -> &[u8; 32] {
        self.session_secret.as_ref().unwrap_or(&ZERO_KEY)
    }

    pub fn token_encryption_key_or(&self) -> &[u8; 32] {
        self.token_encryption_key
            .as_ref()
            .unwrap_or(&ZERO_KEY)
    }
}

static ZERO_KEY: [u8; 32] = [0u8; 32];

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

impl From<ConfigError> for Vec<String> {
    fn from(err: ConfigError) -> Self {
        match err {
            ConfigError::Missing(name) => vec![name.to_string()],
            ConfigError::InvalidSecret => vec!["SESSION_SECRET / TOKEN_ENCRYPTION_KEY must be 32 bytes base64".into()],
        }
    }
}