// vce-core/src/ledger.rs
//! Persistent delivery history: refreshing the content cache never makes an old item fresh again.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Family {
    Joke,
    Fact,
    Story,
    Anecdote,
    Question,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub family: Family,
    pub topic: String,
    pub text: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub link: String,
    /// 0 for bundled seed items; unix seconds for fetched ones.
    #[serde(default)]
    pub fetched: u64,
}
impl Item {
    pub fn new(id: &str, family: Family, topic: &str, text: &str) -> Self {
        Item {
            id: id.into(),
            family,
            topic: topic.into(),
            text: text.into(),
            source: String::new(),
            link: String::new(),
            fetched: 0,
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct Use {
    last: u64,
    count: u32,
    liked: i32,
}

pub const ITEM_COOLDOWN: u64 = 90 * 86_400;
const RECENT: usize = 20;

#[derive(Clone, Debug)]
pub struct BreakerPolicy {
    pub idle_secs: u64,
    pub min_gap_secs: u64,
    pub max_per_hour: usize,
    pub quiet_start_h: u32,
    pub quiet_end_h: u32,
}
impl Default for BreakerPolicy {
    fn default() -> Self {
        Self {
            idle_secs: 90,
            min_gap_secs: 300,
            max_per_hour: 6,
            quiet_start_h: 22,
            quiet_end_h: 7,
        }
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Ledger {
    #[serde(default)]
    geo_turn: u64,
    #[serde(default)]
    geo_world: u64,
    #[serde(default)]
    pub geo_local_served: u64,
    #[serde(default)]
    pub geo_world_served: u64,
    #[serde(default)]
    delivered: Vec<Item>,
    used: HashMap<String, Use>,
    recent_text: VecDeque<String>,
    recent_topics: VecDeque<String>,
    last_family: Option<Family>,
    fired: VecDeque<u64>,
}

fn shingles(s: &str) -> HashSet<String> {
    let w: Vec<String> = s
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|x| !x.is_empty())
        .map(String::from)
        .collect();
    if w.len() < 3 {
        return w.into_iter().collect();
    }
    w.windows(3).map(|x| x.join(" ")).collect()
}
/// Word-trigram Jaccard overlap: catches paraphrase-lite repeats, not just exact ones.
pub fn near_duplicate(a: &str, b: &str) -> bool {
    let (x, y) = (shingles(a), shingles(b));
    if x.is_empty() || y.is_empty() {
        return false;
    }
    x.intersection(&y).count() as f32 / x.union(&y).count() as f32 >= 0.5
}
fn mix(seed: u64) -> u64 {
    let mut x = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^ (x >> 31)
}
pub(crate) fn hash(s: &str) -> u64 {
    s.bytes().fold(1469598103934665603u64, |h, b| {
        (h ^ b as u64).wrapping_mul(1099511628211)
    })
}
fn push_cap(q: &mut VecDeque<String>, s: String) {
    if q.len() >= RECENT {
        q.pop_front();
    }
    q.push_back(s);
}

impl Ledger {
    fn remember(&mut self, id: &str, text: &str, topic: Option<&str>, now: u64) {
        let u = self.used.entry(id.to_string()).or_default();
        u.last = now;
        u.count += 1;
        push_cap(&mut self.recent_text, text.to_string());
        if let Some(t) = topic {
            push_cap(&mut self.recent_topics, t.to_string());
        }
    }
    pub fn is_fresh(&self, id: &str, _now: u64) -> bool {
        self.used.get(id).map_or(true, |u| u.count == 0)
    }
    pub fn too_similar(&self, text: &str) -> bool {
        self.recent_text.iter().any(|t| near_duplicate(t, text))
            || self
                .delivered
                .iter()
                .any(|item| crate::recall::same_content(&item.text, text))
    }
    pub fn recall(&self, input: &str) -> Option<Vec<Item>> {
        let request = crate::recall::request(input)?;
        let mut matches: Vec<Item> = self
            .delivered
            .iter()
            .rev()
            .filter(|item| {
                let kind = match item.family {
                    Family::Joke => "joke",
                    Family::Story => "story",
                    Family::Anecdote => "anecdote",
                    _ => "",
                };
                kind == request.kind
                    && request
                        .words
                        .iter()
                        .all(|word| item.text.to_lowercase().contains(word))
            })
            .cloned()
            .collect();
        if request.last {
            matches.truncate(1)
        }
        Some(matches)
    }
    /// Record the user's reaction (+1 liked / -1 skipped) to bias future picks.
    pub fn react(&mut self, id: &str, delta: i32) {
        self.used.entry(id.to_string()).or_default().liked += delta;
    }

    /// Best fresh item of `fam`, or None (never a repeat). Interest match and never-used items score higher.
    pub fn pick<'a>(
        &mut self,
        pool: &'a [Item],
        fam: Family,
        interests: &[String],
        now: u64,
    ) -> Option<&'a Item> {
        let recent_topics: Vec<String> = self.recent_topics.iter().rev().take(2).cloned().collect();
        let best = pool
            .iter()
            .filter(|i| {
                i.family == fam
                    && self.is_fresh(&i.id, now)
                    && !recent_topics.contains(&i.topic)
                    && !self.too_similar(&i.text)
            })
            .max_by_key(|i| {
                let u = self.used.get(&i.id);
                let mut s = 100i64;
                if u.is_none() {
                    s += 50;
                }
                if interests
                    .iter()
                    .any(|k| k.to_lowercase().contains(&i.topic.to_lowercase()))
                {
                    s += 200;
                }
                s += u.map_or(0, |u| u.liked as i64 * 30);
                s * 1000 + (mix(now ^ hash(&i.id)) % 1000) as i64
            })?;
        self.remember(&best.id, &best.text, Some(&best.topic), now);
        self.delivered.push(best.clone());
        Some(best)
    }

    /// Three of every ten sourced regional facts are local; other slots rotate countries.
    pub fn pick_geographic(
        &mut self,
        pool: &[Item],
        fam: Family,
        local: &str,
        interests: &[String],
        now: u64,
    ) -> Option<Item> {
        let candidates: Vec<Item> = pool
            .iter()
            .filter(|i| {
                i.family == fam
                    && i.topic.starts_with("geo:")
                    && self.is_fresh(&i.id, now)
                    && !self.too_similar(&i.text)
            })
            .cloned()
            .collect();
        if candidates.is_empty() {
            return None;
        }
        let country = |i: &Item| i.topic.split(':').nth(1).unwrap_or("").to_string();
        let wants_local = [0, 3, 6].contains(&(self.geo_turn % 10));
        let mut chosen: Vec<Item> = if wants_local {
            candidates
                .iter()
                .filter(|i| country(i) == local)
                .cloned()
                .collect()
        } else {
            vec![]
        };
        if chosen.is_empty() {
            let mut countries: Vec<String> = candidates
                .iter()
                .map(country)
                .filter(|c| c != local)
                .collect();
            countries.sort();
            countries.dedup();
            if !countries.is_empty() {
                let selected = &countries[(self.geo_world as usize) % countries.len()];
                chosen = candidates
                    .iter()
                    .filter(|i| country(i) == *selected)
                    .cloned()
                    .collect();
                self.geo_world += 1
            }
        }
        if chosen.is_empty() {
            chosen = candidates
        }
        let picked = self.pick(&chosen, fam, interests, now)?.clone();
        self.geo_turn += 1;
        if country(&picked) == local {
            self.geo_local_served += 1
        } else {
            self.geo_world_served += 1
        };
        Some(picked)
    }

    /// For normal dialogue: least-recently-used variant, avoiding ones too similar to recent output.
    pub fn pick_variant(&mut self, key: &str, variants: &[String], now: u64) -> usize {
        if variants.is_empty() {
            return 0;
        }
        let idx = (0..variants.len())
            .min_by_key(|&i| {
                let u = self.used.get(&format!("{key}#{i}"));
                (
                    self.too_similar(&variants[i]) as u8,
                    u.map_or(0, |u| u.last),
                    i,
                )
            })
            .unwrap_or(0);
        let text = variants[idx].clone();
        self.remember(&format!("{key}#{idx}"), &text, None, now);
        idx
    }

    /// Self-initiated chatter. Respects idle time, quiet hours, spacing and an hourly cap; rotates families.
    /// Returns None when nothing fresh exists: silence beats repetition.
    pub fn silence_breaker<'a>(
        &mut self,
        pol: &BreakerPolicy,
        pool: &'a [Item],
        fams: &[Family],
        interests: &[String],
        now: u64,
        idle: u64,
        local_hour: u32,
    ) -> Option<&'a Item> {
        self.silence_breaker_regional(pol, pool, fams, interests, now, idle, local_hour, None)
    }
    pub fn silence_breaker_regional<'a>(
        &mut self,
        pol: &BreakerPolicy,
        pool: &'a [Item],
        fams: &[Family],
        interests: &[String],
        now: u64,
        idle: u64,
        local_hour: u32,
        region: Option<&str>,
    ) -> Option<&'a Item> {
        if idle < pol.idle_secs || pol.max_per_hour == 0 {
            return None;
        }
        let quiet = if pol.quiet_start_h > pol.quiet_end_h {
            local_hour >= pol.quiet_start_h || local_hour < pol.quiet_end_h
        } else {
            local_hour >= pol.quiet_start_h && local_hour < pol.quiet_end_h
        };
        if quiet {
            return None;
        }
        while self
            .fired
            .front()
            .map_or(false, |&t| now.saturating_sub(t) > 3600)
        {
            self.fired.pop_front();
        }
        if self.fired.len() >= pol.max_per_hour
            || self
                .fired
                .back()
                .map_or(false, |&t| now.saturating_sub(t) < pol.min_gap_secs)
        {
            return None;
        }
        let start = fams
            .iter()
            .position(|f| Some(*f) == self.last_family)
            .map_or(0, |p| p + 1);
        for k in 0..fams.len() {
            let f = fams[(start + k) % fams.len()];
            if f == Family::Fact {
                if let Some(local) = region {
                    if let Some(it) = self.pick_geographic(pool, f, local, interests, now) {
                        self.last_family = Some(f);
                        self.fired.push_back(now);
                        return pool.iter().find(|i| i.id == it.id);
                    }
                }
            }
            if let Some(it) = self.pick(pool, f, interests, now) {
                self.last_family = Some(f);
                self.fired.push_back(now);
                return Some(it);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pool(n: usize, fam: Family) -> Vec<Item> {
        (0..n)
            .map(|i| {
                Item::new(
                    &format!("{fam:?}{i}"),
                    fam,
                    &format!("t{i}"),
                    &format!("alpha{i} beta{i} gamma{i} delta{i}"),
                )
            })
            .collect()
    }
    #[test]
    fn never_repeats_then_goes_quiet() {
        let (p, mut l) = (pool(10, Family::Joke), Ledger::default());
        let mut seen = HashSet::new();
        for t in 0..10 {
            let it = l
                .pick(&p, Family::Joke, &[], 1000 + t)
                .expect("fresh item available");
            assert!(seen.insert(it.id.clone()), "repeat!");
        }
        assert!(
            l.pick(&p, Family::Joke, &[], 2000).is_none(),
            "exhausted pool must yield None, not a repeat"
        );
    }
    #[test]
    fn item_returns_after_cooldown() {
        let (p, mut l) = (pool(1, Family::Fact), Ledger::default());
        assert!(l.pick(&p, Family::Fact, &[], 0).is_some());
        assert!(l.pick(&p, Family::Fact, &[], 80 * 86_400).is_none());
        assert!(l.pick(&p, Family::Fact, &[], 91 * 86_400).is_none());
    }
    #[test]
    fn interests_win_and_topic_streaks_are_avoided() {
        let mut p = pool(4, Family::Fact);
        p[2].topic = "space".into();
        p[3].topic = "space".into();
        let mut l = Ledger::default();
        let first = l
            .pick(&p, Family::Fact, &["I love space".to_string()], 1)
            .unwrap()
            .topic
            .clone();
        assert_eq!(first, "space");
        let second = l
            .pick(&p, Family::Fact, &["I love space".to_string()], 2)
            .unwrap()
            .topic
            .clone();
        assert_ne!(second, "space", "same topic twice in a row is avoided");
    }
    #[test]
    fn variants_cycle_without_back_to_back_repeats() {
        let v: Vec<String> = [
            "Hello there, friend of mine",
            "Hey you, lovely to see you",
            "Greetings and good cheer today",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let mut l = Ledger::default();
        let seq: Vec<usize> = (0..6).map(|t| l.pick_variant("hi", &v, t)).collect();
        for w in seq.windows(2) {
            assert_ne!(w[0], w[1]);
        }
        for i in 0..3 {
            assert_eq!(seq.iter().filter(|&&x| x == i).count(), 2);
        }
    }
    #[test]
    fn near_duplicate_text_is_blocked() {
        let mut p = pool(1, Family::Joke);
        p.push(Item::new(
            "dup",
            Family::Joke,
            "z",
            "alpha0 beta0 gamma0 delta0 extra",
        ));
        let mut l = Ledger::default();
        assert!(l.pick(&p[..1], Family::Joke, &[], 1).is_some());
        assert!(
            l.pick(&p[1..], Family::Joke, &[], 2).is_none(),
            "paraphrase-lite of a recent item is rejected"
        );
    }
    #[test]
    fn silence_breaker_obeys_policy() {
        let p = pool(6, Family::Joke);
        let pol = BreakerPolicy {
            max_per_hour: 2,
            min_gap_secs: 10,
            ..Default::default()
        };
        let mut l = Ledger::default();
        let f = [Family::Joke];
        assert!(
            l.silence_breaker(&pol, &p, &f, &[], 100, 10, 12).is_none(),
            "not idle long enough"
        );
        assert!(
            l.silence_breaker(&pol, &p, &f, &[], 100, 200, 23).is_none(),
            "quiet hours"
        );
        assert!(l.silence_breaker(&pol, &p, &f, &[], 100, 200, 12).is_some());
        assert!(
            l.silence_breaker(&pol, &p, &f, &[], 105, 200, 12).is_none(),
            "min gap"
        );
        assert!(l.silence_breaker(&pol, &p, &f, &[], 200, 200, 12).is_some());
        assert!(
            l.silence_breaker(&pol, &p, &f, &[], 400, 200, 12).is_none(),
            "hourly cap"
        );
    }
    #[test]
    fn regional_quota_and_country_rotation_are_measured() {
        let mut pool = vec![];
        for country in ["IN", "US", "JP", "FR", "BR"] {
            for i in 0..12 {
                pool.push(Item::new(
                    &format!("{country}{i}"),
                    Family::Fact,
                    &format!("geo:{country}:{i}"),
                    &format!("{country}{i} alpha{country}{i} beta{country}{i} gamma{country}{i}"),
                ))
            }
        }
        let mut l = Ledger::default();
        let mut countries = vec![];
        for i in 0..10 {
            countries.push(
                l.pick_geographic(&pool, Family::Fact, "IN", &[], 1000 + i)
                    .unwrap()
                    .topic
                    .split(':')
                    .nth(1)
                    .unwrap()
                    .to_string(),
            )
        }
        assert_eq!(countries.iter().filter(|c| c.as_str() == "IN").count(), 3);
        assert_eq!(l.geo_local_served, 3);
        assert_eq!(l.geo_world_served, 7);
        let world: Vec<_> = countries.iter().filter(|c| c.as_str() != "IN").collect();
        assert!(world.windows(2).all(|w| w[0] != w[1]));
    }
}

#[cfg(test)]
mod persistent_delivery_tests {
    use super::*;
    #[test]
    fn old_items_stay_used_after_serialisation_and_cache_rotation() {
        let story = Item::new(
            "kite",
            Family::Story,
            "flight",
            "A careful child repaired a kite and watched it rise above the village.",
        );
        let mut ledger = Ledger::default();
        assert!(ledger
            .pick(&[story.clone()], Family::Story, &[], 100)
            .is_some());
        let bytes = serde_json::to_vec(&ledger).unwrap();
        let mut restored: Ledger = serde_json::from_slice(&bytes).unwrap();
        assert!(restored
            .pick(&[story.clone()], Family::Story, &[], 100 + 366 * 86400)
            .is_none());
        restored.recent_text.clear();
        let mut reprint = story.clone();
        reprint.id = "another-publisher".into();
        assert!(restored
            .pick(&[reprint], Family::Story, &[], 100 + 400 * 86400)
            .is_none());
        let recalled = restored.recall("recall the story about the kite").unwrap();
        assert_eq!(recalled.len(), 1);
        assert_eq!(recalled[0].text, story.text);
    }
}
