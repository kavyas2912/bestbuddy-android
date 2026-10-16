# Validation — 15 October 2026

## Completed checks

- Rust formatting checked in both independent source trees.
- Committed Cargo workspace manifests and lockfile parse.
- All shipped PowerShell scripts parse; CMD wrappers were inspected for quoted script paths and exit-code propagation.
- Frontend reminder regressions and strict TypeScript/Vite production builds pass independently in both trees.
- Shared core/plugin unit tests: 32 passed, 3 ignored external-service tests. Tests use a writable temporary directory; the first sandbox run failed three persistence tests because the host temporary directory was not writable. All three pass with the corrected test environment.
- Windows full workspace check, including voice and all targets: passed.
- Windows full workspace test result: 51 passed, 10 ignored.
- Resource reuse regression passed, including mapped-drive reuse and persistent native model aliases. The drive-mapping portion required execution outside the sandbox.
- Both platform model packs were reused from the existing cache and checked against the pinned model hashes.
- Source selection audit found no files above 10 MB and no private-key or GitHub-token markers. This targeted scan does not establish absence of every possible secret.

## Additional model-backed voice checks

Four previously ignored native voice tests were run explicitly and passed: bundled keyword spotter initialization; Piper-generated Hey Buddy audio replayed through live KWS chunks; bundled WAV transcription through the public ASR path; and 48 kHz microphone-format resampling to Whisper. These are sample-audio checks, not real microphone or speaker acceptance.

Both source trees were packaged into temporary clean-extraction archives. All extracted file hashes matched their manifests and locked offline Cargo metadata passed in both extracted trees. The final source archives are created from committed Git content and checked separately.

## Platform build evidence

The Android arm64 debug APK build passed using Java 21, SDK platform 36 and the installed NDK. The produced app-universal-debug.apk was inspected for the app JNI library, sherpa-onnx, ONNX Runtime and voice-model manifest. APK SHA-256: FC18E65B2860D0FDDC8BC252562C47D6968D72AE968EC8BCA12A71003BC9F434. This is a debug build, not a signed release or Google Play acceptance.

## Not accepted on a device

Real microphone input, wake phrase, speech recognition, TTS output, interruption, Android lifecycle/permission behavior and live service integrations are not device accepted. Model presence and compilation are separate evidence. See [device acceptance](DEVICE_ACCEPTANCE.md).

No source has been pushed or synchronized to GitHub. The user requested local preparation only at this stage. The supplied original source remains unchanged.

## Build warnings

The Windows native voice test link emits LNK4098 because the pinned static-MT speech archive and another linked runtime select different C runtime defaults. Compilation and unit tests succeed; the warning has not been suppressed or treated as proof of runtime compatibility.

The Android build reports an unused log-directory variable, Gradle and generated Tauri Java API deprecations, Java 8 source/target warnings under JDK 21 and an SDK XML tools-version warning. Gradle 9 compatibility is not established; retain the committed 8.14.3 wrapper. These are recorded separately from build failures.
