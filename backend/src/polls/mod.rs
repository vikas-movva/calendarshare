pub mod models;
pub mod service;
pub mod store;

pub type AppErrorResult<T> = Result<T, crate::error::AppError>;
