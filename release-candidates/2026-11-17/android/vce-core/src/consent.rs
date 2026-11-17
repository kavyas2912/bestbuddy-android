// vce-core/src/consent.rs
//! Per-purpose, timestamped, withdrawable consents. Nothing is assumed granted.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    LocalMemory,
    LearnInterests,
    MoodAnalysis,
    Prefetch,
    Location,
    Calendar,
    CloudByok,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Consent {
    pub purpose: Purpose,
    pub granted: bool,
    pub ts: u64,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Consents(Vec<Consent>);

impl Consents {
    pub fn set(&mut self, purpose: Purpose, granted: bool, ts: u64) {
        self.0.retain(|c| c.purpose != purpose);
        self.0.push(Consent {
            purpose,
            granted,
            ts,
        });
    }
    fn raw(&self, p: Purpose) -> bool {
        self.0.iter().any(|c| c.purpose == p && c.granted)
    }
    /// Learning and mood analysis are meaningless without permission to remember.
    pub fn is_granted(&self, p: Purpose) -> bool {
        match p {
            Purpose::LearnInterests | Purpose::MoodAnalysis => {
                self.raw(p) && self.raw(Purpose::LocalMemory)
            }
            _ => self.raw(p),
        }
    }
    pub fn all(&self) -> &[Consent] {
        &self.0
    }
}
