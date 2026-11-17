// vce-core/src/assistant.rs
//! Integration layer: consent-gated memory, learning, reminders, no-repeat chatter, content sources, offline knowledge, safety, wipe.
use crate::consent::{Consent, Consents, Purpose};
use crate::engine::{Brief, Engine, Resolution, Tier};
use crate::learn::{extract, parse_reminder, sentiment, Fact, FactKind, ReminderBook};
use crate::ledger::{hash, near_duplicate, BreakerPolicy, Family, Item, Ledger};
use crate::platform::{Result, SecureStore};
use crate::profile::Profile;
use crate::sources::{self, FetchReq, Kind, Parsed, Place, Registry, Source};
use crate::vault::{EncStore, Vault};
use crate::{rag, values};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;

const CONTENT: &str = include_str!("../seed/content.json");
const MAX_STOCK: usize = 500; // fetched items kept per family

pub struct Assistant {
    pub engine: Engine,
    store: EncStore,
    dir: PathBuf,
    off: i64,
    profile: Option<Profile>,
    consents: Consents,
    facts: Vec<Fact>,
    pub reminders: ReminderBook,
    content: Vec<Item>,
    policy: BreakerPolicy,
    registry: Registry,
    cache: HashMap<String, String>,
    helpline: String,
}

fn skill(reply: String) -> Resolution {
    Resolution::of(Tier::Skill, reply)
}

/// A reply that carries an item's attribution (fetched items only).
fn from_item(it: &Item, tier: Tier) -> Resolution {
    let mut r = Resolution::of(tier, it.text.clone());
    if it.fetched > 0 || it.topic.starts_with("geo:") {
        r.source = Some(it.source.clone());
        if !it.link.is_empty() {
            r.link = Some(it.link.clone());
        }
    }
    r
}

fn content_family(text: &str) -> Option<Family> {
    let q = text.to_lowercase();
    if q.contains("joke") || q.contains("make me laugh") {
        Some(Family::Joke)
    } else if q.contains("fun fact")
        || q.contains("science fact")
        || q.contains("technology fact")
        || q.contains("history fact")
        || q.contains("tell me a fact")
        || q.contains("something interesting")
    {
        Some(Family::Fact)
    } else if q.contains("story") {
        Some(Family::Story)
    } else if q.contains("anecdote") || q.contains("famous") {
        Some(Family::Anecdote)
    } else {
        None
    }
}
fn is_skill_query(text: &str) -> bool {
    let q = text.to_lowercase();
    [
        "weather", "news", "market", "stock", "schedule", "calendar", "brief",
    ]
    .iter()
    .any(|k| q.contains(k))
}
fn hhmm(local: i64) -> String {
    let s = local.rem_euclid(86_400);
    let (h, m) = (s / 3600, (s % 3600) / 60);
    format!(
        "{}:{:02} {}",
        if h % 12 == 0 { 12 } else { h % 12 },
        m,
        if h < 12 { "am" } else { "pm" }
    )
}

/// A reminder that has just come due. `late_secs` > 0 means it was missed while the app was closed.
#[derive(Clone, Debug, Serialize)]
pub struct Alarm {
    pub id: u32,
    pub text: String,
    pub late_secs: u64,
}

#[derive(Serialize)]
struct Export<'a> {
    user_info: serde_json::Value,
    profile: &'a Option<Profile>,
    consents: &'a Consents,
    facts: &'a [Fact],
    reminders: &'a ReminderBook,
}

impl Assistant {
    /// `off`: local UTC offset in seconds. Unreadable data (e.g. key lost after reinstall) is discarded and the app starts fresh.
    pub fn open(dir: impl Into<PathBuf>, ks: &dyn SecureStore, off: i64) -> Result<Self> {
        let dir = dir.into();
        let store = EncStore::new(&dir, Vault::open(ks)?)?;
        if store.load::<Profile>("profile").is_err() || store.load::<Consents>("consents").is_err()
        {
            store.wipe_files()?;
        }
        let profile: Option<Profile> = store.load("profile")?;
        let mut engine = Engine::seeded(profile.as_ref().map_or("friend", |p| p.name.as_str()));
        engine.ledger = store.load("ledger")?.unwrap_or_default();
        let mut content: Vec<Item> = serde_json::from_str(CONTENT).map_err(|e| e.to_string())?;
        content.extend(store.load::<Vec<Item>>("content")?.unwrap_or_default());
        content.extend(
            serde_json::from_str::<Vec<Item>>(include_str!("../seed/geo-facts.json"))
                .map_err(|e| e.to_string())?,
        );
        let mut registry: Registry = store.load("sources")?.unwrap_or_else(Registry::seeded);
        registry.merge_seed();
        Ok(Self {
            engine,
            dir,
            off,
            profile,
            content,
            registry,
            consents: store.load("consents")?.unwrap_or_default(),
            facts: store.load("facts")?.unwrap_or_default(),
            reminders: store.load("reminders")?.unwrap_or_default(),
            cache: store.load("briefcache")?.unwrap_or_default(),
            helpline: store
                .load::<String>("helpline")?
                .unwrap_or_else(|| values::default_helpline(off)),
            policy: BreakerPolicy::default(),
            store,
        })
    }
    fn persist(&self) -> Result<()> {
        self.store.save("consents", &self.consents)?;
        if let Some(p) = &self.profile {
            self.store.save("profile", p)?;
        }
        self.store.save("sources", &self.registry)?;
        self.store.save("briefcache", &self.cache)?;
        self.store.save("helpline", &self.helpline)?;
        let fetched: Vec<&Item> = self.content.iter().filter(|i| i.fetched > 0).collect();
        self.store.save("content", &fetched)?;
        if self.consents.is_granted(Purpose::LocalMemory) {
            self.store.save("facts", &self.facts)?;
            self.store.save("ledger", &self.engine.ledger)?;
            self.store.save("reminders", &self.reminders)?;
        }
        Ok(())
    }
    pub fn set_tz(&mut self, off: i64) {
        self.off = off;
    }
    pub fn set_name(&mut self, n: &str) {
        self.engine.set_user(n);
    }
    pub fn register(&mut self, p: Profile) -> Result<()> {
        p.validate()?;
        self.engine.set_user(&p.name);
        self.profile = Some(p);
        self.persist()
    }
    pub fn consents(&self) -> &[Consent] {
        self.consents.all()
    }
    /// Withdrawing a consent deletes what it had collected.
    pub fn set_consent(&mut self, p: Purpose, granted: bool, now: u64) -> Result<()> {
        self.consents.set(p, granted, now);
        if !granted {
            match p {
                Purpose::LearnInterests => self.facts.clear(),
                Purpose::LocalMemory => {
                    self.facts.clear();
                    self.reminders = ReminderBook::default();
                    self.engine.ledger = Ledger::default();
                    for n in ["facts", "ledger", "reminders", "user-info"] {
                        self.store.remove(n)?;
                    }
                }
                Purpose::Prefetch => {
                    self.store.remove("marketpanels")?;
                    self.cache.clear();
                    self.content.retain(|i| i.fetched == 0);
                }
                _ => {}
            }
        }
        self.persist()
    }
    pub fn set_chatty(&mut self, level: &str) {
        self.policy = match level {
            "quiet" => BreakerPolicy {
                max_per_hour: 0,
                ..Default::default()
            },
            "lively" => BreakerPolicy {
                idle_secs: 45,
                min_gap_secs: 120,
                max_per_hour: 12,
                ..Default::default()
            },
            _ => BreakerPolicy::default(),
        };
    }
    pub fn helpline(&self) -> String {
        self.helpline.clone()
    }
    pub fn set_helpline(&mut self, text: &str) -> Result<()> {
        self.helpline = text.trim().chars().take(120).collect();
        self.persist()
    }
    fn interests(&self) -> Vec<String> {
        self.facts
            .iter()
            .filter(|f| f.kind == FactKind::Like && f.confirmed != Some(false))
            .map(|f| f.value.clone())
            .collect()
    }

    // ---- sources, fetching, brief ----
    pub fn user_info(&self) -> Result<serde_json::Value> {
        Ok(self.store.load("user-info")?.unwrap_or(serde_json::json!({"interests":[],"contacts":[],"dates":[],"portfolio":[],"watchlist":[],"safety":[]})))
    }
    pub fn set_user_info(&mut self, value: serde_json::Value) -> Result<()> {
        if !self.consents.is_granted(Purpose::LocalMemory) {
            return Err("Enable local memory before saving personal information".into());
        }
        let obj = value.as_object().ok_or("Expected user information")?;
        for (key, v) in obj {
            if ![
                "interests",
                "contacts",
                "dates",
                "portfolio",
                "watchlist",
                "safety",
                "likes",
                "dislikes",
            ]
            .contains(&key.as_str())
            {
                return Err("Unknown user information section".into());
            };
            let a = v.as_array().ok_or("Expected list")?;
            if a.len() > 100
                || a.iter()
                    .any(|x| x.as_str().map_or(true, |t| t.chars().count() > 200))
            {
                return Err("List is too long".into());
            }
        }
        self.store.save("user-info", &value)
    }
    pub fn update_name(&mut self, name: &str) -> Result<()> {
        let n = name.trim();
        if n.is_empty() || n.chars().count() > 80 {
            return Err("Use a name of 1–80 characters".into());
        };
        self.engine.set_user(n);
        if let Some(profile) = &mut self.profile {
            profile.name = n.into()
        };
        self.persist()
    }
    fn ensure_market_symbols(&mut self, region: &str) {
        let old = self
            .store
            .load::<String>("managed-market-symbols")
            .ok()
            .flatten();
        if self.registry.place.symbols == "^spx,^ndq"
            || old.as_deref() == Some(self.registry.place.symbols.as_str())
        {
            let symbols = match region {
                "IN" => "^NSEI,^BSESN,^NSEBANK,^CNXIT,^GSPC,^NDX",
                "GB" => "^FTSE,^GSPC,^NDX",
                "JP" => "^N225,^GSPC,^NDX",
                "FR" => "^FCHI,^GSPC,^NDX",
                "DE" => "^GDAXI,^GSPC,^NDX",
                "AU" => "^AXJO,^GSPC,^NDX",
                "CA" => "^GSPTSE,^GSPC,^NDX",
                "HK" => "^HSI,^GSPC,^NDX",
                _ => "^GSPC,^NDX,^DJI",
            };
            self.registry.place.symbols = symbols.into();
            let _ = self.store.save("managed-market-symbols", &symbols);
        }
    }
    pub fn refresh_minutes(&self) -> u64 {
        self.store
            .load::<u64>("refresh-minutes")
            .ok()
            .flatten()
            .unwrap_or(15)
    }
    pub fn set_refresh_minutes(&mut self, minutes: u64) -> Result<()> {
        if ![5, 15, 30, 60].contains(&minutes) {
            return Err("Choose 5, 15, 30 or 60 minutes".into());
        };
        self.store.save("refresh-minutes", &minutes)?;
        for source in &mut self.registry.sources {
            if matches!(source.kind, Kind::RssNews | Kind::Weather | Kind::Markets) {
                source.every_secs = minutes * 60;
                if source.fails == 0 {
                    source.next_due = source.last_ok + minutes * 60
                }
            }
        }
        self.persist()
    }
    pub fn stored_items(&self) -> serde_json::Value {
        let mut items = vec![];
        for it in self.content.iter().filter(|i| i.fetched > 0) {
            items.push(serde_json::json!({"id":format!("content:{}",it.id),"title":it.text,"topic":format!("{:?} / {}",it.family,it.topic),"bytes":it.text.len(),"source":it.source,"time":it.fetched}))
        }
        for source in self
            .registry
            .sources
            .iter()
            .filter(|s| s.kind == Kind::RssNews)
        {
            if let Some(text) = self.cache.get(&format!("data#{}", source.id)) {
                if let Ok(news) = serde_json::from_str::<Vec<serde_json::Value>>(text) {
                    for n in news {
                        let link = n["link"].as_str().unwrap_or("");
                        items.push(serde_json::json!({"id":format!("news:{}:{:x}",source.id,hash(link)),"title":n["title"],"topic":format!("News / {}",source.name),"bytes":n.to_string().len(),"source":source.attribution,"time":source.last_ok}))
                    }
                }
            }
        }
        for (id, title) in [
            ("weather", "Weather cache"),
            ("marketpanels", "Indices and constituent price cache"),
        ] {
            let bytes = if id == "weather" {
                self.cache.get("data#weather").map_or(0, |s| s.len())
            } else {
                self.market_cache().map_or(0, |v| {
                    if v == serde_json::json!({}) {
                        0
                    } else {
                        v.to_string().len()
                    }
                })
            };
            if bytes > 0 {
                items.push(serde_json::json!({"id":format!("cache:{id}"),"title":title,"topic":"Weather & Markets","bytes":bytes,"source":"App cache","time":0}))
            }
        }
        serde_json::json!({"items":items,"refreshMinutes":self.refresh_minutes(),"bundledItems":self.content.iter().filter(|i|i.fetched==0).count(),"localFactsServed":self.engine.ledger.geo_local_served,"worldFactsServed":self.engine.ledger.geo_world_served})
    }
    pub fn delete_stored(&mut self, ids: &[String]) -> Result<usize> {
        if ids.len() > 5000 {
            return Err("Too many selected entries".into());
        };
        let before = self.content.len();
        self.content
            .retain(|i| i.fetched == 0 || !ids.contains(&format!("content:{}", i.id)));
        let mut removed = before - self.content.len();
        for source in self
            .registry
            .sources
            .iter()
            .filter(|s| s.kind == Kind::RssNews)
        {
            let key = format!("data#{}", source.id);
            if let Some(text) = self.cache.get(&key).cloned() {
                if let Ok(mut news) = serde_json::from_str::<Vec<serde_json::Value>>(&text) {
                    let n = news.len();
                    news.retain(|v| {
                        !ids.contains(&format!(
                            "news:{}:{:x}",
                            source.id,
                            hash(v["link"].as_str().unwrap_or(""))
                        ))
                    });
                    removed += n - news.len();
                    if n != news.len() {
                        if news.is_empty() {
                            self.cache.remove(&key);
                            self.cache.remove(&source.id);
                        } else {
                            self.cache.insert(
                                key,
                                serde_json::to_string(&news).map_err(|e| e.to_string())?,
                            );
                            self.cache.insert(
                                source.id.clone(),
                                format!(
                                    "{}\n• {}",
                                    source.attribution,
                                    news.iter()
                                        .take(source.per_fetch)
                                        .map(|v| format!(
                                            "{} — {}",
                                            v["title"].as_str().unwrap_or(""),
                                            v["summary"].as_str().unwrap_or("")
                                        ))
                                        .collect::<Vec<_>>()
                                        .join("\n• ")
                                ),
                            );
                        }
                    }
                }
            }
        }
        if ids.contains(&"cache:weather".into()) {
            self.cache.remove("weather");
            self.cache.remove("data#weather");
            removed += 1
        }
        if ids.contains(&"cache:marketpanels".into()) {
            self.store.remove("marketpanels")?;
            self.cache
                .retain(|k, _| !k.starts_with("markets#") && !k.starts_with("data#markets#"));
            removed += 1
        }
        self.persist()?;
        Ok(removed)
    }
    pub fn region(&self) -> String {
        self.store
            .load::<String>("region")
            .ok()
            .flatten()
            .unwrap_or_else(|| "IN".into())
    }
    pub fn set_region(&mut self, region: &str) -> Result<()> {
        let r = region.to_uppercase();
        if r.len() != 2 || !r.bytes().all(|c| c.is_ascii_uppercase()) {
            return Err("Choose a two-letter country".into());
        };
        self.store.save("region", &r)?;
        self.ensure_region_source(&r);
        self.ensure_market_symbols(&r);
        self.persist()
    }
    fn news_matches_region(&self, source: &Source) -> bool {
        if source.kind != Kind::RssNews {
            return true;
        }
        if let Some(country) = source.topic.strip_prefix("country:") {
            return country.eq_ignore_ascii_case(&self.region());
        }
        source.user_added || self.region() == "GB"
    }
    fn ensure_region_source(&mut self, r: &str) {
        let spec = match r {
            "IN" => Some((
                "India — Hindustan Times",
                "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
            )),
            "US" => Some(("US — NPR", "https://feeds.npr.org/1001/rss.xml")),
            "GB" => Some(("UK — BBC", "https://feeds.bbci.co.uk/news/uk/rss.xml")),
            _ => None,
        };
        if let Some((name, url)) = spec {
            let id = format!("region-news-{r}");
            if let Some(source) = self.registry.sources.iter_mut().find(|s| s.id == id) {
                if source.url != url {
                    source.url = url.into();
                    source.name = name.into();
                    source.attribution = name.into();
                    source.next_due = 0;
                    self.cache.remove(&source.id);
                    self.cache.remove(&format!("data#{}", source.id));
                }
            } else {
                let mut source = Registry::seeded()
                    .sources
                    .into_iter()
                    .find(|s| s.kind == Kind::RssNews)
                    .unwrap();
                source.id = id;
                source.name = name.into();
                source.url = url.into();
                source.attribution = name.into();
                source.topic = format!("country:{r}");
                source.per_fetch = 8;
                source.next_due = 0;
                self.registry.sources.push(source);
            }
        }
    }
    pub fn market_cache(&self) -> Result<serde_json::Value> {
        Ok(self
            .store
            .load("marketpanels")?
            .unwrap_or(serde_json::json!({})))
    }
    pub fn save_market_cache(&self, value: &serde_json::Value) -> Result<()> {
        if !self.consents.is_granted(Purpose::Prefetch) {
            return Err("Online updates are off".into());
        };
        if value.to_string().len() > 2_000_000 {
            return Err("Market cache exceeds limit".into());
        };
        self.store.save("marketpanels", value)
    }
    pub fn panels(&self) -> serde_json::Value {
        let news: Vec<serde_json::Value> = self
            .registry
            .sources
            .iter()
            .filter(|s| s.enabled && s.kind == Kind::RssNews && self.news_matches_region(s))
            .flat_map(|s| {
                self.cache
                    .get(&format!("data#{}", s.id))
                    .and_then(|t| serde_json::from_str::<Vec<serde_json::Value>>(t).ok())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|mut n| {
                        n["topic"] = s.topic.clone().into();
                        n["sourceName"] = s.name.clone().into();
                        n
                    })
            })
            .collect();
        let weather = self
            .cache
            .get("data#weather")
            .and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok());
        let quotes: Vec<serde_json::Value> = self
            .registry
            .place
            .symbols
            .split(',')
            .filter_map(|sym| self.cache.get(&format!("data#markets#{}", sym.trim())))
            .filter_map(|t| serde_json::from_str(t).ok())
            .collect();
        serde_json::json!({"news":news,"weather":weather,"quotes":quotes,"sources":self.sources()})
    }
    pub fn add_news_source(&mut self, name: &str, url: &str) -> Result<()> {
        self.add_source(name, url, Family::Fact)?;
        let id = format!("user{:x}", hash(url.trim()));
        if let Some(s) = self.registry.sources.iter_mut().find(|s| s.id == id) {
            s.kind = Kind::RssNews;
            s.topic = "news".into();
            s.every_secs = 1800;
            s.per_fetch = 6
        };
        self.persist()
    }
    pub fn sources(&self) -> Vec<Source> {
        self.registry.sources.clone()
    }
    pub fn place(&self) -> Place {
        self.registry.place.clone()
    }
    pub fn set_place(
        &mut self,
        city: &str,
        lat: Option<f64>,
        lon: Option<f64>,
        symbols: &str,
    ) -> Result<()> {
        let city: String = city.trim().chars().take(60).collect();
        if self.registry.place.city != city
            || self.registry.place.lat != lat
            || self.registry.place.lon != lon
        {
            self.cache.remove("weather");
            self.cache.remove("data#weather");
        }
        self.registry.place = Place {
            city,
            lat,
            lon,
            symbols: symbols.trim().chars().take(80).collect(),
        };
        for id in ["weather", "markets"] {
            if let Some(s) = self.registry.sources.iter_mut().find(|s| s.id == id) {
                s.next_due = 0;
            }
        }
        self.persist()
    }
    pub fn toggle_source(&mut self, id: &str, enabled: bool) -> Result<()> {
        if let Some(s) = self.registry.sources.iter_mut().find(|s| s.id == id) {
            s.enabled = enabled;
        }
        self.persist()
    }
    /// Adds an RSS source. https only; the registry (not the UI) decides what is ever fetched.
    pub fn add_source(&mut self, name: &str, url: &str, family: Family) -> Result<()> {
        let (name, url) = (name.trim(), url.trim());
        if !url.starts_with("https://") || url.len() > 300 || url.contains(char::is_whitespace) {
            return Err("use a full https:// link".into());
        }
        if name.is_empty() || family == Family::Question {
            return Err("give the source a name".into());
        }
        let id = format!("user{:x}", hash(url));
        if self
            .registry
            .sources
            .iter()
            .any(|s| s.id == id || s.url == url)
        {
            return Err("that source is already added".into());
        }
        self.registry.sources.push(Source {
            id,
            name: name.chars().take(40).collect(),
            kind: Kind::Rss,
            family,
            topic: "custom".into(),
            url: url.into(),
            attribution: name.chars().take(40).collect(),
            per_fetch: 3,
            every_secs: 21_600,
            enabled: true,
            user_added: true,
            fails: 0,
            next_due: 0,
            last_ok: 0,
            last_error: String::new(),
            total: 0,
        });
        self.persist()
    }
    fn count(&self, f: Family) -> usize {
        self.content
            .iter()
            .filter(|i| i.family == f && i.fetched > 0)
            .count()
    }
    /// Empty unless the user allowed prefetch. `force` makes every source due (the "Fetch now" button).
    pub fn fetch_plan(&mut self, now: u64, force: bool) -> Vec<FetchReq> {
        if !self.consents.is_granted(Purpose::Prefetch) {
            return vec![];
        }
        let region = self.region();
        self.ensure_region_source(&region);
        self.ensure_market_symbols(&region);
        let minutes = self.refresh_minutes();
        for source in &mut self.registry.sources {
            if matches!(source.kind, Kind::RssNews | Kind::Weather | Kind::Markets) {
                source.every_secs = minutes * 60;
                if source.fails == 0 {
                    source.next_due = source.last_ok + minutes * 60
                }
            }
        }
        if force {
            for s in self.registry.sources.iter_mut() {
                s.next_due = 0;
            }
        }
        let counts: HashMap<Family, usize> =
            [Family::Joke, Family::Fact, Family::Story, Family::Anecdote]
                .iter()
                .map(|f| (*f, self.count(*f)))
                .collect();
        {
            let permitted: std::collections::HashSet<String> = self
                .registry
                .sources
                .iter()
                .filter(|source| self.news_matches_region(source))
                .map(|s| s.id.clone())
                .collect();
            self.registry
                .plan(
                    now,
                    self.off,
                    &|f| counts.get(&f).copied().unwrap_or(0),
                    MAX_STOCK,
                )
                .into_iter()
                .filter(|request| permitted.contains(request.id.split('#').next().unwrap_or("")))
                .collect()
        }
    }
    pub fn fetch_failed(&mut self, id: &str, now: u64) {
        self.registry.mark_fail(id, now);
        self.registry.error(
            id,
            "Network request failed; check connection or source availability",
        );
        let _ = self.persist();
    }
    /// Parses a fetched body. New, safe, non-duplicate items are added (at most `per_fetch` per fetch); returns how many.
    pub fn ingest(&mut self, id: &str, body: &str, now: u64) -> Result<usize> {
        let base = id.split('#').next().unwrap_or(id);
        let src = self
            .registry
            .sources
            .iter()
            .find(|s| s.id == base)
            .cloned()
            .ok_or_else(|| "unknown source".to_string())?;
        let parsed = match self.registry.parse(&src, id, body, now) {
            Ok(p) => p,
            Err(e) => {
                self.registry.mark_fail(id, now);
                self.registry.error(id, &e);
                let _ = self.persist();
                return Err(e);
            }
        };
        match src.kind {
            Kind::RssNews => {
                self.cache.insert(
                    format!("data#{}", id),
                    serde_json::to_string(&sources::news_articles(body, &src.attribution))
                        .map_err(|e| e.to_string())?,
                );
            }
            Kind::Weather => {
                let mut v: serde_json::Value =
                    serde_json::from_str(body).map_err(|e| e.to_string())?;
                v["fetched"] = now.into();
                v["city"] = self.registry.place.city.clone().into();
                self.cache.insert(format!("data#{}", id), v.to_string());
            }
            Kind::Markets if body.trim_start().starts_with('{') => {
                let v: serde_json::Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                let m = &v["chart"]["result"][0]["meta"];
                self.cache.insert(format!("data#{}",id),serde_json::json!({"symbol":m["symbol"],"price":m["regularMarketPrice"],"percent":m["regularMarketChangePercent"].as_f64().or(m["fulldayChangePercent"].as_f64()),"change":m["regularMarketChange"].as_f64().or(m["fulldayChange"].as_f64()),"currency":m["currency"],"marketTime":m["regularMarketTime"],"status":"delayed / indicative","source":"Yahoo Finance","fetched":now}).to_string());
            }
            Kind::Markets => {
                let row = body.lines().nth(1).unwrap_or("");
                let f: Vec<_> = row.split(',').collect();
                let v = serde_json::json!({"symbol":id.split('#').nth(1).unwrap_or(""),"date":f.get(1),"time":f.get(2),"open":f.get(3).and_then(|s|s.parse::<f64>().ok()),"price":f.get(6).and_then(|s|s.parse::<f64>().ok()),"fetched":now,"status":"delayed snapshot","basis":"from open","source":src.attribution});
                self.cache.insert(format!("data#{}", id), v.to_string());
            }
            _ => {}
        }
        let added = match parsed {
            Parsed::Brief(t) => {
                self.cache.insert(id.to_string(), t);
                1
            }
            Parsed::Items(items) => {
                let mut n = 0;
                for it in items {
                    if n >= src.per_fetch {
                        break;
                    }
                    let dup = self.content.iter().any(|c| {
                        c.id == it.id
                            || (c.family == it.family && near_duplicate(&c.text, &it.text))
                    });
                    if !dup {
                        self.content.push(it);
                        n += 1;
                    }
                }
                self.evict();
                n
            }
        };
        self.registry.mark_ok(id, now, added);
        self.persist()?;
        Ok(added)
    }
    fn evict(&mut self) {
        for fam in [Family::Joke, Family::Fact, Family::Story, Family::Anecdote] {
            let mut idx: Vec<(u64, String)> = self
                .content
                .iter()
                .filter(|i| i.family == fam && i.fetched > 0)
                .map(|i| (i.fetched, i.id.clone()))
                .collect();
            if idx.len() > MAX_STOCK {
                idx.sort();
                let n = idx.len() - MAX_STOCK;
                let drop: std::collections::HashSet<String> =
                    idx.into_iter().take(n).map(|x| x.1).collect();
                self.content.retain(|i| !drop.contains(&i.id));
            }
        }
    }
    fn schedule_text(&self, now: u64) -> String {
        let day0 = now as i64 + self.off - (now as i64 + self.off).rem_euclid(86_400);
        let end = (day0 + 86_400 - self.off) as u64;
        let mut v: Vec<_> = self
            .reminders
            .items
            .iter()
            .filter(|r| !r.done && r.due >= now && r.due < end)
            .collect();
        v.sort_by_key(|r| r.due);
        if v.is_empty() {
            "Nothing scheduled for the rest of today.".into()
        } else {
            format!(
                "Today: {}.",
                v.iter()
                    .map(|r| format!("{} at {}", r.text, hhmm(r.due as i64 + self.off)))
                    .collect::<Vec<_>>()
                    .join("; ")
            )
        }
    }
    /// Read-only upcoming reminders; no device-calendar permission, and never marks reminders done.
    pub fn daybook(&self, now: u64) -> Vec<crate::learn::Reminder> {
        self.reminders
            .items
            .iter()
            .filter(|r| {
                !r.done
                    && r.due >= now.saturating_sub(86_400)
                    && r.due <= now.saturating_add(90 * 86_400)
            })
            .take(300)
            .cloned()
            .collect()
    }
    pub fn brief(&self, now: u64) -> Brief {
        let seed = Brief::seeded();
        let news: Vec<String> = self
            .registry
            .sources
            .iter()
            .filter(|s| s.kind == Kind::RssNews && s.enabled && self.news_matches_region(s))
            .filter_map(|s| self.cache.get(&s.id).cloned())
            .collect();
        let mut mk: Vec<(&String, &String)> = self
            .cache
            .iter()
            .filter(|(k, _)| k.starts_with("markets#"))
            .collect();
        mk.sort();
        Brief {
            source: if self.cache.is_empty() {
                "seed".into()
            } else {
                "live".into()
            },
            weather: self.cache.get("weather").cloned().unwrap_or(seed.weather),
            schedule: self.schedule_text(now),
            news: if news.is_empty() {
                seed.news
            } else {
                news.join("\n\n")
            },
            markets: if mk.is_empty() {
                seed.markets
            } else {
                format!(
                    "Markets: {}.",
                    mk.iter()
                        .map(|(_, v)| v.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            },
        }
    }
    /// Finishes an online lookup started by `handle_text` (tier "search"). The answer is stored for offline reuse.
    pub fn ingest_lookup(&mut self, body: &str, now: u64) -> Resolution {
        match sources::parse_lookup(body) {
            Some(l) => {
                let src = "Wikipedia (CC BY-SA)".to_string();
                let item = Item { id: format!("wiki:{:x}", hash(&l.title)), family: Family::Fact, topic: l.title.to_lowercase(), text: l.summary.clone(), source: src.clone(), link: l.url.clone(), fetched: now };
                if !self.content.iter().any(|c| c.id == item.id) { self.content.push(item); self.evict(); }
                let _ = self.persist();
                let mut r = Resolution::of(Tier::Search, l.summary);
                r.source = Some(src);
                if !l.url.is_empty() { r.link = Some(l.url); }
                r
            }
            None => Resolution::of(Tier::Search, "I could not find a clear answer to that online. Could you rephrase it or be more specific?".into()),
        }
    }

    // ---- conversation ----
    pub fn handle_text(&mut self, text: &str, now: u64) -> Resolution {
        if let Some(msg) = values::check(text, &self.helpline) {
            return Resolution::of(Tier::Safety, msg);
        }
        self.engine.set_brief(self.brief(now));
        if let Some((what, due)) = parse_reminder(text, now, self.off) {
            if !self.consents.is_granted(Purpose::LocalMemory) {
                return skill("I can set that reminder once you allow me to remember things. Switch on Local memory in Settings, under Privacy & Security.".into());
            }
            self.reminders.add(what.clone(), due);
            let _ = self.persist();
            let v = vec![
                format!("Done. I will remind you to {what}."),
                format!("Got it, I will nudge you to {what}."),
                format!("Noted! A reminder to {what} is set."),
            ];
            let k = self.engine.ledger.pick_variant("remind", &v, now);
            return skill(v[k].clone());
        }
        if let Some(fam) = content_family(text) {
            let interests = self.interests();
            let query = text.to_lowercase();
            let specific_topic = if query.contains("science fact") {
                Some("science")
            } else if query.contains("technology fact") {
                Some("technology")
            } else if query.contains("history fact") {
                Some("history")
            } else {
                None
            };
            let selected: Option<Vec<Item>> = specific_topic.map(|topic| {
                self.content
                    .iter()
                    .filter(|it| it.topic == topic)
                    .cloned()
                    .collect()
            });
            let pool: &[Item] = selected.as_deref().unwrap_or(&self.content);
            let local = self.region();
            let regional = if fam == Family::Fact && specific_topic.is_none() {
                self.engine
                    .ledger
                    .pick_geographic(pool, fam, &local, &interests, now)
            } else {
                None
            };
            let r = if let Some(it) = regional {
                from_item(&it, Tier::Skill)
            } else {
                match self.engine.ledger.pick(pool, fam, &interests, now) {
                Some(it) => from_item(it, Tier::Skill),
                None => skill("I have run out of fresh ones for now. I will fetch more when I am online rather than repeat myself.".into()),
            }
            };
            let _ = self.persist();
            return r;
        }
        if !is_skill_query(text) {
            if let Some(topic) = rag::info_topic(text) {
                if let Some((it, _)) = rag::search(&self.content, &topic, 1).first() {
                    return from_item(it, Tier::Rag);
                }
                if self.consents.is_granted(Purpose::Prefetch) {
                    let mut r = Resolution::of(Tier::Search, "Let me look that up.".into());
                    r.lookup = Some(FetchReq {
                        id: format!("lookup:{topic}"),
                        url: sources::lookup_url(&topic),
                    });
                    return r;
                }
                return self.engine.resolve(text, now);
            }
        }
        if self.consents.is_granted(Purpose::LearnInterests) {
            let f = extract(text, now);
            if let Some(first) = f.first().cloned() {
                self.facts.extend(f);
                let _ = self.persist();
                let x = &first.value;
                let (key, v) = match first.kind {
                    FactKind::Like => (
                        "ack_like",
                        vec![
                            format!("Lovely, I will remember that you like {x}."),
                            format!("Nice! {x} goes on my list of things you enjoy."),
                            format!("Good to know you like {x}."),
                        ],
                    ),
                    FactKind::Dislike => (
                        "ack_dislike",
                        vec![
                            format!("Understood, no {x} from me."),
                            format!("Noted, {x} is not your thing."),
                            format!("Got it, I will steer clear of {x}."),
                        ],
                    ),
                };
                let k = self.engine.ledger.pick_variant(key, &v, now);
                return skill(v[k].clone());
            }
        }
        let mut res = self.engine.resolve(text, now);
        if self.consents.is_granted(Purpose::MoodAnalysis) && sentiment(text) <= -2 {
            let v = vec![
                "I am sorry it is a heavy moment. I am here with you.".to_string(),
                "That sounds hard. Take your time; I am listening.".to_string(),
                "I hear you. Shall we go gently?".to_string(),
            ];
            let k = self.engine.ledger.pick_variant("empathy", &v, now);
            res.reply = format!("{} {}", v[k], res.reply);
        }
        let _ = self.persist();
        res
    }

    /// Self-initiated chatter: a getting-to-know-you question while little is known, else fresh content. None = stay quiet.
    pub fn silence_breaker(&mut self, now: u64, idle: u64) -> Option<String> {
        let hour = ((now as i64 + self.off).rem_euclid(86_400) / 3600) as u32;
        let learn = self.consents.is_granted(Purpose::LearnInterests) && self.facts.len() < 5;
        let fams = if learn {
            vec![
                Family::Question,
                Family::Joke,
                Family::Fact,
                Family::Story,
                Family::Anecdote,
            ]
        } else {
            vec![Family::Joke, Family::Fact, Family::Story, Family::Anecdote]
        };
        let interests = self.interests();
        let local = self.region();
        let selected = self
            .engine
            .ledger
            .silence_breaker_regional(
                &self.policy,
                &self.content,
                &fams,
                &interests,
                now,
                idle,
                hour,
                Some(&local),
            )?
            .clone();
        let text = selected.text;
        let _ = self.persist();
        Some(text)
    }

    /// In-app alarm clock: call every few seconds while the app is open, and once on resume. Each reminder fires once.
    pub fn tick(&mut self, now: u64) -> Vec<Alarm> {
        let due: Vec<Alarm> = self
            .reminders
            .due(now)
            .iter()
            .map(|r| Alarm {
                id: r.id,
                text: r.text.clone(),
                late_secs: now - r.due,
            })
            .collect();
        for a in &due {
            self.reminders.complete(a.id);
        }
        if !due.is_empty() {
            let _ = self.persist();
        }
        due
    }

    pub fn what_i_know(&self) -> Vec<String> {
        self.facts
            .iter()
            .map(|f| {
                format!(
                    "{} {} (a guess{})",
                    if f.kind == FactKind::Like {
                        "You like"
                    } else {
                        "You dislike"
                    },
                    f.value,
                    match f.confirmed {
                        Some(true) => ", confirmed",
                        Some(false) => ", rejected",
                        None => "",
                    }
                )
            })
            .collect()
    }
    pub fn forget(&mut self, idx: usize) -> Result<()> {
        if idx < self.facts.len() {
            self.facts.remove(idx);
        }
        self.persist()
    }
    pub fn export_json(&self) -> Result<String> {
        serde_json::to_string_pretty(&Export {
            user_info: self.user_info()?,
            profile: &self.profile,
            consents: &self.consents,
            facts: &self.facts,
            reminders: &self.reminders,
        })
        .map_err(|e| e.to_string())
    }
    /// Destroys the key first (crypto-erase), deletes files, then reopens clean with a brand-new key.
    pub fn wipe(&mut self, ks: &dyn SecureStore) -> Result<()> {
        Vault::destroy_key(ks)?;
        self.store.wipe_files()?;
        let (dir, off) = (self.dir.clone(), self.off);
        *self = Assistant::open(dir, ks, off)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::MemSecureStore;
    const NOW: u64 = 1_700_000_000;
    const JOKES: &str = r#"{"error":false,"amount":3,"jokes":[{"id":1,"type":"single","joke":"I used to be a banker, but I lost interest."},{"id":2,"type":"single","joke":"A joke about being killed in a sword fight at dawn."},{"id":3,"type":"single","joke":"Why don't scientists trust atoms? Because they make up everything."}]}"#;
    const NASA: &str = "<rss><channel><item><title>Webb Telescope Finds New Galaxy</title><link>https://science.nasa.gov/a</link><description>Astronomers using the Webb telescope found a distant galaxy. More soon.</description></item></channel></rss>";
    const EINSTEIN: &str = r#"{"query":{"pages":[{"title":"Albert Einstein","extract":"Albert Einstein was a German-born physicist. He developed the theory of relativity.","fullurl":"https://en.wikipedia.org/wiki/Albert_Einstein"}]}}"#;

    fn mk() -> (Assistant, MemSecureStore, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "vce-t-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let ks = MemSecureStore::default();
        (Assistant::open(&dir, &ks, 19_800).unwrap(), ks, dir)
    }
    fn profile(adult: bool) -> Profile {
        Profile {
            name: "Asha".into(),
            lang: "English".into(),
            tone: "playful".into(),
            age_band: None,
            adult_confirmed: adult,
            created: NOW,
        }
    }
    fn enc_files(dir: &PathBuf) -> Vec<Vec<u8>> {
        std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| {
                let p = e.unwrap().path();
                (p.extension().map_or(false, |x| x == "enc")).then(|| std::fs::read(p).unwrap())
            })
            .collect()
    }
    fn online(a: &mut Assistant) {
        a.set_consent(Purpose::Prefetch, true, NOW).unwrap();
    }

    #[test]
    fn explicit_user_lists_need_consent_persist_and_revoke() {
        let (mut a, ks, d) = mk();
        let v = serde_json::json!({"contacts":["friend +12345"],"interests":["music"],"dates":[],"portfolio":[],"watchlist":[],"safety":["+12345"]});
        assert!(a.set_user_info(v.clone()).is_err());
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.set_user_info(v.clone()).unwrap();
        assert_eq!(Assistant::open(&d, &ks, 0).unwrap().user_info().unwrap(), v);
        assert!(
            !String::from_utf8_lossy(&std::fs::read(d.join("user-info.enc")).unwrap())
                .contains("friend")
        );
        a.set_consent(Purpose::LocalMemory, false, NOW).unwrap();
        assert!(a.user_info().unwrap()["contacts"]
            .as_array()
            .unwrap()
            .is_empty());
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn news_addition_uses_news_parser_and_panels_keep_links() {
        let (mut a, _, d) = mk();
        online(&mut a);
        a.add_news_source("News", "https://example.com/rss")
            .unwrap();
        let src = a.sources().into_iter().find(|s| s.name == "News").unwrap();
        assert_eq!(src.kind, Kind::RssNews);
        let body="<rss><channel><item><title>New telescope discovers a distant galaxy</title><description>Researchers confirmed a distant galaxy using repeated telescope observations during the latest survey.</description><link>https://example.com/story</link></item></channel></rss>";
        a.ingest(&src.id, body, NOW).unwrap();
        assert_eq!(a.panels()["news"][0]["link"], "https://example.com/story");
        a.toggle_source(&src.id, false).unwrap();
        assert!(a.panels()["news"].as_array().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn registration_requires_adult_confirmation() {
        let (mut a, _, d) = mk();
        assert!(a.register(profile(false)).is_err());
        assert!(a.register(profile(true)).is_ok());
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn reminders_need_consent_and_are_encrypted_on_disk() {
        let (mut a, _, d) = mk();
        a.register(profile(true)).unwrap();
        assert!(a
            .handle_text("remind me to call mother in 5 minutes", NOW)
            .reply
            .contains("allow me to remember"));
        assert!(a.reminders.items.is_empty());
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.handle_text("remind me to call mother in 5 minutes", NOW);
        assert_eq!(a.reminders.due(NOW + 400).len(), 1);
        let files = enc_files(&d);
        assert!(files.len() >= 3);
        for f in files {
            assert!(
                !f.windows(6).any(|w| w == b"mother"),
                "plaintext leaked to disk"
            );
        }
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn learning_needs_both_consents_and_withdrawal_deletes() {
        let (mut a, _, d) = mk();
        a.set_consent(Purpose::LearnInterests, true, NOW).unwrap();
        a.handle_text("I like cricket", NOW);
        assert!(
            a.what_i_know().is_empty(),
            "no learning without local-memory consent"
        );
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.handle_text("I like cricket", NOW + 1);
        assert!(a.what_i_know()[0].contains("cricket"));
        a.set_consent(Purpose::LearnInterests, false, NOW + 2)
            .unwrap();
        assert!(a.what_i_know().is_empty());
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn bundled_jokes_never_repeat_and_sustain_many_turns() {
        let (mut a, _, d) = mk();
        let jokes: Vec<String> = (0..3)
            .map(|i| a.handle_text("tell me a joke", NOW + i).reply)
            .collect();
        assert_eq!(
            jokes.iter().collect::<std::collections::HashSet<_>>().len(),
            3
        );
        assert!(
            !a.handle_text("tell me a joke", NOW + 9)
                .reply
                .contains("run out of fresh"),
            "50+ bundled jokes must remain available"
        );
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn silence_breaker_asks_to_get_to_know_you() {
        let (mut a, _, d) = mk();
        assert!(
            a.silence_breaker(NOW, 200).is_none(),
            "03:43 local is inside quiet hours"
        );
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.set_consent(Purpose::LearnInterests, true, NOW).unwrap();
        assert!(a
            .silence_breaker(NOW + 8 * 3600, 200)
            .unwrap()
            .ends_with('?'));
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn in_app_alarm_fires_once_and_reports_lateness() {
        let (mut a, _, d) = mk();
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.handle_text("remind me to take medicine in 1 minute", NOW);
        assert!(a.tick(NOW + 30).is_empty());
        let fired = a.tick(NOW + 61);
        assert_eq!(
            (fired.len(), fired[0].text.as_str(), fired[0].late_secs),
            (1, "take medicine", 1)
        );
        assert!(a.tick(NOW + 90).is_empty(), "fires only once");
        a.handle_text("remind me to stretch in 2 minutes", NOW + 100);
        assert_eq!(a.tick(NOW + 100 + 3600)[0].late_secs, 3600 - 120);
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn wipe_erases_everything_and_changes_key() {
        let (mut a, ks, d) = mk();
        a.register(profile(true)).unwrap();
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.set_consent(Purpose::LearnInterests, true, NOW).unwrap();
        a.handle_text("I love gardening", NOW);
        assert!(!enc_files(&d).is_empty());
        a.wipe(&ks).unwrap();
        assert!(enc_files(&d).is_empty());
        assert!(
            a.what_i_know().is_empty() && a.export_json().unwrap().contains("\"profile\": null")
        );
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn safety_layer_answers_before_anything_else() {
        let (mut a, _, d) = mk();
        let r = a.handle_text("I want to die", NOW);
        assert_eq!(r.tier, Tier::Safety);
        assert!(r.reply.contains("14416"));
        assert_eq!(
            a.handle_text("someone wants my OTP", NOW).tier,
            Tier::Safety
        );
        a.set_helpline("my sister Meera on 000").unwrap();
        assert!(a
            .handle_text("I want to die", NOW)
            .reply
            .contains("my sister Meera"));
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn fetching_needs_consent_dedupes_filters_persists_and_is_deleted_on_withdrawal() {
        let (mut a, ks, d) = mk();
        assert!(
            a.fetch_plan(NOW, false).is_empty(),
            "no prefetch without consent"
        );
        online(&mut a);
        assert!(a.fetch_plan(NOW, false).iter().any(|r| r.id == "jokeapi"));
        assert_eq!(
            a.ingest("jokeapi", JOKES, NOW).unwrap(),
            2,
            "unsafe joke rejected"
        );
        assert_eq!(
            a.ingest("jokeapi", JOKES, NOW + 10).unwrap(),
            0,
            "duplicates skipped"
        );
        assert!(
            !a.fetch_plan(NOW + 60, false)
                .iter()
                .any(|r| r.id == "jokeapi"),
            "not due again yet"
        );
        assert_eq!(a.count(Family::Joke), 2);
        drop(a);
        let mut a2 = Assistant::open(&d, &ks, 19_800).unwrap();
        assert_eq!(
            a2.count(Family::Joke),
            2,
            "fetched content survives restart"
        );
        let r = a2.handle_text("tell me a joke", NOW + 100);
        assert!(
            r.source.is_some() == (r.reply.contains("banker") || r.reply.contains("atoms")),
            "fetched jokes carry attribution"
        );
        a2.set_consent(Purpose::Prefetch, false, NOW + 200).unwrap();
        assert_eq!(
            a2.count(Family::Joke),
            0,
            "withdrawing prefetch deletes fetched content"
        );
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn failures_back_off_and_bad_bodies_are_rejected() {
        let (mut a, _, d) = mk();
        online(&mut a);
        assert!(a.ingest("jokeapi", "not json", NOW).is_err());
        assert!(
            !a.fetch_plan(NOW + 60, false)
                .iter()
                .any(|r| r.id == "jokeapi"),
            "backing off after failure"
        );
        assert!(a.ingest("nope", "x", NOW).is_err());
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn offline_knowledge_answers_from_fetched_items_with_attribution() {
        let (mut a, _, d) = mk();
        online(&mut a);
        a.ingest("nasa", NASA, NOW).unwrap();
        let r = a.handle_text("what is the webb telescope", NOW + 5);
        assert_eq!(r.tier, Tier::Rag);
        assert_eq!(
            (r.source.as_deref(), r.link.as_deref()),
            (Some("NASA"), Some("https://science.nasa.gov/a"))
        );
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn online_lookup_flow_then_offline_reuse() {
        let (mut a, _, d) = mk();
        assert!(
            a.handle_text("who was Albert Einstein", NOW).needs_model,
            "offline knowledge misses should use the local model without enabling internet"
        );
        online(&mut a);
        let r = a.handle_text("who was Albert Einstein", NOW);
        assert_eq!(r.tier, Tier::Search);
        assert!(r
            .lookup
            .as_ref()
            .unwrap()
            .url
            .contains("gsrsearch=albert%20einstein"));
        let done = a.ingest_lookup(EINSTEIN, NOW + 1);
        assert!(
            done.reply.contains("physicist")
                && done.source.as_deref() == Some("Wikipedia (CC BY-SA)")
        );
        let again = a.handle_text("tell me about Albert Einstein", NOW + 2);
        assert_eq!(
            again.tier,
            Tier::Rag,
            "second time it is answered from local storage"
        );
        assert_eq!(a.ingest_lookup("{}", NOW).tier, Tier::Search);
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn live_brief_combines_weather_markets_headlines_and_real_schedule() {
        let (mut a, _, d) = mk();
        online(&mut a);
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.set_place("Ahmedabad", Some(23.02), Some(72.57), "^spx")
            .unwrap();
        let plan = a.fetch_plan(NOW, false);
        assert!(
            plan.iter().any(|r| r.id == "weather") && plan.iter().any(|r| r.id == "markets#^spx")
        );
        a.ingest("weather", r#"{"current":{"temperature_2m":31.4,"weather_code":2},"daily":{"temperature_2m_max":[34.0],"temperature_2m_min":[25.5]}}"#, NOW).unwrap();
        a.ingest(
            "markets#^spx",
            "Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,d,t,5000.0,5050.0,4990.0,5040.0,0\n",
            NOW,
        )
        .unwrap();
        a.ingest("region-news-IN", "<rss><channel><item><title>Rains ease in the west</title><description>Forecasters report drier conditions across western regions after several days of heavy rainfall.</description><link>https://example.com/rain</link></item></channel></rss>", NOW).unwrap();
        a.handle_text("remind me to call mom in 120 minutes", NOW);
        let b = a.brief(NOW);
        assert_eq!(b.source, "live");
        assert!(
            b.weather.starts_with("Ahmedabad: 31")
                && b.markets.contains("S&P 500")
                && b.news.contains("Rains ease")
        );
        assert!(b.schedule.contains("call mom at 5:43 am"), "{}", b.schedule);
        assert!(a
            .handle_text("what's the weather", NOW)
            .reply
            .starts_with("Ahmedabad"));
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn user_added_sources_are_validated() {
        let (mut a, _, d) = mk();
        assert!(a
            .add_source("My blog", "http://example.com/feed", Family::Fact)
            .is_err());
        assert!(a
            .add_source("My blog", "https://example.com/feed.xml", Family::Fact)
            .is_ok());
        assert!(
            a.add_source("My blog", "https://example.com/feed.xml", Family::Fact)
                .is_err(),
            "duplicate"
        );
        assert!(a.sources().iter().any(|s| s.user_added && s.enabled));
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn selected_cached_items_can_be_deleted_without_personal_or_seed_loss() {
        let (mut a, ks, d) = mk();
        online(&mut a);
        a.set_consent(Purpose::LocalMemory, true, NOW).unwrap();
        a.set_user_info(
            serde_json::json!({"interests":["space"],"likes":["music"],"dislikes":["noise"]}),
        )
        .unwrap();
        a.ingest("jokeapi", JOKES, NOW).unwrap();
        let count = a.content.iter().filter(|i| i.fetched == 0).count();
        let row = a.stored_items()["items"].as_array().unwrap()[0].clone();
        let id = row["id"].as_str().unwrap().to_string();
        assert_eq!(a.delete_stored(&[id.clone()]).unwrap(), 1);
        assert_eq!(a.content.iter().filter(|i| i.fetched == 0).count(), count);
        drop(a);
        let b = Assistant::open(&d, &ks, 0).unwrap();
        assert!(b.stored_items()["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|i| i["id"] != id));
        assert_eq!(b.user_info().unwrap()["likes"][0], "music");
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn profile_name_and_refresh_frequency_persist() {
        let (mut a, ks, d) = mk();
        a.register(profile(true)).unwrap();
        a.update_name("Anu").unwrap();
        a.set_refresh_minutes(5).unwrap();
        assert!(a.set_refresh_minutes(1).is_err());
        drop(a);
        let mut b = Assistant::open(&d, &ks, 0).unwrap();
        assert!(b.handle_text("hello", NOW).reply.contains("Anu"));
        assert_eq!(b.refresh_minutes(), 5);
        assert_eq!(b.profile.as_ref().unwrap().name, "Anu");
        let _ = std::fs::remove_dir_all(d);
    }
    #[test]
    fn country_switch_excludes_previous_sources_from_panels_briefings_and_fetches() {
        let (mut a, _, directory) = mk();
        online(&mut a);
        a.set_region("IN").unwrap();
        let source = a
            .sources()
            .into_iter()
            .find(|s| s.id == "region-news-IN")
            .unwrap();
        let body = "<rss><channel><item><title>Ahmedabad science centre opens a new exhibit</title><description>Local science coverage with demonstrations and learning activities for students.</description><link>https://example.com/ahmedabad</link></item></channel></rss>";
        a.ingest(&source.id, body, NOW).unwrap();
        assert!(!a.panels()["news"].as_array().unwrap().is_empty());
        a.set_region("US").unwrap();
        assert!(a.panels()["news"].as_array().unwrap().is_empty());
        assert!(!a.brief(NOW).news.contains("Ahmedabad"));
        let requests = a.fetch_plan(NOW, true);
        assert!(!requests.iter().any(|r| r.id == "region-news-IN"));
        assert!(requests.iter().any(|r| r.id == "region-news-US"));
        let _ = std::fs::remove_dir_all(directory);
    }
    #[test]
    fn switching_city_clears_weather_but_editing_symbols_does_not() {
        let (mut assistant, _, dir) = mk();
        online(&mut assistant);
        assistant
            .set_place("Ahmedabad", Some(23.02), Some(72.57), "^spx")
            .unwrap();
        let forecast = r#"{"current":{"temperature_2m":31.4,"weather_code":2}}"#;
        assistant.ingest("weather", forecast, NOW).unwrap();
        assistant
            .set_place("Ahmedabad", Some(23.02), Some(72.57), "^ndq")
            .unwrap();
        assert_eq!(assistant.panels()["weather"]["city"], "Ahmedabad");
        assistant
            .set_place("Pune", Some(18.52), Some(73.86), "^ndq")
            .unwrap();
        assert!(assistant.panels()["weather"].is_null());
        assert!(!assistant.brief(NOW).weather.contains("Ahmedabad"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn local_news_metadata_and_bullets_survive_cache() {
        let (mut a, _, d) = mk();
        online(&mut a);
        a.set_region("IN").unwrap();
        let source = a
            .sources()
            .into_iter()
            .find(|s| s.id == "region-news-IN")
            .unwrap();
        let body="<rss><channel><item><title>Ahmedabad science centre opens a new exhibit</title><description>The new public science exhibition includes interactive demonstrations and hands-on learning for students.</description><link>https://example.com/ahmedabad</link></item></channel></rss>";
        a.ingest(&source.id, body, NOW).unwrap();
        assert_eq!(a.panels()["news"][0]["topic"], "country:IN");
        assert!(a.brief(NOW).news.contains('•'));
        let id = a.stored_items()["items"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["id"].as_str().unwrap().starts_with("news:"))
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        a.delete_stored(&[id]).unwrap();
        assert!(a.panels()["news"].as_array().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(d);
    }

    #[test]
    fn extended_prefetch_pool_evicts_only_old_fetched_entries() {
        let (mut a, _, d) = mk();
        let seeds = a.content.iter().filter(|i| i.fetched == 0).count();
        for n in 0..520 {
            let mut item = crate::ledger::Item::new(
                &format!("cache-{n}"),
                Family::Story,
                "test",
                &format!("Unique cached story number {n}"),
            );
            item.fetched = NOW + n;
            a.content.push(item)
        }
        a.evict();
        assert_eq!(a.count(Family::Story), 500);
        assert_eq!(a.content.iter().filter(|i| i.fetched == 0).count(), seeds);
        assert!(!a.content.iter().any(|i| i.id == "cache-0"));
        assert!(a.content.iter().any(|i| i.id == "cache-519"));
        let _ = std::fs::remove_dir_all(d);
    }
}
