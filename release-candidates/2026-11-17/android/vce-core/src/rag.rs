// vce-core/src/rag.rs
//! Offline knowledge search (BM25 over stored items) and question-topic extraction. No model needed.
use crate::ledger::Item;
use std::collections::{HashMap, HashSet};

const STOP: &[&str] = &[
    "the", "a", "an", "is", "are", "was", "were", "of", "to", "in", "on", "and", "or", "for",
    "what", "who", "why", "how", "does", "do", "did", "tell", "me", "about", "it", "its", "this",
    "that", "with", "as", "by", "at", "be", "explain", "define", "where", "when",
];

/// Light plural stemming so "octopuses" matches "octopus" and "hearts" matches "heart".
fn stem(w: &str) -> String {
    let n = w.chars().count();
    if n > 4 && w.ends_with("ies") {
        return format!("{}y", &w[..w.len() - 3]);
    }
    if n > 4
        && (w.ends_with("ses") || w.ends_with("xes") || w.ends_with("ches") || w.ends_with("shes"))
    {
        return w[..w.len() - 2].to_string();
    }
    if n > 3 && w.ends_with('s') && !w.ends_with("ss") && !w.ends_with("us") {
        return w[..w.len() - 1].to_string();
    }
    w.to_string()
}

fn toks(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty() && !STOP.contains(w))
        .map(stem)
        .collect()
}

/// Best matches with a confidence floor: at least min(2, query terms) distinct terms must match.
pub fn search<'a>(items: &'a [Item], query: &str, k: usize) -> Vec<(&'a Item, f32)> {
    let q: HashSet<String> = toks(query).into_iter().collect();
    if q.is_empty() || items.is_empty() {
        return vec![];
    }
    let docs: Vec<Vec<String>> = items
        .iter()
        .map(|i| toks(&format!("{} {} {}", i.topic, i.topic, i.text)))
        .collect();
    let n = docs.len() as f32;
    let avg = docs.iter().map(|d| d.len()).sum::<usize>() as f32 / n;
    let mut df: HashMap<&str, f32> = HashMap::new();
    for d in &docs {
        let set: HashSet<&str> = d.iter().map(|s| s.as_str()).collect();
        for t in &q {
            if set.contains(t.as_str()) {
                *df.entry(t.as_str()).or_default() += 1.0;
            }
        }
    }
    let need = q.len().min(2);
    let mut out: Vec<(&Item, f32)> = vec![];
    for (i, d) in docs.iter().enumerate() {
        let (mut score, mut matched) = (0f32, 0);
        for t in &q {
            let tf = d.iter().filter(|x| *x == t).count() as f32;
            if tf == 0.0 {
                continue;
            }
            matched += 1;
            let dfv = df.get(t.as_str()).copied().unwrap_or(0.0);
            let idf = ((n - dfv + 0.5) / (dfv + 0.5) + 1.0).ln();
            score += idf * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * d.len() as f32 / avg));
        }
        if matched >= need && score > 0.0 {
            out.push((&items[i], score));
        }
    }
    out.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    out.truncate(k);
    out
}

const PREFIXES: &[&str] = &[
    "what is ",
    "what are ",
    "what's ",
    "who is ",
    "who was ",
    "who are ",
    "tell me about ",
    "tell me something about ",
    "explain ",
    "define ",
    "where is ",
    "what was ",
];

/// "What is the Eiffel Tower?" -> "eiffel tower". None if it is not an information question.
pub fn info_topic(text: &str) -> Option<String> {
    let t = text.to_lowercase().replace('\u{2019}', "'");
    let t = t
        .trim()
        .trim_end_matches(|c| "?.! ".contains(c))
        .to_string();
    let rest = PREFIXES.iter().find_map(|p| t.strip_prefix(p))?;
    let rest = ["the ", "a ", "an "]
        .iter()
        .fold(rest, |r, a| r.strip_prefix(a).unwrap_or(r))
        .trim();
    let bad = rest.is_empty()
        || rest.split_whitespace().count() > 8
        || rest.starts_with("you")
        || rest.starts_with("your")
        || rest == "it"
        || rest == "this"
        || rest == "that";
    if bad {
        None
    } else {
        Some(rest.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ledger::Item;
    fn it(id: &str, topic: &str, text: &str) -> Item {
        Item::new(id, crate::ledger::Family::Fact, topic, text)
    }
    #[test]
    fn finds_relevant_and_rejects_unrelated() {
        let v = vec![
            it(
                "1",
                "animals",
                "Octopuses have three hearts and blue blood.",
            ),
            it(
                "2",
                "space",
                "A day on Venus is longer than a year on Venus.",
            ),
            it("3", "food", "Honey never spoils."),
        ];
        assert_eq!(search(&v, "octopus hearts", 1)[0].0.id, "1");
        assert_eq!(search(&v, "venus day", 1)[0].0.id, "2");
        assert!(search(&v, "quantum computing", 1).is_empty());
    }
    #[test]
    fn topic_extraction() {
        assert_eq!(
            info_topic("What is the Eiffel Tower?").as_deref(),
            Some("eiffel tower")
        );
        assert_eq!(
            info_topic("Tell me about Albert Einstein").as_deref(),
            Some("albert einstein")
        );
        assert_eq!(info_topic("who are you"), None);
        assert_eq!(info_topic("what is your name"), None);
        assert_eq!(info_topic("remind me to call mom"), None);
    }
}
