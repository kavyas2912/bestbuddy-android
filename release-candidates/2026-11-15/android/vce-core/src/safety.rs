// vce-core/src/safety.rs
//! Text hygiene plus a conservative cheerfulness filter for fetched chatter content (jokes, facts, anecdotes).
use std::collections::HashSet;

const BLOCK: &[&str] = &[
    "kill",
    "killed",
    "kills",
    "killing",
    "killer",
    "murder",
    "murdered",
    "massacre",
    "suicide",
    "genocide",
    "assassinated",
    "assassination",
    "terrorist",
    "terrorism",
    "bombing",
    "bombed",
    "bomb",
    "dead",
    "died",
    "death",
    "deaths",
    "sex",
    "sexual",
    "rape",
    "raped",
    "porn",
    "nude",
    "shit",
    "fuck",
    "fucking",
    "bitch",
    "slut",
    "whore",
    "shot",
    "shooting",
];

fn unescape(s: &str) -> String {
    let mut t = s
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ");
    while let Some(i) = t.find("&#") {
        let rest = &t[i + 2..];
        let Some(j) = rest.find(';') else { break };
        let code = &rest[..j];
        let n = if let Some(h) = code.strip_prefix('x').or_else(|| code.strip_prefix('X')) {
            u32::from_str_radix(h, 16).ok()
        } else {
            code.parse::<u32>().ok()
        };
        let ch = n.and_then(char::from_u32).unwrap_or(' ');
        t = format!("{}{}{}", &t[..i], ch, &rest[j + 1..]);
    }
    t
}

/// Strips CDATA wrappers and HTML tags, decodes entities, collapses whitespace.
pub fn clean_text(s: &str) -> String {
    let s = unescape(&s.replace("<![CDATA[", "").replace("]]>", ""));
    let c: Vec<char> = s.chars().collect();
    let (mut out, mut intag) = (String::with_capacity(s.len()), false);
    for (i, &ch) in c.iter().enumerate() {
        if !intag
            && ch == '<'
            && c.get(i + 1)
                .map_or(false, |n| n.is_alphabetic() || *n == '/' || *n == '!')
        {
            intag = true;
            continue;
        }
        if intag {
            if ch == '>' {
                intag = false;
                out.push(' ');
            }
            continue;
        }
        out.push(ch);
    }
    unescape(&out)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Length bounds plus a block list: keeps Buddy's unprompted chatter light. Direct answers to user questions skip this.
pub fn acceptable(text: &str) -> bool {
    let n = text.chars().count();
    if !(20..=500).contains(&n) {
        return false;
    }
    let toks: HashSet<String> = text
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(String::from)
        .collect();
    !BLOCK.iter().any(|b| toks.contains(*b))
}

/// First `n` sentences, at most `max` characters.
pub fn first_sentences(s: &str, n: usize, max: usize) -> String {
    let (mut out, mut count) = (String::new(), 0);
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        out.push(c);
        if matches!(c, '.' | '!' | '?')
            && chars.get(i + 1).map_or(true, |x| x.is_whitespace())
            && out.chars().count() > 25
        {
            count += 1;
            if count >= n {
                break;
            }
        }
        if out.chars().count() >= max {
            break;
        }
    }
    let mut t = out.trim().to_string();
    if t.chars().count() >= max && !t.ends_with(['.', '!', '?']) {
        t.push('…');
    }
    t
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cleans_markup_and_entities() {
        assert_eq!(
            clean_text("<![CDATA[<p>Tom &amp; Jerry&#8217;s <b>day</b></p>]]>"),
            "Tom & Jerry\u{2019}s day"
        );
        assert_eq!(clean_text("a < b and c"), "a < b and c");
    }
    #[test]
    fn filter_is_word_based_not_substring() {
        assert!(acceptable("A day on Venus is longer than its year."));
        assert!(acceptable("Sussex grapes are a pleasant county product."));
        assert!(!acceptable("He was killed in a faraway city long ago."));
        assert!(!acceptable("Too short"));
    }
    #[test]
    fn sentence_trim() {
        let s = first_sentences(
            "Albert Einstein was a physicist. He developed relativity. He won a Nobel Prize.",
            2,
            400,
        );
        assert_eq!(
            s,
            "Albert Einstein was a physicist. He developed relativity."
        );
    }
}
