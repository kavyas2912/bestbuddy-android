# BestBuddy Senior Assistant — current testing candidate

14 November 2026. Android 1.11.6 (11106).

See [release notes and device checks](RELEASE_NEWS_LOCATION.md) for the location-news correction, build/signing instructions and remaining acceptance requirements. Source checksums and external-asset restoration instructions accompany this source. Earlier notes below describe the retained baseline.

---

# BestBuddyV1.07.5 — Android source (upgrade from verified 0.7.4)

**Authoritative baseline:** user-provided 0.7.4 `source/` and `evidence/` snapshot, including verified 0.7.4 APK build metadata. The source in this archive is a modification of that exact 0.7.4 baseline, NOT the unrelated vce-mobile_v0.7 prototype.

## Build on Windows 11

1. Extract the ZIP to a folder with write access.
2. Use existing Rust, Tauri 2 CLI (`cargo tauri`), Node.js 20+, JDK 21, Android SDK/NDK 30 and the same Android signing key from the previous build (for upgrade installs). Set `JAVA_HOME`, `ANDROID_HOME`, or `NDK_HOME` only if automatic detection fails.
3. Run `RUN_TESTS.cmd` for syntax/contract checks. Run `BUILD_ANDROID.cmd` to build ARM64 debug APK. It creates `out/BestBuddyV1.07.5-arm64-debug.apk` only if the real build succeeds, with SHA256 and a log. Scripts stop at the first error and write `build-logs/BUILD_FAILURE.md` or `TEST_FAILURE.md`.
4. For release signing use `BUILD_ANDROID.ps1 -Release` and your established Android release signing setup. Never uninstall a working app just to overcome an upgrade-signature error. Save data first.

**Tauri packaging version:** `1.7.5` because SemVer forbids leading zero components. User-facing version: **BestBuddyV1.07.5**. Android versionCode `10705` (was `7004`), application ID **app.vce.buddy** unchanged. Debug APK installs over another APK only when signatures match; the builder does not re-sign using arbitrary credentials.

## Implemented changes to the 0.7.4 baseline

- Persistent Quiet/Sound ON buttons in header and Home. Quiet interrupts voice through the existing native stop command and gates subsequent TTS. The independently consented native safety audio system is unchanged.
- News tabs World/National/Local/Misc, per-tab All/Breaking/Sports/Culture/Business/Science & Tech filters and explicit read-top-five control. No fabricated news, summaries, or location; relies on actually fetched publisher summaries and existing de-duplication.
- Day Book with date picker, read-only in-app reminder list (new `vce_daybook` Rust command), saved dates, Panchang reference links and no automatic spoken schedule. Device calendar and calculated Panchang values are not supported by baseline permissions; the app clearly labels these limitations.
- Market stories under existing indices and portfolio tools, sourced from the news cache, with explicit read button.
- Jokes: repaired bundled JokeAPI URL to accept single and two-part formats; enabled existing Official Joke API and other sources, preserved source toggles and fetching error diagnostics. Fifty new family-friendly offline jokes and twenty consent-gated optional mild adult relationship jokes.
- Offline chatter: 50 original stories, 50 original illustrative anecdotes, 50 general funfacts, 50 science facts, 50 technology facts, 50 history facts. The source records label fictional material as original, and reference facts are presented as an offline educational collection, not falsely as live sourced journalism. The existing content and geo-facts remain.
- Moved Music/Video shortcut tiles out of Explore. Actual music, photos, video, playback state and integrations remain untouched in Media.
- Proactive chatter is opt-in (default off); manual content selection and direct voice questions still work. Reminder alerts remain visible, not spoken automatically. Existing safety prompts and alarms retain their independent safety policy.
- Included self-contained Windows build/test scripts; no npm-tauri script dependency, stale workspace path or automatic toolchain replacement.

## Limitations and verification

The local static/contract tests verify UI code syntax, feature wiring, source content counts, and Android build metadata. The original evidence directory is preserved as *historical 0.7.4 evidence*, NOT proof of a V1.07.5 APK. This environment has no Android SDK or Rust cargo compiler, so Android compilation and device-level speech, safety and signing checks must occur on the user's Windows machine. News sources may reject requests or contain title-only items, in which case the UI displays no verified articles rather than made-up content. Android can pause fetches in background. Lunar Panchang calculations, device calendar integration, and a separate Smart Butler APK need separate implementation; neither is falsely presented as complete here.

Do not rely on `evidence/build.ps1` for a current build; it contains the original developer's machine-specific path. Use the root scripts instead.
