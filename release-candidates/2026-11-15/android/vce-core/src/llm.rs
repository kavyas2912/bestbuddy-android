// vce-core/src/llm.rs
//! LLM backends (LiteRT-LM plugin, llama.cpp) sit behind one trait; the model manager picks by device.
use crate::platform::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct BackendCaps {
    pub vision: bool,
    pub audio: bool,
    pub thinking: bool,
    pub tools: bool,
    pub max_ctx: u32,
}

/// `min_ram_mb` and `quality` are placeholders: tune them from the first-run on-device benchmark.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub min_ram_mb: u32,
    pub quality: u8,
    pub caps: BackendCaps,
}

#[derive(Clone, Debug)]
pub struct DeviceProfile {
    pub ram_mb: u32,
    pub has_npu: bool,
}

pub trait LlmBackend: Send + Sync {
    fn name(&self) -> &str;
    fn load(&mut self, m: &ModelEntry) -> Result<()>;
    fn generate(&self, prompt: &str) -> Result<String>;
    fn unload(&mut self);
}
/// Implemented by the mobile plugin (LiteRT-LM) and by a llama.cpp wrapper.
pub trait ModelRuntime {
    fn backends(&self) -> Vec<Box<dyn LlmBackend>>;
}

/// Best-quality model that fits in 60% of RAM, leaving room for ASR, TTS and embeddings.
pub fn recommend<'a>(catalog: &'a [ModelEntry], hw: &DeviceProfile) -> Option<&'a ModelEntry> {
    let budget = hw.ram_mb as u64 * 6 / 10;
    catalog
        .iter()
        .filter(|m| m.min_ram_mb as u64 <= budget)
        .max_by_key(|m| m.quality)
}

/// Placeholder until a real runtime plugin is installed.
#[derive(Default)]
pub struct StubBackend {
    loaded: Option<String>,
}
impl LlmBackend for StubBackend {
    fn name(&self) -> &str {
        "stub"
    }
    fn load(&mut self, m: &ModelEntry) -> Result<()> {
        self.loaded = Some(m.id.clone());
        Ok(())
    }
    fn generate(&self, _: &str) -> Result<String> {
        Err(format!("no runtime installed (model {:?})", self.loaded))
    }
    fn unload(&mut self) {
        self.loaded = None;
    }
}
