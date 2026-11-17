// vce-core/src/learn.rs
//! Rule-based understanding (v0.5): likes/dislikes, sentiment, reminders. Everything inferred is a guess the user can edit.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FactKind {
    Like,
    Dislike,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fact {
    pub kind: FactKind,
    pub value: String,
    pub ts: u64,
    pub confirmed: Option<bool>,
}

const LIKE: [&str; 6] = [
    "i like ",
    "i love ",
    "i enjoy ",
    "i am into ",
    "i'm into ",
    "i really like ",
];
const DISLIKE: [&str; 4] = ["i dislike ", "i hate ", "i don't like ", "i do not like "];
/// Conservative guard: never auto-store topics that look health, religion, politics or money related.
const SENSITIVE: [&str; 14] = [
    "cancer", "diabetes", "disease", "depress", "religio", "church", "temple", "mosque", "politic",
    "party", "vote", "salary", "debt", "loan",
];

fn clean(text: &str) -> String {
    text.to_lowercase()
        .replace('\u{2019}', "'")
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '\'')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn extract(text: &str, ts: u64) -> Vec<Fact> {
    let t = clean(text);
    let mut out = vec![];
    for (set, kind) in [
        (&DISLIKE[..], FactKind::Dislike),
        (&LIKE[..], FactKind::Like),
    ] {
        for p in set {
            if let Some(pos) = t.find(p) {
                let rest = &t[pos + p.len()..];
                let words: Vec<&str> = rest
                    .split_whitespace()
                    .take_while(|w| !["but", "because", "and", "so", "when"].contains(w))
                    .take(5)
                    .collect();
                let value = words.join(" ");
                let value = value.trim_start_matches("to ").to_string();
                if value.is_empty() || SENSITIVE.iter().any(|s| value.contains(s)) {
                    continue;
                }
                out.push(Fact {
                    kind,
                    value,
                    ts,
                    confirmed: None,
                });
                break;
            }
        }
    }
    out
}

const POS: [&str; 12] = [
    "happy",
    "great",
    "good",
    "love",
    "wonderful",
    "excited",
    "glad",
    "fun",
    "awesome",
    "nice",
    "better",
    "grateful",
];
const NEG: [&str; 12] = [
    "sad", "tired", "bad", "angry", "lonely", "upset", "worried", "awful", "terrible", "hate",
    "sick", "anxious",
];
/// Tiny lexicon score with simple negation. A hint for tone only, never a diagnosis.
pub fn sentiment(text: &str) -> i32 {
    let w: Vec<String> = clean(text).split_whitespace().map(String::from).collect();
    let mut s = 0;
    for (i, x) in w.iter().enumerate() {
        let neg = i > 0 && ["not", "never", "no"].contains(&w[i - 1].as_str());
        let v = if POS.contains(&x.as_str()) {
            1
        } else if NEG.contains(&x.as_str()) {
            -1
        } else {
            0
        };
        s += if neg { -v } else { v };
    }
    s
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Reminder {
    pub id: u32,
    pub text: String,
    pub due: u64,
    pub done: bool,
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct ReminderBook {
    pub items: Vec<Reminder>,
    next: u32,
}
impl ReminderBook {
    pub fn add(&mut self, text: String, due: u64) -> u32 {
        self.next += 1;
        self.items.push(Reminder {
            id: self.next,
            text,
            due,
            done: false,
        });
        self.next
    }
    pub fn due(&self, now: u64) -> Vec<&Reminder> {
        self.items
            .iter()
            .filter(|r| !r.done && r.due <= now)
            .collect()
    }
    pub fn complete(&mut self, id: u32) {
        for r in self.items.iter_mut().filter(|r| r.id == id) {
            r.done = true;
        }
    }
}

fn clock(s: &str) -> Option<i64> {
    let s = s.trim();
    let (num, ampm) = if let Some(x) = s.strip_suffix("pm") {
        (x.trim(), Some(true))
    } else if let Some(x) = s.strip_suffix("am") {
        (x.trim(), Some(false))
    } else {
        (s, None)
    };
    let (h, m) = match num.split_once(':') {
        Some((h, m)) => (h.trim().parse::<i64>().ok()?, m.trim().parse::<i64>().ok()?),
        None => (num.parse::<i64>().ok()?, 0),
    };
    let h = match ampm {
        Some(pm) => {
            if !(1..=12).contains(&h) {
                return None;
            }
            (h % 12) + if pm { 12 } else { 0 }
        }
        None => h,
    };
    if h > 23 || m > 59 {
        return None;
    }
    Some(h * 3600 + m * 60)
}

/// "remind me to X in 10 minutes | at 5 pm | tomorrow at 6:30 pm" -> (X, due unix secs). `off` = local UTC offset in seconds.
pub fn parse_reminder(text: &str, now: u64, off: i64) -> Option<(String, u64)> {
    let t = text.to_lowercase().replace('\u{2019}', "'");
    let t = t.trim().trim_end_matches(|c| ".!?".contains(c)).to_string();
    let body = &t[t.find("remind me to ")? + "remind me to ".len()..];
    let local = now as i64 + off;
    let day0 = local - local.rem_euclid(86_400);
    if let Some(p) = body.rfind(" in ") {
        let parts: Vec<&str> = body[p + 4..].split_whitespace().collect();
        if parts.len() == 2 {
            if let Ok(n) = parts[0].parse::<u64>() {
                let unit = if parts[1].starts_with("min") {
                    60
                } else if parts[1].starts_with("hour") || parts[1].starts_with("hr") {
                    3600
                } else if parts[1].starts_with("day") {
                    86_400
                } else {
                    0
                };
                if unit > 0 && !body[..p].trim().is_empty() {
                    return Some((body[..p].trim().to_string(), now + n * unit));
                }
            }
        }
    }
    for (marker, tomorrow) in [(" tomorrow at ", true), (" at ", false)] {
        if let Some(p) = body.rfind(marker) {
            if let Some(secs) = clock(&body[p + marker.len()..]) {
                let what = body[..p].trim();
                if what.is_empty() {
                    return None;
                }
                let mut due = day0 + secs + if tomorrow { 86_400 } else { 0 } - off;
                if !tomorrow && due <= now as i64 {
                    due += 86_400;
                }
                return Some((what.to_string(), due as u64));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    const NOW: u64 = 1_700_000_000; // local (+5:30) time of day = 03:43:20
    const IST: i64 = 19_800;
    #[test]
    fn likes_dislikes_and_sensitive_guard() {
        let f = extract("Well, I really like old Hindi songs but I hate traffic.", 5);
        assert!(f
            .iter()
            .any(|x| x.kind == FactKind::Like && x.value == "old hindi songs"));
        assert!(f
            .iter()
            .any(|x| x.kind == FactKind::Dislike && x.value == "traffic"));
        assert!(extract("I love my religion", 1).is_empty());
        assert!(extract("I don't like politics", 1).is_empty());
    }
    #[test]
    fn sentiment_basic() {
        assert!(sentiment("I am so happy today") > 0);
        assert!(sentiment("this is not good") < 0);
        assert!(sentiment("I feel sad and tired") <= -2);
    }
    #[test]
    fn reminder_relative_and_clock_times() {
        assert_eq!(
            parse_reminder("Remind me to call mom in 10 minutes", NOW, IST),
            Some(("call mom".into(), NOW + 600))
        );
        assert_eq!(
            parse_reminder("remind me to take a walk tomorrow at 6 pm", NOW, IST)
                .unwrap()
                .1,
            NOW + 137_800
        );
        assert_eq!(
            parse_reminder("remind me to water plants at 5 pm.", NOW, IST)
                .unwrap()
                .1,
            NOW + 47_800
        );
        assert_eq!(
            parse_reminder("remind me to sleep at 3 am", NOW, IST)
                .unwrap()
                .1,
            NOW + 83_800,
            "already past today -> tomorrow"
        );
        assert!(parse_reminder("remind me to nothing at banana", NOW, IST).is_none());
    }
}
