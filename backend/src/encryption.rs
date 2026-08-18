use aes_gcm::{
    aead::{Aead, AeadCore, Key, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};

const NONCE_SIZE: usize = 12;

pub fn encrypt(plaintext: &str, key_bytes: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes));
    let nonce = Aes256Gcm::generate_nonce(OsRng);
    let nonce_ref = Nonce::from_slice(&nonce);
    let ciphertext = cipher
        .encrypt(nonce_ref, plaintext.as_bytes())
        .map_err(|e| format!("encryption failed: {}", e))?;
    let mut output = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    output.extend_from_slice(&nonce);
    output.extend_from_slice(&ciphertext);
    Ok(STANDARD.encode(&output))
}

pub fn decrypt(token: &str, key_bytes: &[u8; 32]) -> Result<String, String> {
    let bytes = STANDARD
        .decode(token)
        .map_err(|e| format!("base64 decode failed: {}", e))?;
    if bytes.len() < NONCE_SIZE {
        return Err("ciphertext too short".into());
    }
    let (nonce_bytes, ciphertext) = bytes.split_at(NONCE_SIZE);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key_bytes));
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("decryption failed: {}", e))?;
    String::from_utf8(plaintext).map_err(|e| format!("invalid utf8: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let key = [7u8; 32];
        let encrypted = encrypt("secret-token", &key).unwrap();
        assert_ne!(encrypted, "secret-token");
        let decrypted = decrypt(&encrypted, &key).unwrap();
        assert_eq!(decrypted, "secret-token");
    }

    #[test]
    fn tamper_fails() {
        let key = [9u8; 32];
        let mut encrypted = encrypt("data", &key).unwrap();
        encrypted.push('!');
        assert!(decrypt(&encrypted, &key).is_err());
    }
}