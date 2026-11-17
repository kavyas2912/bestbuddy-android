// vce-core/src/vault.rs
//! Encryption at rest: AES-256-GCM, random data key held in the platform SecureStore.
//! Wiping = destroying the key first (crypto-erase), then deleting the files.
use crate::platform::{Result, SecureStore};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use serde::{de::DeserializeOwned, Serialize};
use std::{fs, path::PathBuf};

const KEY_NAME: &str = "vce.datakey.v1";

fn rand_bytes<const N: usize>() -> Result<[u8; N]> {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).map_err(|e| e.to_string())?;
    Ok(b)
}

pub struct Vault {
    cipher: Aes256Gcm,
}
impl Vault {
    /// Loads the data key from the secure store, creating it on first run.
    pub fn open(store: &dyn SecureStore) -> Result<Self> {
        let key = match store.get(KEY_NAME)? {
            Some(k) if k.len() == 32 => k,
            _ => {
                let k = rand_bytes::<32>()?.to_vec();
                store.put(KEY_NAME, &k)?;
                k
            }
        };
        Ok(Vault {
            cipher: Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?,
        })
    }
    /// Output layout: 12-byte random nonce || ciphertext+tag. `aad` binds the blob to its collection name.
    pub fn seal(&self, plain: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        let n = rand_bytes::<12>()?;
        let ct = self
            .cipher
            .encrypt(Nonce::from_slice(&n), Payload { msg: plain, aad })
            .map_err(|_| "encrypt failed".to_string())?;
        let mut out = n.to_vec();
        out.extend(ct);
        Ok(out)
    }
    pub fn unseal(&self, blob: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
        if blob.len() < 28 {
            return Err("blob too short".into());
        }
        let (n, ct) = blob.split_at(12);
        self.cipher
            .decrypt(Nonce::from_slice(n), Payload { msg: ct, aad })
            .map_err(|_| "decrypt failed (wrong key or tampered data)".to_string())
    }
    pub fn destroy_key(store: &dyn SecureStore) -> Result<()> {
        store.delete(KEY_NAME)
    }
}

/// One encrypted file per collection, written atomically (tmp + rename).
pub struct EncStore {
    dir: PathBuf,
    vault: Vault,
}
impl EncStore {
    pub fn new(dir: impl Into<PathBuf>, vault: Vault) -> Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(Self { dir, vault })
    }
    fn path(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{name}.enc"))
    }
    pub fn save<T: Serialize>(&self, name: &str, v: &T) -> Result<()> {
        let json = serde_json::to_vec(v).map_err(|e| e.to_string())?;
        let blob = self.vault.seal(&json, name.as_bytes())?;
        let tmp = self.path(name).with_extension("tmp");
        fs::write(&tmp, blob).map_err(|e| e.to_string())?;
        fs::rename(&tmp, self.path(name)).map_err(|e| e.to_string())
    }
    pub fn load<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>> {
        match fs::read(self.path(name)) {
            Ok(b) => {
                let plain = self.vault.unseal(&b, name.as_bytes())?;
                Ok(Some(
                    serde_json::from_slice(&plain).map_err(|e| e.to_string())?,
                ))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn wipe_files(&self) -> Result<()> {
        for e in fs::read_dir(&self.dir).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if matches!(
                p.extension().and_then(|x| x.to_str()),
                Some("enc") | Some("tmp")
            ) {
                fs::remove_file(&p).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn remove(&self, name: &str) -> Result<()> {
        match fs::remove_file(self.path(name)) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn dir(&self) -> &PathBuf {
        &self.dir
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::MemSecureStore;

    #[test]
    fn roundtrip_and_tamper_and_aad() {
        let ks = MemSecureStore::default();
        let v = Vault::open(&ks).unwrap();
        let blob = v.seal(b"secret", b"facts").unwrap();
        assert_eq!(v.unseal(&blob, b"facts").unwrap(), b"secret");
        assert!(
            v.unseal(&blob, b"profile").is_err(),
            "blob must not decrypt under another collection name"
        );
        let mut bad = blob.clone();
        let l = bad.len();
        bad[l - 1] ^= 1;
        assert!(
            v.unseal(&bad, b"facts").is_err(),
            "tampering must be detected"
        );
        assert_ne!(
            v.seal(b"secret", b"facts").unwrap(),
            blob,
            "fresh nonce each time"
        );
    }
    #[test]
    fn destroying_key_makes_old_data_unreadable() {
        let ks = MemSecureStore::default();
        let blob = Vault::open(&ks).unwrap().seal(b"secret", b"x").unwrap();
        Vault::destroy_key(&ks).unwrap();
        assert!(Vault::open(&ks).unwrap().unseal(&blob, b"x").is_err());
    }
}
