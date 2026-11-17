# BestBuddy Android 1.11.9 — private device test

The English offline conversation model (Qwen3-1.7B), Whisper base.en recognition and Piper LJSpeech voice are included. First launch extracts and verifies the resources; allow several minutes and about 3 GB of free storage including installation and extracted assets. The APK is approximately 1.26 GiB. No model account or download is required for the default.

The update retains selected-place news, daily briefing, Market Watch, Day Book, media and explicit safety controls. It adds the Macaw-style launch sound, attributed web research capture, consent-controlled dialogue context and persistent delivered-content recall records. Optional model/voice choices remain under Advanced. A finite offline entertainment library can be exhausted; the app then explains that rather than replaying it automatically. Semantic uniqueness of arbitrary generated conversation is not guaranteed.

Validation: 70 native core tests; JavaScript regression checks; packaged resource SHA-256 checks; unchanged debug update certificate; ZIP and ELF 16 KB alignment. Real Android inference, microphone, speaker and battery acceptance remain pending. CPU desktop model and sample-speech checks are separate evidence and do not substitute for the phone test.

Install over the previous debug test APK to retain its app data. A release-key APK uses a different certificate and cannot update this debug installation.

For automated device checks, connect and authorize Android Debug Bridge, open Buddy and finish its first preparation, then run:

```powershell
node tools/test-installed-app.mjs
# Optional: actual speaker and microphone test. Say "blue sky" when prompted.
node tools/test-installed-app.mjs --voice
```

Node 22+ is required. If adb is not in PATH, pass `--adb "C:/path/to/adb.exe"`. The test uses the installed debug APK's real native bridge and writes BestBuddy-Android-test-results.json. It does not upload the results. Review that file before sharing it.

Wireless debugging works on supported Android versions: use the device's Developer options → Wireless debugging pairing details with `adb pair IP:PAIRING_PORT`, then its connection details with `adb connect IP:DEBUG_PORT`. Link to Windows by itself does not establish an adb connection. No device is currently connected to this build machine.

Build resources and licences: DEFAULT_RESOURCES.json, tools/restore_defaults.py and THIRD_PARTY_NOTICES.md. The dated GitHub iOS workflow checks simulator compilation/launch separately; native iOS feature parity remains open.
