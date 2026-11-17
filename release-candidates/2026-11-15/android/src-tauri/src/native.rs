use serde_json::Value;
use tauri::{Manager, Wry};
#[cfg(target_os = "android")]
struct Native(tauri::plugin::PluginHandle<Wry>);
pub fn init() -> tauri::plugin::TauriPlugin<Wry> {
    tauri::plugin::Builder::new("vce-platform")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            app.manage(Native(api.register_android_plugin(
                "app.vce.platform",
                "VcePlatformPlugin",
            )?));
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
#[tauri::command]
pub async fn vce_platform(
    app: tauri::AppHandle,
    command: String,
    args: Option<Value>,
) -> Result<Value, String> {
    const ALLOWED: &[&str] = &[
        "safetyStart",
        "safetyStop",
        "safetyStatus",
        "safetyAcknowledge",
        "safetyCheckNow",
        "pickContact",
        "callContact",
        "checkModelAccess",
        "exportModel",
        "scanDownloadsModels",
        "housekeeping",
        "openConnection",
        "connections",
        "scanModels",
        "chooseModelFile",
        "importModel",
        "status",
        "speak",
        "listen",
        "stop",
        "models",
        "downloadModel",
        "pauseDownload",
        "modelOptions",
        "resetDownload",
        "selectModel",
        "generate",
        "probe",
        "remember",
        "clearSession",
        "unload",
        "openSpeechSettings",
        "openRecognitionSettings",
        "openLink",
        "dial",
    ];
    if !ALLOWED.contains(&command.as_str()) {
        return Err("Unknown platform operation".into());
    }
    #[cfg(target_os = "android")]
    {
        app.state::<Native>()
            .0
            .run_mobile_plugin_async(&command, args.unwrap_or(serde_json::json!({})))
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, args);
        Err("Android native features require the APK".into())
    }
}
#[tauri::command]
pub async fn vce_events(
    app: tauri::AppHandle,
    on_event: tauri::ipc::Channel<Value>,
) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        app.state::<Native>()
            .0
            .run_mobile_plugin_async("events", serde_json::json!({"onEvent":on_event}))
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, on_event);
        Ok(Value::Null)
    }
}
