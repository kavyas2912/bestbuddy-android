// android-plugins/vce-audio/AudioPlugin.kt
// UNVERIFIED STUB: written against the Tauri v2 Android plugin API but not built here.
// Real version: Oboe/AudioRecord capture in a foreground service (type: microphone), PCM frames -> Rust via JNI,
// audio-focus + Bluetooth route handling, and VAD/ASR fed natively (frames never go through the WebView).
package app.vce.audio

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class AudioPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun startCapture(invoke: Invoke) { /* TODO: request RECORD_AUDIO, start foreground service */ invoke.resolve() }

    @Command
    fun stopCapture(invoke: Invoke) { /* TODO */ invoke.resolve() }
}
