// vce-core/src/engine.rs
//! Resolution ladder v0.2: phrasebook -> skill (brief sections) -> local LLM. Cloud tier is intentionally absent.
use crate::ledger::Ledger;
use crate::llm::LlmBackend;
use crate::sources::FetchReq;
use serde::{Deserialize, Serialize};

const PHRASEBOOK: &str = include_str!("../seed/phrasebook.json");

#[derive(Clone, Deserialize)]
struct Entry {
    m: Vec<String>,
    r: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Phrasebook,
    Skill,
    Llm,
    Rag,
    Search,
    Safety,
}

#[derive(Clone, Debug, Serialize)]
pub struct Resolution {
    pub tier: Tier,
    pub reply: String,
    pub brief: bool,
    pub source: Option<String>,
    pub link: Option<String>,
    pub lookup: Option<FetchReq>,
    pub needs_model: bool,
}
impl Resolution {
    pub fn of(tier: Tier, reply: String) -> Self {
        Resolution {
            tier,
            reply,
            brief: false,
            source: None,
            link: None,
            lookup: None,
            needs_model: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Brief {
    pub source: String,
    pub weather: String,
    pub schedule: String,
    pub news: String,
    pub markets: String,
}

impl Brief {
    pub fn seeded() -> Self {
        let s = |t: &str| t.to_string();
        Brief {
            source: s("seed"),
            weather: s("Weather not fetched yet. Set your city in Settings, Content & Prefetch."),
            schedule: s("Nothing scheduled yet. Say 'remind me to ...' to add something."),
            news: s("Headlines not fetched yet."),
            markets: s("Market data not fetched yet."),
        }
    }
}

#[derive(Default, Debug)]
pub struct Stats {
    pub phrasebook: u32,
    pub skill: u32,
    pub llm: u32,
}
impl Stats {
    /// Share of turns answered with no LLM call at all.
    pub fn no_llm_rate(&self) -> f32 {
        let t = (self.phrasebook + self.skill + self.llm) as f32;
        if t == 0.0 {
            0.0
        } else {
            (self.phrasebook + self.skill) as f32 / t
        }
    }
}

pub struct Engine {
    name: String,
    book: Vec<Entry>,
    llm: Option<Box<dyn LlmBackend>>,
    brief: Brief,
    pub stats: Stats,
    pub ledger: Ledger,
}

fn norm(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' {
                c
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

impl Engine {
    pub fn seeded(user: &str) -> Self {
        let book: Vec<Entry> = serde_json::from_str::<Vec<Entry>>(PHRASEBOOK)
            .expect("seed/phrasebook.json is valid")
            .into_iter()
            .filter(|e| !e.r.is_empty() && !e.m.is_empty())
            .collect();
        Engine {
            name: user.to_string(),
            book,
            llm: None,
            brief: Brief::seeded(),
            stats: Stats::default(),
            ledger: Ledger::default(),
        }
    }
    pub fn set_user(&mut self, name: &str) {
        self.name = name.to_string();
    }
    pub fn set_llm(&mut self, b: Box<dyn LlmBackend>) {
        self.llm = Some(b);
    }
    pub fn brief(&self) -> &Brief {
        &self.brief
    }
    /// Called by the prefetch scheduler when fresh data lands.
    pub fn set_brief(&mut self, b: Brief) {
        self.brief = b;
    }

    pub fn resolve(&mut self, text: &str, now: u64) -> Resolution {
        let q = norm(text);
        if let Some(i) = self.book.iter().position(|e| e.m.iter().any(|m| *m == q)) {
            self.stats.phrasebook += 1;
            let (key, v) = (format!("pb:{}", self.book[i].m[0]), self.book[i].r.clone());
            let k = self.ledger.pick_variant(&key, &v, now);
            return Resolution::of(Tier::Phrasebook, v[k].replace("{n}", &self.name));
        }
        let skill = if q.contains("brief") {
            Some(("Here is your day.".to_string(), true))
        } else if q.contains("weather") {
            Some((self.brief.weather.clone(), false))
        } else if q.contains("news") {
            Some((self.brief.news.clone(), false))
        } else if q.contains("market") || q.contains("stock") {
            Some((self.brief.markets.clone(), false))
        } else if q.contains("schedule") || q.contains("calendar") {
            Some((self.brief.schedule.clone(), false))
        } else {
            None
        };
        if let Some((reply, brief)) = skill {
            self.stats.skill += 1;
            let mut r = Resolution::of(Tier::Skill, reply);
            r.brief = brief;
            return r;
        }
        self.stats.llm += 1;
        let reply = match self.llm.as_ref().map(|l| l.generate(text)) {
            Some(Ok(r)) => r,
            _ => "That one needs the on-device model, which is not loaded yet.".to_string(),
        };
        let mut r = Resolution::of(Tier::Llm, reply);
        r.needs_model = self.llm.is_none();
        r
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::*;

    #[test]
    fn phrasebook_hit_is_personalised_and_skips_llm() {
        let mut e = Engine::seeded("Asha");
        let r = e.resolve("Hello, Buddy!", 1_000);
        assert_eq!(r.tier, Tier::Phrasebook);
        assert!(r.reply.contains("Asha"));
        assert_eq!(e.stats.llm, 0);
    }
    #[test]
    fn skill_tier_answers_from_brief() {
        let mut e = Engine::seeded("A");
        assert_eq!(e.resolve("What's the weather?", 1_000).tier, Tier::Skill);
        assert!(e.resolve("give me my day brief", 1_000).brief);
    }
    #[test]
    fn unknown_falls_to_llm_and_rate_is_tracked() {
        let mut e = Engine::seeded("A");
        e.resolve("hi", 1_000);
        e.resolve("explain relativity", 1_000);
        assert_eq!(e.stats.llm, 1);
        assert!((e.stats.no_llm_rate() - 0.5).abs() < 1e-6);
    }
    #[test]
    fn phrasebook_does_not_misfire_on_longer_sentences() {
        let mut e = Engine::seeded("A");
        assert_eq!(
            e.resolve("goodbye party planning ideas", 1_000).tier,
            Tier::Llm
        );
    }
    #[test]
    fn greeting_varies_between_turns() {
        let mut e = Engine::seeded("A");
        let r: Vec<String> = (0..4)
            .map(|t| e.resolve("hello", 1_000 + t).reply)
            .collect();
        for w in r.windows(2) {
            assert_ne!(w[0], w[1], "no back-to-back identical greeting");
        }
    }
    #[test]
    fn recommend_respects_ram_budget() {
        let m = |id: &str, ram, q| ModelEntry {
            id: id.into(),
            name: id.into(),
            min_ram_mb: ram,
            quality: q,
            caps: BackendCaps::default(),
        };
        let cat = vec![m("small", 800, 1), m("mid", 3000, 2), m("big", 5000, 3)];
        assert_eq!(
            recommend(
                &cat,
                &DeviceProfile {
                    ram_mb: 4000,
                    has_npu: false
                }
            )
            .unwrap()
            .id,
            "small"
        );
        assert_eq!(
            recommend(
                &cat,
                &DeviceProfile {
                    ram_mb: 6000,
                    has_npu: false
                }
            )
            .unwrap()
            .id,
            "mid"
        );
        assert_eq!(
            recommend(
                &cat,
                &DeviceProfile {
                    ram_mb: 12000,
                    has_npu: true
                }
            )
            .unwrap()
            .id,
            "big"
        );
        assert!(recommend(
            &cat,
            &DeviceProfile {
                ram_mb: 1000,
                has_npu: false
            }
        )
        .is_none());
    }
}
