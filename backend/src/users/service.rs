use crate::error::AppErrorResult;
use crate::users::{NewUser, User};

pub async fn get_or_create_user(
    pool: &crate::db::PgPool,
    email: &str,
    display_name: Option<&str>,
    avatar_url: Option<&str>,
) -> AppErrorResult<User> {
    let service = UserService::new(pool.clone());
    service.get_or_create(email, display_name, avatar_url).await
}

pub struct UserService {
    pool: crate::db::PgPool,
}

impl UserService {
    pub fn new(pool: crate::db::PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_or_create(
        &self,
        email: &str,
        display_name: Option<&str>,
        avatar_url: Option<&str>,
    ) -> AppErrorResult<User> {
        if let Some(user) = crate::db::queries::get_user_by_email(&self.pool, email).await? {
            return Ok(user);
        }

        let new_user = NewUser::from_google(email, display_name, avatar_url);
        let user = crate::db::queries::create_user(&self.pool, &new_user).await?;
        Ok(user)
    }
}
