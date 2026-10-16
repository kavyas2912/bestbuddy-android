package com.vce.buddy

import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File
import java.security.MessageDigest

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    Thread {
      try { installVoiceAssets() } catch (error: Exception) {
        Log.e("VCEBuddy", "Voice assets could not be prepared", error)
      }
    }.start()
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun installVoiceAssets() {
    val bytes = assets.open("voice-models/SOURCE_SHA256.txt").use { it.readBytes() }
    val manifestHash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    val root = File(dataDir, "voice-models")
    val stamp = File(root, ".installed")
    val current = stamp.exists() && stamp.readText() == manifestHash
    val entries = bytes.toString(Charsets.UTF_8).lineSequence().filter { it.isNotBlank() }
    for (line in entries) {
      val parts = line.split("  ", limit = 3)
      if (parts.size != 3) throw IllegalArgumentException("Invalid voice asset manifest")
      val relative = parts[2]
      if (relative.startsWith("/") || relative.split('/').any { it == ".." || it == "." }) {
        throw IllegalArgumentException("Invalid voice asset path")
      }
      val destination = File(root, relative)
      val expectedSize = parts[1].toLong()
      if (destination.isFile && destination.length() == expectedSize && (current || sha256(destination) == parts[0])) continue
      destination.parentFile?.mkdirs()
      val partial = File(destination.parentFile, destination.name + ".part")
      assets.open("voice-models/$relative").use { input -> partial.outputStream().use { output -> input.copyTo(output) } }
      if (partial.length() != expectedSize || sha256(partial) != parts[0]) {
        partial.delete()
        throw IllegalStateException("Voice asset failed verification: $relative")
      }
      if (destination.exists() && !destination.delete()) throw IllegalStateException("Cannot replace voice asset: $relative")
      if (!partial.renameTo(destination)) throw IllegalStateException("Cannot install voice asset: $relative")
    }
    root.mkdirs()
    stamp.writeText(manifestHash)
  }
}
