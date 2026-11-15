// src-tauri/src/lib.rs
//! Thin Tauri layer: forwards UI commands to vce-core. No audio data passes through here.
mod native;
use std::{
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use vce_core::consent::Consent;
use vce_core::ledger::Family;
use vce_core::profile::Profile;
use vce_core::sources::{FetchReq, Place, Source};
use vce_core::{Alarm, Assistant, Brief, DevFileKeyStore, Purpose, Resolution};

#[tauri::command]
fn vce_profile_plan(
    profile: vce_core::capabilities::Profile,
) -> vce_core::capabilities::ProfilePlan {
    profile.plan()
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
fn vce_resolve(text: String, a: State<'_, Mutex<Assistant>>) -> Resolution {
    a.lock().unwrap().handle_text(&text, now())
}

#[tauri::command]
fn vce_daybook(a: State<'_, Mutex<Assistant>>) -> Vec<vce_core::learn::Reminder> {
    a.lock().unwrap().daybook(now())
}

#[tauri::command]
fn vce_brief(a: State<'_, Mutex<Assistant>>) -> Brief {
    a.lock().unwrap().brief(now())
}

#[tauri::command]
fn vce_set_user(name: String, tz: i64, a: State<'_, Mutex<Assistant>>) {
    let mut g = a.lock().unwrap();
    g.set_name(&name);
    g.set_tz(tz);
}

#[tauri::command]
fn vce_register(
    name: String,
    lang: String,
    tone: String,
    adult: bool,
    tz: i64,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    let mut g = a.lock().unwrap();
    g.set_tz(tz);
    g.register(Profile {
        name,
        lang,
        tone,
        age_band: None,
        adult_confirmed: adult,
        created: now(),
    })
}

#[tauri::command]
fn vce_consents(a: State<'_, Mutex<Assistant>>) -> Vec<Consent> {
    a.lock().unwrap().consents().to_vec()
}

#[tauri::command]
fn vce_set_consent(
    purpose: String,
    granted: bool,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    let p: Purpose =
        serde_json::from_value(serde_json::Value::String(purpose)).map_err(|e| e.to_string())?;
    a.lock().unwrap().set_consent(p, granted, now())
}

#[tauri::command]
fn vce_know(a: State<'_, Mutex<Assistant>>) -> Vec<String> {
    a.lock().unwrap().what_i_know()
}

#[tauri::command]
fn vce_forget(index: usize, a: State<'_, Mutex<Assistant>>) -> Result<(), String> {
    a.lock().unwrap().forget(index)
}

#[tauri::command]
fn vce_export(a: State<'_, Mutex<Assistant>>) -> Result<String, String> {
    a.lock().unwrap().export_json()
}

#[tauri::command]
fn vce_wipe(a: State<'_, Mutex<Assistant>>, ks: State<'_, DevFileKeyStore>) -> Result<(), String> {
    a.lock().unwrap().wipe(&*ks)
}

#[tauri::command]
fn vce_set_chatty(level: String, a: State<'_, Mutex<Assistant>>) {
    a.lock().unwrap().set_chatty(&level)
}

#[tauri::command]
fn vce_silence(
    idle: u64,
    allow_questions: Option<bool>,
    a: State<'_, Mutex<Assistant>>,
) -> Option<String> {
    a.lock()
        .unwrap()
        .silence_breaker_with_questions(now(), idle, allow_questions.unwrap_or(true))
}

/// What to fetch now (empty unless the user allowed prefetch). The UI fetches and hands bodies back.
#[tauri::command]
fn vce_fetch_plan(force: Option<bool>, a: State<'_, Mutex<Assistant>>) -> Vec<FetchReq> {
    a.lock().unwrap().fetch_plan(now(), force.unwrap_or(false))
}

#[tauri::command]
fn vce_ingest(
    id: String,
    body: String,
    weather_place: Option<Place>,
    news_country: Option<String>,
    a: State<'_, Mutex<Assistant>>,
) -> Result<usize, String> {
    let mut assistant = a.lock().unwrap();
    if let Some(country) = news_country {
        if country != assistant.region() {
            return Err("The country changed during the news refresh".into());
        }
    }
    if id == "weather" {
        if let Some(expected) = weather_place {
            let current = assistant.place();
            if current.city != expected.city
                || current.lat != expected.lat
                || current.lon != expected.lon
            {
                return Err("The city changed during the weather refresh".into());
            }
        }
    }
    assistant.ingest(&id, &body, now())
}

#[tauri::command]
fn vce_ingest_lookup(body: String, a: State<'_, Mutex<Assistant>>) -> Resolution {
    a.lock().unwrap().ingest_lookup(&body, now())
}

#[tauri::command]
fn vce_fetch_failed(id: String, a: State<'_, Mutex<Assistant>>) {
    a.lock().unwrap().fetch_failed(&id, now())
}

#[tauri::command]
fn vce_sources(a: State<'_, Mutex<Assistant>>) -> Vec<Source> {
    a.lock().unwrap().sources()
}

#[tauri::command]
fn vce_source_toggle(
    id: String,
    enabled: bool,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    a.lock().unwrap().toggle_source(&id, enabled)
}

#[tauri::command]
fn vce_source_add(
    name: String,
    url: String,
    family: String,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    if family == "news" {
        return a.lock().unwrap().add_news_source(&name, &url);
    }
    let f: Family =
        serde_json::from_value(serde_json::Value::String(family)).map_err(|e| e.to_string())?;
    a.lock().unwrap().add_source(&name, &url, f)
}

#[tauri::command]
fn vce_set_place(
    city: String,
    lat: Option<f64>,
    lon: Option<f64>,
    symbols: String,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    a.lock().unwrap().set_place(&city, lat, lon, &symbols)
}

#[tauri::command]
fn vce_place(a: State<'_, Mutex<Assistant>>) -> Place {
    a.lock().unwrap().place()
}

#[tauri::command]
fn vce_helpline(a: State<'_, Mutex<Assistant>>) -> String {
    a.lock().unwrap().helpline()
}

#[tauri::command]
fn vce_set_helpline(text: String, a: State<'_, Mutex<Assistant>>) -> Result<(), String> {
    a.lock().unwrap().set_helpline(&text)
}

#[tauri::command]
fn vce_panels(a: State<'_, Mutex<Assistant>>) -> serde_json::Value {
    a.lock().unwrap().panels()
}
#[tauri::command]
fn vce_user_info(a: State<'_, Mutex<Assistant>>) -> Result<serde_json::Value, String> {
    a.lock().unwrap().user_info()
}
#[tauri::command]
fn vce_save_user_info(
    value: serde_json::Value,
    a: State<'_, Mutex<Assistant>>,
) -> Result<(), String> {
    a.lock().unwrap().set_user_info(value)
}

#[tauri::command]
fn vce_region(country: Option<String>, a: State<'_, Mutex<Assistant>>) -> Result<String, String> {
    let mut g = a.lock().unwrap();
    if let Some(c) = country {
        g.set_region(&c)?
    };
    Ok(g.region())
}
#[tauri::command]
fn vce_market_cache(
    value: Option<serde_json::Value>,
    a: State<'_, Mutex<Assistant>>,
) -> Result<serde_json::Value, String> {
    let g = a.lock().unwrap();
    if let Some(v) = value {
        g.save_market_cache(&v)?
    };
    g.market_cache()
}

#[tauri::command]
fn vce_update_name(name: String, a: State<'_, Mutex<Assistant>>) -> Result<(), String> {
    a.lock().unwrap().update_name(&name)
}
#[tauri::command]
fn vce_refresh_settings(
    minutes: Option<u64>,
    a: State<'_, Mutex<Assistant>>,
) -> Result<u64, String> {
    let mut g = a.lock().unwrap();
    if let Some(m) = minutes {
        g.set_refresh_minutes(m)?
    };
    Ok(g.refresh_minutes())
}
#[tauri::command]
fn vce_stored_items(a: State<'_, Mutex<Assistant>>) -> serde_json::Value {
    a.lock().unwrap().stored_items()
}
#[tauri::command]
fn vce_delete_stored(ids: Vec<String>, a: State<'_, Mutex<Assistant>>) -> Result<usize, String> {
    a.lock().unwrap().delete_stored(&ids)
}

/// In-app alarm clock: the UI polls this every few seconds and on resume.
#[tauri::command]
fn vce_tick(a: State<'_, Mutex<Assistant>>) -> Vec<Alarm> {
    a.lock().unwrap().tick(now())
}

/// Bounded HTTPS fetch. Consent is checked on the native side, including city lookup.
#[tauri::command]
async fn vce_http_get(url: String, a: State<'_, Mutex<Assistant>>) -> Result<String, String> {
    if !a
        .lock()
        .unwrap()
        .consents()
        .iter()
        .any(|c| c.purpose == Purpose::Prefetch && c.granted)
    {
        return Err("Online updates are off".into());
    }
    let parsed = tauri_plugin_http::reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Use an HTTPS address without embedded credentials".into());
    }
    let client = tauri_plugin_http::reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .redirect(tauri_plugin_http::reqwest::redirect::Policy::custom(
            |attempt| {
                if attempt.previous().len() > 5 || attempt.url().scheme() != "https" {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            },
        ))
        .user_agent("Mozilla/5.0 BestBuddyAndroid/1.7.6 (personal companion)")
        .build()
        .map_err(|e| e.to_string())?;
    let mut r = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = r.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 4_000_000 {
            return Err("Source exceeds content limit".into());
        };
        bytes.extend_from_slice(&chunk)
    }
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

/// Read-only, bounded scan of locations that Android/the user already made accessible.
/// It never requests MANAGE_EXTERNAL_STORAGE, follows symlinks, opens private directories,
/// imports models silently, or claims incompatible files are activated.
#[derive(serde::Serialize)]
struct ResourceHit {
    name: String,
    kind: String,
    location: String,
    bytes: u64,
}
#[derive(serde::Serialize)]
struct ScanReport {
    files: Vec<ResourceHit>,
    scanned: usize,
    denied: usize,
}
#[tauri::command]
fn vce_scan_local_resources(app: AppHandle) -> ScanReport {
    use std::{collections::HashSet, fs, path::PathBuf};
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        for name in [
            "Downloads",
            "Download",
            "Documents",
            "Music",
            "Movies",
            "models",
            ".cache/huggingface/hub",
        ] {
            roots.push(PathBuf::from(&home).join(name));
        }
    }
    if let Ok(dir) = app.path().app_data_dir() {
        roots.push(dir);
    }
    for public in [
        "/storage/emulated/0/Download",
        "/storage/emulated/0/Documents",
        "/storage/emulated/0/Music",
        "/storage/emulated/0/Movies",
        "/storage/emulated/0/Pictures",
        "/storage/emulated/0/Podcasts",
        "/storage/emulated/0/Download/models",
        "/storage/emulated/0/Documents/models",
        "/storage/emulated/0/Models",
        "/storage/emulated/0/AIModels",
        "/storage/emulated/0/llm",
        "/sdcard/Download",
        "/sdcard/Documents",
        "/sdcard/Music",
        "/sdcard/ai_models",
    ] {
        roots.push(PathBuf::from(public));
    }

    // Common user-owned Windows / desktop caches and AI-model locations.
    // Never enumerate system directories, recurse through links or cross permission boundaries.
    for variable in [
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "OLLAMA_MODELS",
        "HF_HOME",
        "HUGGINGFACE_HUB_CACHE",
    ] {
        if let Ok(base) = std::env::var(variable) {
            let root = PathBuf::from(base);
            if variable == "USERPROFILE" {
                for name in [
                    "Downloads",
                    "Documents",
                    "Music",
                    ".cache/huggingface/hub",
                    ".ollama/models",
                    ".lmstudio/models",
                    "AppData/Local/lm-studio/models",
                ] {
                    roots.push(root.join(name));
                }
            } else if variable == "LOCALAPPDATA" {
                for name in [
                    "Programs/Ollama/models",
                    "lm-studio/models",
                    "huggingface/hub",
                ] {
                    roots.push(root.join(name));
                }
            } else if variable == "APPDATA" {
                roots.push(root.join("Ollama/models"));
            } else {
                roots.push(root);
            }
        }
    }
    let mut report = ScanReport {
        files: Vec::new(),
        scanned: 0,
        denied: 0,
    };
    let mut visited = HashSet::new();
    let mut pending: Vec<(PathBuf, u8)> = roots.into_iter().map(|p| (p, 0)).collect();
    let mut inspected = 0_usize;
    while let Some((path, depth)) = pending.pop() {
        if inspected >= 6_000 || report.files.len() >= 400 || report.scanned >= 450 {
            break;
        }
        let canonical = match fs::canonicalize(&path) {
            Ok(x) => x,
            Err(_) => {
                report.denied += 1;
                continue;
            }
        };
        if !visited.insert(canonical.clone()) {
            continue;
        }
        let directory = match fs::read_dir(&path) {
            Ok(x) => x,
            Err(_) => {
                report.denied += 1;
                continue;
            }
        };
        report.scanned += 1;
        for item in directory {
            inspected += 1;
            if inspected >= 6_000 || report.files.len() >= 400 {
                break;
            }
            let Ok(item) = item else { continue };
            let Ok(ft) = item.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let file_path = item.path();
            if ft.is_dir() {
                if depth < 3 {
                    pending.push((file_path, depth + 1));
                }
                continue;
            }
            if !ft.is_file() {
                continue;
            }
            let name = item.file_name().to_string_lossy().to_string();
            let ext = file_path
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let kind = match ext.as_str() {
                "ics" => "calendar",
                "gguf" | "litertlm" | "tflite" | "onnx" | "ort" => "ai-model-candidate",
                "mp3" | "wav" | "opus" | "flac" => "audio",
                "srt" => "subtitles",
                "json" if name.to_ascii_lowercase().contains("model") => "model-manifest",
                _ => continue,
            };
            let bytes = item.metadata().map(|m| m.len()).unwrap_or(0);
            report.files.push(ResourceHit {
                name,
                kind: kind.to_string(),
                location: path.display().to_string(),
                bytes,
            });
        }
    }
    report
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(native::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let ks = DevFileKeyStore::new(dir.join("keys"));
            let assistant = Assistant::open(dir.join("data"), &ks, 0)?;
            app.manage(Mutex::new(assistant));
            app.manage(ks);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vce_profile_plan,
            vce_resolve,
            vce_brief,
            vce_daybook,
            vce_set_user,
            vce_register,
            vce_consents,
            vce_set_consent,
            vce_know,
            vce_forget,
            vce_export,
            vce_wipe,
            vce_set_chatty,
            vce_silence,
            vce_tick,
            native::vce_platform,
            native::vce_events,
            vce_fetch_plan,
            vce_ingest,
            vce_ingest_lookup,
            vce_fetch_failed,
            vce_sources,
            vce_source_toggle,
            vce_source_add,
            vce_set_place,
            vce_place,
            vce_helpline,
            vce_set_helpline,
            vce_panels,
            vce_user_info,
            vce_save_user_info,
            vce_http_get,
            vce_region,
            vce_market_cache,
            vce_update_name,
            vce_refresh_settings,
            vce_stored_items,
            vce_delete_stored,
            vce_scan_local_resources
        ])
        .run(tauri::generate_context!())
        .expect("error while running Buddy");
}
