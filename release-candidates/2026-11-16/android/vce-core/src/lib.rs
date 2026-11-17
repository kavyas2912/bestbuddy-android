// vce-core/src/lib.rs
//! Platform-agnostic voice-conversation core. Frontends and OS plugins plug in via `platform` traits.
pub mod assistant;
pub mod capabilities;
pub mod consent;
pub mod engine;
pub mod learn;
pub mod ledger;
pub mod llm;
pub mod platform;
pub mod profile;
pub mod rag;
pub mod safety;
pub mod sources;
pub mod values;
pub mod vault;
pub mod voice;
pub use assistant::{Alarm, Assistant};
pub use consent::Purpose;
pub use engine::{Brief, Engine, Resolution, Tier};
pub use platform::{DevFileKeyStore, MemSecureStore};
