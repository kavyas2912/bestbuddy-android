# BestBuddyV1.07.5 — change and preservation specification

## Authoritative baseline

The new user-provided ZIP `4fdece16-e4e4-4c25-90fb-c24114ee0eda.zip`, not the earlier `vce-mobile_v0.7.zip`. Its Tauri configuration explicitly identifies version 0.7.4, its Android Gradle metadata identifies 7004, and its evidence includes Android build and APK verification records. All 244 baseline source files are retained; no baseline source file was deleted. The original evidence is copied unmodified into the release archive.

## Requested behaviour

1. A persisting, immediate Quiet/Unmute that works from every screen, without altering native safety service policy. Non-brief content is spoken only when explicitly requested.
2. World/National/Local/Misc news sub-tabs; topic filters and a read-top-five control per selection.
3. Day Book displays date, saved reminders and dates plus Panchang source links, no automatic speech.
4. Indices retain existing functionality and add cached sourced market story summaries with on-demand narration.
5. Jokes prefetch broadened and errors observable; mature-content opt-in distinct from age confirmation.
6. At least 50 locally available examples in each requested chatter category, plus sourced online updates.
7. Music and Video launchers no longer occupy Explore; existing Media implementation stays intact.
8. Android builder that uses exactly this authoritative source and preserves install identity.

## Preservation requirements

- Keep `app.vce.buddy`, Android Kotlin package, native services, consent gates, existing settings, themes, speech recognition, model picker/downloader, media and safety integration.
- Preserve all original static UI control IDs and native plugin canonical source files.
- No automatic Android uninstall, signing-key substitution or model downloads through the build scripts.
- Display a clear limitation for unavailable headlines, Panchang calculations or external device calendar access.

## Checks performed in this environment

- 11 release-specific Node contract tests: PASS.
- 9 original 0.7.4 frontend routing/cancellation tests against updated source: PASS.
- 6 original 0.7.4 model launch tests against updated source: PASS.
- JavaScript module parsing for modified files: PASS.
- All 140 original static UI IDs are retained; three new IDs were added, without duplicates.
- All original 244 source files are present; changes are limited to the specified modules, build metadata and helpers.
- Compiling Rust/Android, verifying Android signing and microphone/device operation: **NOT performed** here because the Rust/Android toolchain is unavailable in this environment. `RUN_TESTS.cmd` runs Rust core tests when cargo is installed; `BUILD_ANDROID.cmd` performs the actual user-device build.

## Deliberately not misrepresented as implemented

- Live device-calendar integration and precise on-screen lunar Panchang values are not implemented; they would require additional Android integration, location-specific calculation/provider and explicit approval. The current display offers dated links rather than inventing values.
- Smart Butler remains a **separate APK project**; no older or placeholder Smart Butler code is included or claimed as finished in this BestBuddy-only upgrade.
- User's installed 0.7.4 debug signing key is not included; upgrade installation works only if signing identity is preserved.
