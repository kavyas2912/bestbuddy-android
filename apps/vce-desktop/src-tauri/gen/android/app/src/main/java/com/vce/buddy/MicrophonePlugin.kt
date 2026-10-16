package com.vce.buddy

import android.Manifest
import android.app.Activity
import app.tauri.JSObject
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.PermissionState
import app.tauri.plugin.Plugin

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")])
class MicrophonePlugin(activity: Activity) : Plugin(activity) {
    @Command
    fun request(invoke: Invoke) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            permissionResult(invoke)
        } else {
            requestPermissionForAlias("microphone", invoke, "permissionResult")
        }
    }

    @PermissionCallback
    fun permissionResult(invoke: Invoke) {
        val result = JSObject()
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED)
        invoke.resolve(result)
    }
}
