use calendarshare::calendar::models::{CalendarEvent, RealGoogleOAuthClient};
use calendarshare::shares::models::{project_event_for_visibility, validate_share_range, Visibility};
use calendarshare::shares::service::{RealTokenService, TokenService};
use calendarshare::encryption;
use calendarshare::auth::session;

fn event(title: &str, start: &str, end: &str) -> CalendarEvent {
    CalendarEvent {
        provider_event_id: None,
        title: Some(title.to_string()),
        start: chrono::DateTime::parse_from_rfc3339(start).unwrap().with_timezone(&chrono::Utc),
        end: chrono::DateTime::parse_from_rfc3339(end).unwrap().with_timezone(&chrono::Utc),
        timezone: Some("America/Toronto".into()),
        location: Some("Cafe".into()),
        description: Some("Notes".into()),
        is_all_day: false,
    }
}

#[test]
fn busy_visibility_exposes_only_times() {
    let e = event("Secret", "2026-08-21T10:00:00Z", "2026-08-21T11:00:00Z");
    let projected = project_event_for_visibility(&e, Visibility::Busy);
    assert_eq!(projected.title, None);
    assert_eq!(projected.location, None);
    assert_eq!(projected.description, None);
}

#[test]
fn title_time_visibility_exposes_title_and_times() {
    let e = event("Dinner", "2026-08-21T23:00:00Z", "2026-08-22T01:00:00Z");
    let projected = project_event_for_visibility(&e, Visibility::TitleTime);
    assert_eq!(projected.title.as_deref(), Some("Dinner"));
    assert_eq!(projected.location, None);
    assert_eq!(projected.description, None);
}

#[test]
fn details_visibility_exposes_all_fields() {
    let e = event("Dinner", "2026-08-21T23:00:00Z", "2026-08-22T01:00:00Z");
    let projected = project_event_for_visibility(&e, Visibility::Details);
    assert_eq!(projected.title.as_deref(), Some("Dinner"));
    assert_eq!(projected.location.as_deref(), Some("Cafe"));
    assert_eq!(projected.description.as_deref(), Some("Notes"));
}

#[test]
fn validate_range_rejects_inverted_range() {
    assert!(validate_share_range(
        chrono::DateTime::parse_from_rfc3339("2026-08-24T00:00:00Z").unwrap().with_timezone(&chrono::Utc),
        chrono::DateTime::parse_from_rfc3339("2026-08-21T00:00:00Z").unwrap().with_timezone(&chrono::Utc),
    ).is_err());
}

#[test]
fn validate_range_rejects_equal_range() {
    let t = chrono::DateTime::parse_from_rfc3339("2026-08-21T00:00:00Z").unwrap().with_timezone(&chrono::Utc);
    assert!(validate_share_range(t, t).is_err());
}

#[test]
fn validate_range_accepts_valid_range() {
    assert!(validate_share_range(
        chrono::DateTime::parse_from_rfc3339("2026-08-21T00:00:00Z").unwrap().with_timezone(&chrono::Utc),
        chrono::DateTime::parse_from_rfc3339("2026-08-24T00:00:00Z").unwrap().with_timezone(&chrono::Utc),
    ).is_ok());
}

#[test]
fn event_intersects_share_range() {
    let e = event("X", "2026-08-21T08:00:00Z", "2026-08-21T11:00:00Z");
    let start = chrono::DateTime::parse_from_rfc3339("2026-08-21T10:00:00Z").unwrap().with_timezone(&chrono::Utc);
    let end = chrono::DateTime::parse_from_rfc3339("2026-08-21T15:00:00Z").unwrap().with_timezone(&chrono::Utc);
    assert!(e.intersects(start, end));
}

#[test]
fn event_outside_range_does_not_intersect() {
    let e = event("X", "2026-08-20T08:00:00Z", "2026-08-20T09:00:00Z");
    let start = chrono::DateTime::parse_from_rfc3339("2026-08-21T00:00:00Z").unwrap().with_timezone(&chrono::Utc);
    let end = chrono::DateTime::parse_from_rfc3339("2026-08-24T00:00:00Z").unwrap().with_timezone(&chrono::Utc);
    assert!(!e.intersects(start, end));
}

#[test]
fn visibility_parse_roundtrip() {
    assert_eq!(Visibility::parse("busy"), Some(Visibility::Busy));
    assert_eq!(Visibility::parse("title_time"), Some(Visibility::TitleTime));
    assert_eq!(Visibility::parse("details"), Some(Visibility::Details));
    assert_eq!(Visibility::parse("nope"), None);
    assert_eq!(Visibility::Busy.as_str(), "busy");
}

#[test]
fn token_hash_is_deterministic_and_unique() {
    let svc = RealTokenService;
    let t1 = svc.generate().unwrap();
    let t2 = svc.generate().unwrap();
    assert_ne!(t1, t2);
    assert_eq!(svc.hash(&t1), svc.hash(&t1));
    assert_ne!(svc.hash(&t1), svc.hash(&t2));
}

#[test]
fn encryption_roundtrip_and_tamper_fails() {
    let key = [7u8; 32];
    let encrypted = encryption::encrypt("secret", &key).unwrap();
    assert_ne!(encrypted, "secret");
    assert_eq!(encryption::decrypt(&encrypted, &key).unwrap(), "secret");
    let mut tampered = encrypted.clone();
    tampered.push('!');
    assert!(encryption::decrypt(&tampered, &key).is_err());
}

#[test]
fn session_signature_roundtrip() {
    let secret = [1u8; 32];
    let user_id = uuid::uuid!("11111111-1111-1111-1111-111111111111");
    let sig = session::sign_session(&secret, &user_id);
    assert!(session::verify_session(&secret, &user_id, &sig));
    assert!(!session::verify_session(&secret, &user_id, "invalid"));
}

#[test]
fn real_oauth_client_is_constructible() {
    let _ = RealGoogleOAuthClient::new("id".into(), "secret".into(), "uri".into());
}