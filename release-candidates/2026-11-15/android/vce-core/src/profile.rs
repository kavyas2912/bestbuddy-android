// vce-core/src/profile.rs
//! Local profile (no account, no server). Registration requires an 18+ confirmation.
use crate::platform::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    pub lang: String,
    pub tone: String,
    pub age_band: Option<String>,
    pub adult_confirmed: bool,
    pub created: u64,
}

impl Profile {
    pub fn validate(&self) -> Result<()> {
        let n = self.name.trim().chars().count();
        if n == 0 || n > 40 {
            return Err("name must be 1-40 characters".into());
        }
        if !self.adult_confirmed {
            return Err("this app is for adults (18+)".into());
        }
        Ok(())
    }
}
