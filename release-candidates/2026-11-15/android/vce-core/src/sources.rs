// vce-core/src/sources.rs
//! Source registry + parsers + fetch planning. The core never does network I/O: it says what to fetch
//! (`plan`), the shell fetches, and the body comes back through `parse`. Fully testable offline.
use crate::ledger::{hash, Family, Item};
use crate::safety::{acceptable, clean_text, first_sentences};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const SEED_SOURCES: &str = include_str!("../seed/sources.json");

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    JokeApi,
    OfficialJoke,
    RandomFact,
    GutenbergStories,
    WikiOtd,
    WikiFeatured,
    Rss,
    RssNews,
    Weather,
    Markets,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Source {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub family: Family,
    pub topic: String,
    pub url: String,
    pub attribution: String,
    pub per_fetch: usize,
    pub every_secs: u64,
    pub enabled: bool,
    #[serde(default)]
    pub user_added: bool,
    #[serde(default)]
    pub fails: u32,
    #[serde(default)]
    pub next_due: u64,
    #[serde(default)]
    pub last_ok: u64,
    #[serde(default)]
    pub last_error: String,
    #[serde(default)]
    pub total: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Place {
    pub city: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub symbols: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct FetchReq {
    pub id: String,
    pub url: String,
}

#[derive(Debug)]
pub enum Parsed {
    Items(Vec<Item>),
    Brief(String),
}

#[derive(Clone, Debug)]
pub struct Lookup {
    pub title: String,
    pub summary: String,
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Registry {
    pub sources: Vec<Source>,
    pub place: Place,
}

pub fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// (year, month, day) from days since 1970-01-01 (civil-from-days).
fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (yoe + era * 400 + if m <= 2 { 1 } else { 0 }, m, d)
}

fn wmo(code: i64) -> &'static str {
    match code {
        0 => "clear sky",
        1 | 2 => "partly cloudy",
        3 => "overcast",
        45 | 48 => "foggy",
        51..=57 => "drizzle",
        61..=67 | 80..=82 => "rain",
        71..=77 | 85 | 86 => "snow",
        95..=99 => "thunderstorms",
        _ => "mixed conditions",
    }
}
fn mkt_name(sym: &str) -> String {
    match sym.to_lowercase().as_str() {
        "^spx" => "S&P 500".into(),
        "^ndq" => "Nasdaq 100".into(),
        "^dji" => "Dow Jones".into(),
        o => o.to_uppercase(),
    }
}

fn tag(s: &str, name: &str) -> Option<String> {
    let i = s
        .find(&format!("<{name}>"))
        .or_else(|| s.find(&format!("<{name} ")))?;
    let rest = &s[i..];
    let after = &rest[rest.find('>')? + 1..];
    Some(after[..after.find(&format!("</{name}>"))?].to_string())
}

/// Feed summaries only: no invented article bodies, urgency or popularity scores.
pub fn news_articles(body: &str, source: &str) -> Vec<Value> {
    let mut out: Vec<Value> = vec![];
    for chunk in body.split("<item").skip(1).take(100) {
        let title = clean_text(&tag(chunk, "title").unwrap_or_default());
        let summary = clean_text(
            &tag(chunk, "content:encoded")
                .filter(|v| !clean_text(v).is_empty())
                .or_else(|| tag(chunk, "description"))
                .unwrap_or_default(),
        );
        let link = clean_text(&tag(chunk, "link").unwrap_or_default());
        let words = title.to_lowercase();
        if title.chars().count() < 12
            || summary.chars().count() < 45
            || summary.eq_ignore_ascii_case(&title)
            || crate::ledger::near_duplicate(&summary, &title)
            || !link.starts_with("https://")
            || [
                "latest news",
                "breaking news",
                "national news",
                "international news",
            ]
            .contains(&words.trim())
        {
            continue;
        }
        if out.iter().any(|v| {
            v["link"] == link
                || crate::ledger::near_duplicate(v["title"].as_str().unwrap_or(""), &title)
        }) {
            continue;
        }
        let breaking = words.starts_with("breaking:") || words.starts_with("breaking -");
        out.push(serde_json::json!({"title":title,"summary":first_sentences(&summary,4,1100),"link":link,"source":source,"published":clean_text(&tag(chunk,"pubDate").unwrap_or_default()),"breaking":breaking}));
    }
    out
}

pub fn lookup_url(topic: &str) -> String {
    format!("https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={}&gsrlimit=1&prop=extracts%7Cinfo&exintro=1&explaintext=1&exsentences=3&inprop=url&redirects=1&format=json&formatversion=2", urlenc(topic))
}
pub fn parse_lookup(body: &str) -> Option<Lookup> {
    let v: Value = serde_json::from_str(body).ok()?;
    let p = &v["query"]["pages"][0];
    let extract = p["extract"].as_str()?.trim();
    if extract.is_empty() || extract.contains("may refer to") {
        return None;
    }
    Some(Lookup {
        title: p["title"].as_str()?.to_string(),
        summary: first_sentences(extract, 3, 420),
        url: p["fullurl"].as_str().unwrap_or("").to_string(),
    })
}

impl Registry {
    pub fn seeded() -> Self {
        Registry {
            sources: serde_json::from_str(SEED_SOURCES).expect("seed/sources.json is valid"),
            place: Place {
                symbols: "^spx,^ndq".into(),
                ..Default::default()
            },
        }
    }
    /// After an app update, adds any newly bundled sources without touching the user's settings.
    pub fn merge_seed(&mut self) {
        // Upgrade only our exact built-in forecast endpoint, preserving source toggles and user URLs.
        for source in &mut self.sources {
            if source.id == "weather"
                && !source.user_added
                && source
                    .url
                    .starts_with("https://api.open-meteo.com/v1/forecast?")
                && source.url.ends_with("&timezone=auto&forecast_days=1")
            {
                source.url = source
                    .url
                    .replace(
                        "temperature_2m_min&timezone",
                        "temperature_2m_min,weather_code&timezone",
                    )
                    .replace("forecast_days=1", "forecast_days=5");
            }
        }
        for source in &mut self.sources {
            if source.id == "markets"
                && !source.user_added
                && source.url.starts_with("https://stooq.com/")
            {
                source.url="https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d".into();
                source.attribution = "Yahoo Finance".into();
                source.name = "Markets (Yahoo Finance)".into();
                source.next_due = 0;
            }
        }
        // Repair the old bundled joke endpoint without overwriting a user's enabled/disabled choice.
        for source in &mut self.sources {
            if source.id == "jokeapi"
                && !source.user_added
                && source.url == "https://v2.jokeapi.dev/joke/Any?safe-mode&type=single&amount=5"
            {
                source.url = "https://v2.jokeapi.dev/joke/Any?safe-mode&amount=10".into();
                source.per_fetch = 10;
                source.next_due = 0;
            }
        }
        for s in Registry::seeded().sources {
            if !self.sources.iter().any(|x| x.id == s.id) {
                self.sources.push(s);
            }
        }
    }
    fn fill(&self, url: &str, now: u64, off: i64, sym: Option<&str>) -> String {
        let (y, m, d) = civil((now as i64 + off).div_euclid(86_400));
        url.replace("{yyyy}", &format!("{y:04}"))
            .replace("{mm}", &format!("{m:02}"))
            .replace("{dd}", &format!("{d:02}"))
            .replace("{lat}", &format!("{:.4}", self.place.lat.unwrap_or(0.0)))
            .replace("{lon}", &format!("{:.4}", self.place.lon.unwrap_or(0.0)))
            .replace(
                "{symbol}",
                &urlenc(match sym.unwrap_or("") {
                    "^spx" => "^GSPC",
                    "^ndq" => "^NDX",
                    "^dji" => "^DJI",
                    other => other,
                }),
            )
    }
    /// What the shell should fetch now. `count(family)` = current stock; item sources pause at `max_stock`.
    pub fn plan(
        &self,
        now: u64,
        off: i64,
        _count: &dyn Fn(Family) -> usize,
        _max_stock: usize,
    ) -> Vec<FetchReq> {
        let mut out = vec![];
        for s in self
            .sources
            .iter()
            .filter(|s| s.enabled && s.next_due <= now)
        {
            match s.kind {
                Kind::Weather => {
                    if self.place.lat.is_some() && self.place.lon.is_some() {
                        out.push(FetchReq {
                            id: s.id.clone(),
                            url: self.fill(&s.url, now, off, None),
                        });
                    }
                }
                Kind::Markets => {
                    for sym in self
                        .place
                        .symbols
                        .split(',')
                        .map(str::trim)
                        .filter(|x| !x.is_empty())
                    {
                        out.push(FetchReq {
                            id: format!("{}#{}", s.id, sym),
                            url: self.fill(&s.url, now, off, Some(sym)),
                        });
                    }
                }
                Kind::RssNews => out.push(FetchReq {
                    id: s.id.clone(),
                    url: s.url.clone(),
                }),
                _ => {
                    out.push(FetchReq {
                        id: s.id.clone(),
                        url: self.fill(&s.url, now, off, None),
                    });
                }
            }
        }
        out
    }
    fn find_mut(&mut self, id: &str) -> Option<&mut Source> {
        let base = id.split('#').next().unwrap_or(id).to_string();
        self.sources.iter_mut().find(|s| s.id == base)
    }
    pub fn mark_ok(&mut self, id: &str, now: u64, added: usize) {
        if let Some(s) = self.find_mut(id) {
            s.fails = 0;
            s.last_error.clear();
            s.last_ok = now;
            s.next_due = now + s.every_secs;
            s.total += added as u32;
        }
    }
    pub fn error(&mut self, id: &str, message: &str) {
        if let Some(s) = self.find_mut(id) {
            s.last_error = message.chars().take(160).collect()
        }
    }
    /// Exponential backoff (5 min doubling), capped at 4x the normal interval.
    pub fn mark_fail(&mut self, id: &str, now: u64) {
        if let Some(s) = self.find_mut(id) {
            s.fails += 1;
            s.next_due = now + (300u64 << s.fails.min(6)).min(s.every_secs.max(300) * 4);
        }
    }

    pub fn parse(&self, src: &Source, id: &str, body: &str, now: u64) -> Result<Parsed, String> {
        let mk = |key: &str, text: String, link: String| Item {
            id: format!("{}:{:x}", src.id, hash(key)),
            family: src.family,
            topic: src.topic.clone(),
            text,
            source: src.attribution.clone(),
            link,
            fetched: now,
        };
        let keep = |t: &str| acceptable(t);
        let mut items = vec![];
        match src.kind {
            Kind::OfficialJoke => {
                let list: Vec<Value> = serde_json::from_str(body).map_err(|e| e.to_string())?;
                for j in list {
                    let text = format!(
                        "{} {}",
                        j["setup"].as_str().unwrap_or(""),
                        j["punchline"].as_str().unwrap_or("")
                    );
                    if keep(&text) {
                        items.push(mk(&text, text.clone(), src.url.clone()))
                    }
                }
            }
            Kind::RandomFact => {
                let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                let text = clean_text(v["text"].as_str().ok_or("No fact text")?);
                if keep(&text) {
                    items.push(mk(
                        &text,
                        text.clone(),
                        v["source_url"].as_str().unwrap_or(&src.url).into(),
                    ))
                }
            }
            Kind::GutenbergStories => {
                let normalized = body.replace("\r\n", "\n");
                let main = normalized.split("*** END OF").next().unwrap_or("");
                for block in main.split("\n\n\n\n\n\n\n\n") {
                    let text = clean_text(block);
                    let mut parts = block.trim().splitn(2, "\n\n\n\n");
                    let title = parts.next().unwrap_or("").trim();
                    let story = parts.next().unwrap_or("");
                    if title.len() > 4 && title.len() < 90 && !story.is_empty() && keep(&text) {
                        items.push(mk(
                            &text,
                            text.clone(),
                            "https://www.gutenberg.org/ebooks/21".into(),
                        ))
                    }
                }
                if !items.is_empty() {
                    let n = (now / 3600) as usize % items.len();
                    items.rotate_left(n)
                }
            }
            Kind::JokeApi => {
                let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                if v["error"].as_bool() == Some(true) {
                    return Err("api reported an error".into());
                }
                let list: Vec<&Value> = v["jokes"]
                    .as_array()
                    .map(|a| a.iter().collect())
                    .unwrap_or_else(|| vec![&v]);
                for j in list {
                    let t = if let Some(s) = j["joke"].as_str() {
                        s.to_string()
                    } else if let (Some(a), Some(b)) = (j["setup"].as_str(), j["delivery"].as_str())
                    {
                        format!("{a} {b}")
                    } else {
                        continue;
                    };
                    let t = clean_text(&t);
                    if keep(&t) {
                        items.push(mk(&t, t.clone(), String::new()));
                    }
                }
            }
            Kind::WikiOtd => {
                let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                for e in v["selected"].as_array().ok_or("no events")? {
                    let (text, year) = (
                        clean_text(e["text"].as_str().unwrap_or("")),
                        e["year"].as_i64().unwrap_or(0),
                    );
                    let t = format!("On this day in {year}: {text}");
                    if keep(&t) {
                        items.push(mk(
                            &t,
                            t.clone(),
                            e["pages"][0]["content_urls"]["desktop"]["page"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                        ));
                    }
                }
            }
            Kind::WikiFeatured => {
                let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                let tfa = &v["tfa"];
                let (title, ex) = (
                    tfa["titles"]["normalized"]
                        .as_str()
                        .or(tfa["title"].as_str())
                        .ok_or("no featured article")?,
                    tfa["extract"].as_str().unwrap_or(""),
                );
                let t = format!(
                    "Today's featured Wikipedia article is {title}. {}",
                    first_sentences(&clean_text(ex), 2, 300)
                );
                if keep(&t) {
                    items.push(mk(
                        &t,
                        t.clone(),
                        tfa["content_urls"]["desktop"]["page"]
                            .as_str()
                            .unwrap_or("")
                            .to_string(),
                    ));
                }
            }
            Kind::Rss | Kind::RssNews => {
                let mut heads = vec![];
                for chunk in body.split("<item").skip(1) {
                    let chunk = chunk.split("</item>").next().unwrap_or(chunk);
                    let title = clean_text(&tag(chunk, "title").unwrap_or_default());
                    if title.is_empty() {
                        continue;
                    }
                    let link = clean_text(&tag(chunk, "link").unwrap_or_default());
                    if src.kind == Kind::RssNews {
                        continue;
                    }
                    let desc = first_sentences(
                        &clean_text(&tag(chunk, "description").unwrap_or_default()),
                        2,
                        280,
                    );
                    let t = if desc.is_empty() {
                        title.clone()
                    } else {
                        format!("{}. {desc}", title.trim_end_matches('.'))
                    };
                    if keep(&t) {
                        items.push(mk(&link, t, link.clone()));
                    }
                }
                if src.kind == Kind::RssNews {
                    heads = news_articles(body, &src.attribution)
                        .iter()
                        .map(|v| {
                            format!(
                                "{}: {}",
                                v["title"].as_str().unwrap_or(""),
                                v["summary"].as_str().unwrap_or("")
                            )
                        })
                        .collect();
                    if heads.is_empty() {
                        return Err("no news with usable content".into());
                    }
                    heads.truncate(src.per_fetch.max(1));
                    return Ok(Parsed::Brief(format!(
                        "{}\n• {}",
                        src.attribution,
                        heads.join("\n• ")
                    )));
                }
            }
            Kind::Weather => {
                let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                let t = v["current"]["temperature_2m"]
                    .as_f64()
                    .ok_or("no temperature")?;
                let code = v["current"]["weather_code"].as_i64().unwrap_or(-1);
                let mut s = format!(
                    "{}: {:.0} degrees Celsius, {}",
                    if self.place.city.is_empty() {
                        "Weather"
                    } else {
                        &self.place.city
                    },
                    t,
                    wmo(code)
                );
                if let (Some(h), Some(l)) = (
                    v["daily"]["temperature_2m_max"][0].as_f64(),
                    v["daily"]["temperature_2m_min"][0].as_f64(),
                ) {
                    s += &format!("; today's high {h:.0}, low {l:.0}");
                }
                return Ok(Parsed::Brief(s + "."));
            }
            Kind::Markets => {
                if body.trim_start().starts_with('{') {
                    let v: Value = serde_json::from_str(body).map_err(|e| e.to_string())?;
                    let m = &v["chart"]["result"][0]["meta"];
                    let price = m["regularMarketPrice"]
                        .as_f64()
                        .ok_or("No quote from market provider")?;
                    let percent = m["regularMarketChangePercent"]
                        .as_f64()
                        .or(m["fulldayChangePercent"].as_f64());
                    return Ok(Parsed::Brief(format!(
                        "{} {:.2} ({}; delayed/indicative; market timestamp {})",
                        m["shortName"]
                            .as_str()
                            .or(m["symbol"].as_str())
                            .unwrap_or("Index"),
                        price,
                        percent.map_or("movement unavailable".into(), |p| format!(
                            "{p:+.2}% from previous close"
                        )),
                        m["regularMarketTime"].as_u64().unwrap_or(0)
                    )));
                }
                let row = body.lines().nth(1).ok_or("no data")?;
                let f: Vec<&str> = row.split(',').collect();
                let (o, c) = (
                    f.get(3).and_then(|x| x.parse::<f64>().ok()),
                    f.get(6).and_then(|x| x.parse::<f64>().ok()),
                );
                let (o, c) = (o.ok_or("no open")?, c.ok_or("no close")?);
                if !o.is_finite() || !c.is_finite() || o <= 0.0 || c <= 0.0 {
                    return Err("invalid market price".into());
                }
                let sym = id
                    .split('#')
                    .nth(1)
                    .unwrap_or(f.first().copied().unwrap_or("?"));
                return Ok(Parsed::Brief(format!(
                    "{} {:.1} ({:+.1}% from open; delayed snapshot {} {})",
                    mkt_name(sym),
                    c,
                    (c - o) / o * 100.0,
                    f.get(1).unwrap_or(&"?"),
                    f.get(2).unwrap_or(&"?")
                )));
            }
        }
        if items.is_empty() {
            Err("no usable items".into())
        } else {
            Ok(Parsed::Items(items))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn src(id: &str) -> Source {
        Registry::seeded()
            .sources
            .into_iter()
            .find(|s| s.id == id)
            .unwrap()
    }
    fn items(p: Parsed) -> Vec<Item> {
        match p {
            Parsed::Items(v) => v,
            _ => panic!("expected items"),
        }
    }

    #[test]
    fn civil_dates_and_url_fill() {
        assert_eq!(civil(19_675), (2023, 11, 14));
        let r = Registry::seeded();
        assert!(r.fill("{yyyy}/{mm}/{dd}", 1_700_000_000, 0, None) == "2023/11/14");
        assert_eq!(
            r.fill("{yyyy}/{mm}/{dd}", 1_700_000_000 + 20 * 3600, 19_800, None),
            "2023/11/15",
            "local date, not UTC"
        );
    }
    #[test]
    fn jokeapi_parse_filters_unsafe() {
        let body = r#"{"error":false,"amount":3,"jokes":[{"id":1,"type":"single","joke":"I used to be a banker, but I lost interest."},{"id":2,"type":"single","joke":"A joke about being killed in a sword fight at dawn."},{"id":3,"type":"single","joke":"Why don't scientists trust atoms? Because they make up everything."}]}"#;
        let v = items(
            Registry::seeded()
                .parse(&src("jokeapi"), "jokeapi", body, 5)
                .unwrap(),
        );
        assert_eq!(v.len(), 2);
        assert!(v.iter().all(|i| i.source == "JokeAPI" && i.fetched == 5));
        assert!(Registry::seeded()
            .parse(&src("jokeapi"), "jokeapi", r#"{"error":true}"#, 5)
            .is_err());
    }
    #[test]
    fn wikipedia_feeds_parse_with_attribution_links() {
        let otd = r#"{"selected":[{"text":"The first pocket calculator is demonstrated by engineers.","year":1967,"pages":[{"content_urls":{"desktop":{"page":"https://en.wikipedia.org/wiki/Calculator"}}}]},{"text":"A great earthquake killed thousands in the city.","year":1900,"pages":[]}]}"#;
        let v = items(
            Registry::seeded()
                .parse(&src("wiki_otd"), "wiki_otd", otd, 1)
                .unwrap(),
        );
        assert_eq!(v.len(), 1);
        assert!(
            v[0].text.starts_with("On this day in 1967")
                && v[0].link.ends_with("/Calculator")
                && v[0].source.contains("CC BY-SA")
        );
        let tfa = r#"{"tfa":{"titles":{"normalized":"Great Barrier Reef"},"extract":"The Great Barrier Reef is the world's largest coral reef system. It lies off Queensland.","content_urls":{"desktop":{"page":"https://en.wikipedia.org/wiki/Great_Barrier_Reef"}}}}"#;
        assert!(items(
            Registry::seeded()
                .parse(&src("wiki_tfa"), "wiki_tfa", tfa, 1)
                .unwrap()
        )[0]
        .text
        .contains("Great Barrier Reef"));
    }
    #[test]
    fn rss_items_and_news_headlines() {
        let rss = "<rss><channel><title>X</title><item><title><![CDATA[Webb Telescope Finds New Galaxy]]></title><link>https://science.nasa.gov/a</link><description><![CDATA[<p>Astronomers using the Webb telescope found a distant galaxy. More soon.</p>]]></description></item><item><title>Short</title></item></channel></rss>";
        let v = items(
            Registry::seeded()
                .parse(&src("nasa"), "nasa", rss, 1)
                .unwrap(),
        );
        assert_eq!(v.len(), 1);
        assert!(
            v[0].text.starts_with("Webb Telescope Finds New Galaxy.")
                && v[0].link == "https://science.nasa.gov/a"
        );
        let news = "<rss><channel><item><title>Markets rally</title></item><item><title>Rains ease</title></item></channel></rss>";
        assert!(
            Registry::seeded()
                .parse(&src("bbc_world"), "bbc_world", news, 1)
                .is_err(),
            "headline-only feeds must be rejected"
        );
        let articles = news_articles(rss, "NASA");
        assert_eq!(articles.len(), 1);
        assert!(articles[0]["summary"]
            .as_str()
            .unwrap()
            .contains("Astronomers"));
    }
    #[test]
    fn weather_markets_lookup() {
        let mut r = Registry::seeded();
        r.place.city = "Ahmedabad".into();
        let w = r#"{"current":{"temperature_2m":31.4,"weather_code":2},"daily":{"temperature_2m_max":[34.0],"temperature_2m_min":[25.5]}}"#;
        match r.parse(&src("weather"), "weather", w, 1).unwrap() {
            Parsed::Brief(b) => assert_eq!(
                b,
                "Ahmedabad: 31 degrees Celsius, partly cloudy; today's high 34, low 26."
            ),
            _ => panic!(),
        }
        let csv = "Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2026-10-26,22:00:00,5000.0,5050.0,4990.0,5040.0,0\n";
        match r.parse(&src("markets"), "markets#^spx", csv, 1).unwrap() {
            Parsed::Brief(b) => assert_eq!(
                b,
                "S&P 500 5040.0 (+0.8% from open; delayed snapshot 2026-10-26 22:00:00)"
            ),
            _ => panic!(),
        }
        let l = parse_lookup(r#"{"query":{"pages":[{"title":"Eiffel Tower","extract":"The Eiffel Tower is a wrought-iron tower in Paris. It was completed in 1889.","fullurl":"https://en.wikipedia.org/wiki/Eiffel_Tower"}]}}"#).unwrap();
        assert_eq!(
            (l.title.as_str(), l.url.ends_with("Eiffel_Tower")),
            ("Eiffel Tower", true)
        );
        assert!(parse_lookup(
            r#"{"query":{"pages":[{"title":"Mercury","extract":"Mercury may refer to:"}]}}"#
        )
        .is_none());
        assert!(lookup_url("eiffel tower").contains("gsrsearch=eiffel%20tower"));
    }
    #[test]
    fn plan_respects_place_symbols_stock_and_backoff() {
        let mut r = Registry::seeded();
        let none = |_: Family| 0usize;
        let ids = |p: &Vec<FetchReq>| p.iter().map(|x| x.id.clone()).collect::<Vec<_>>();
        let p = r.plan(100, 0, &none, 150);
        assert!(
            !ids(&p).contains(&"weather".to_string()),
            "no weather without a place"
        );
        assert!(
            ids(&p).contains(&"markets#^spx".to_string())
                && ids(&p).contains(&"markets#^ndq".to_string())
        );
        r.place.lat = Some(23.02);
        r.place.lon = Some(72.57);
        assert!(r
            .plan(100, 0, &none, 150)
            .iter()
            .any(|x| x.id == "weather" && x.url.contains("latitude=23.0200")));
        assert!(
            ids(&r.plan(100, 0, &|_| 999, 150)).contains(&"jokeapi".to_string()),
            "full stock still refreshes due sources; ingestion evicts older items"
        );
        r.mark_ok("jokeapi", 100, 3);
        assert!(
            !ids(&r.plan(200, 0, &none, 150)).contains(&"jokeapi".to_string()),
            "not due again yet"
        );
        r.mark_fail("nasa", 100);
        r.mark_fail("nasa", 100);
        let s = r.sources.iter().find(|s| s.id == "nasa").unwrap();
        assert!(s.next_due >= 100 + 600 && s.fails == 2, "backoff grows");
    }
    #[test]
    fn alternate_json_sources_parse_content_not_titles() {
        let registry = Registry::seeded();
        let jokes = items(
            registry
                .parse(
                    &src("official-jokes"),
                    "official-jokes",
                    r#"[{"setup":"Why did the bicycle rest?","punchline":"It was two tired."}]"#,
                    100,
                )
                .unwrap(),
        );
        assert_eq!(jokes.len(), 1);
        assert!(jokes[0].text.contains("two tired"));
        let facts=items(registry.parse(&src("uselessfacts"),"uselessfacts",r#"{"text":"A day on Venus lasts longer than its year.","source_url":"https://example.com/venus"}"#,100).unwrap());
        assert_eq!(facts.len(), 1);
        assert_eq!(facts[0].link, "https://example.com/venus");
    }
    #[test]
    fn headline_only_encoded_aggregator_items_are_excluded() {
        let feed = r#"<rss><item><title>A new science exhibition opens in the city today - Test News</title><description>&lt;a href=&quot;https://example.com/news&quot;&gt;A new science exhibition opens in the city today&lt;/a&gt;&amp;nbsp; Test News</description><link>https://example.com/news</link></item></rss>"#;
        assert!(news_articles(feed, "Aggregator").is_empty());
    }
    #[test]
    fn short_public_domain_stories_are_sourced_and_rotate() {
        let body="The Helpful Bird\n\n\n\n\n\nA small bird shared its shade with a tired traveller on a warm afternoon. The traveller left water for the bird in return.\n\n\n\n\n\n\n\nThe Patient Gardener\n\n\n\n\n\nA gardener planted seeds and watered them every morning. Weeks later, flowers filled the little garden and delighted the neighbours.";
        let a = items(
            Registry::seeded()
                .parse(&src("aesop"), "aesop", body, 0)
                .unwrap(),
        );
        let b = items(
            Registry::seeded()
                .parse(&src("aesop"), "aesop", body, 3600)
                .unwrap(),
        );
        assert_eq!(a.len(), 2);
        assert_ne!(a[0].id, b[0].id);
        assert!(a[0].link.contains("gutenberg.org"));
    }
    #[test]
    fn source_failure_reason_clears_after_success() {
        let mut registry = Registry::seeded();
        registry.mark_fail("nasa", 100);
        registry.error("nasa", "No usable items");
        assert_eq!(
            registry
                .sources
                .iter()
                .find(|s| s.id == "nasa")
                .unwrap()
                .last_error,
            "No usable items"
        );
        registry.mark_ok("nasa", 200, 1);
        assert!(registry
            .sources
            .iter()
            .find(|s| s.id == "nasa")
            .unwrap()
            .last_error
            .is_empty());
    }
}
