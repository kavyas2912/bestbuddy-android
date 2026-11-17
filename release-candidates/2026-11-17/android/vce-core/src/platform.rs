// vce-core/src/platform.rs
//! Adapters the OS shell implements (Kotlin/Swift plugins on mobile). The core never calls OS APIs directly.
use std::collections::HashMap;
use std::sync::Mutex;

pub type Result<T> = std::result::Result<T, String>;
/// Receives 16-bit PCM frames from the native capture thread. Audio never crosses the WebView.
pub type FrameSink = Box<dyn FnMut(&[i16]) + Send>;

#[derive(Clone, Debug)]
pub struct CaptureCfg {
    pub sample_rate: u32,
    pub frame_ms: u32,
}

pub trait AudioIo: Send + Sync {
    fn start_capture(&self, cfg: CaptureCfg, sink: FrameSink) -> Result<()>;
    fn stop_capture(&self);
    fn play_pcm(&self, pcm: &[i16], sample_rate: u32) -> Result<()>;
    /// Stops playback immediately (barge-in).
    fn stop_playback(&self) {}
}

#[derive(Clone, Debug)]
pub struct DownloadJob {
    pub id: String,
    pub url: String,
    pub sha256: String,
}
#[derive(Clone, Debug, PartialEq)]
pub enum JobState {
    Queued,
    Running(u8),
    Done,
    Failed(String),
}

pub trait Downloader: Send + Sync {
    fn enqueue(&self, job: DownloadJob) -> Result<()>;
    fn state(&self, id: &str) -> Option<JobState>;
}
pub trait BgScheduler: Send + Sync {
    /// Prefetch runs opportunistically: WorkManager on Android, BGTaskScheduler on iOS.
    fn schedule(&self, task: &str, needs_wifi: bool, needs_charging: bool) -> Result<()>;
}
pub trait SecureStore: Send + Sync {
    fn put(&self, key: &str, val: &[u8]) -> Result<()>;
    fn get(&self, key: &str) -> Result<Option<Vec<u8>>>;
    fn delete(&self, key: &str) -> Result<()>;
}

/// Null/in-memory adapters for desktop dev and tests.
pub struct NullAudio;
impl AudioIo for NullAudio {
    fn start_capture(&self, _: CaptureCfg, _: FrameSink) -> Result<()> {
        Err("audio plugin not installed".into())
    }
    fn stop_capture(&self) {}
    fn play_pcm(&self, _: &[i16], _: u32) -> Result<()> {
        Err("audio plugin not installed".into())
    }
}
#[derive(Default)]
pub struct MemDownloader(Mutex<HashMap<String, JobState>>);
impl Downloader for MemDownloader {
    fn enqueue(&self, j: DownloadJob) -> Result<()> {
        self.0.lock().unwrap().insert(j.id, JobState::Queued);
        Ok(())
    }
    fn state(&self, id: &str) -> Option<JobState> {
        self.0.lock().unwrap().get(id).cloned()
    }
}

#[derive(Default)]
pub struct MemSecureStore(Mutex<HashMap<String, Vec<u8>>>);
impl SecureStore for MemSecureStore {
    fn put(&self, k: &str, v: &[u8]) -> Result<()> {
        self.0.lock().unwrap().insert(k.into(), v.to_vec());
        Ok(())
    }
    fn get(&self, k: &str) -> Result<Option<Vec<u8>>> {
        Ok(self.0.lock().unwrap().get(k).cloned())
    }
    fn delete(&self, k: &str) -> Result<()> {
        self.0.lock().unwrap().remove(k);
        Ok(())
    }
}

/// DEV ONLY: the data key lives as a file in app-private storage, which is NOT hardware-backed.
/// Replace with an Android Keystore / iOS Keychain plugin before release.
pub struct DevFileKeyStore {
    dir: std::path::PathBuf,
}
impl DevFileKeyStore {
    pub fn new(dir: impl Into<std::path::PathBuf>) -> Self {
        let dir = dir.into();
        let _ = std::fs::create_dir_all(&dir);
        Self { dir }
    }
}
impl SecureStore for DevFileKeyStore {
    fn put(&self, k: &str, v: &[u8]) -> Result<()> {
        std::fs::write(self.dir.join(k), v).map_err(|e| e.to_string())
    }
    fn get(&self, k: &str) -> Result<Option<Vec<u8>>> {
        match std::fs::read(self.dir.join(k)) {
            Ok(b) => Ok(Some(b)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn delete(&self, k: &str) -> Result<()> {
        match std::fs::remove_file(self.dir.join(k)) {
            Ok(_) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
