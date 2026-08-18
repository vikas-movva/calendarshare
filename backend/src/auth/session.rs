use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub fn sign_session(session_secret: &[u8; 32], user_id: &uuid::Uuid) -> String {
    let mut mac = HmacSha256::new_from_slice(session_secret).expect("valid key length");
    mac.update(user_id.as_bytes());
    let result = mac.finalize();
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(result.into_bytes())
}

pub fn verify_session(session_secret: &[u8; 32], user_id: &uuid::Uuid, signature: &str) -> bool {
    let expected = sign_session(session_secret, user_id);
    let expected_bytes = expected.as_bytes();
    let provided_bytes = signature.as_bytes();
    if expected_bytes.len() != provided_bytes.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in expected_bytes.iter().zip(provided_bytes.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify() {
        let secret = [1u8; 32];
        let user_id = uuid::uuid!("11111111-1111-1111-1111-111111111111");
        let sig = sign_session(&secret, &user_id);
        assert!(verify_session(&secret, &user_id, &sig));
    }

    #[test]
    fn wrong_signature_fails() {
        let secret = [1u8; 32];
        let user_id = uuid::uuid!("11111111-1111-1111-1111-111111111111");
        assert!(!verify_session(&secret, &user_id, "invalid"));
    }
}
