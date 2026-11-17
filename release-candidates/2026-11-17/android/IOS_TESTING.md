# iOS simulator testing

GitHub Actions uses a macOS runner and Xcode to test the shared Rust core,
cross-compile the mobile app, and install/launch the resulting simulator app.
It retains the build logs, launch screenshot, process check and simulator bundle.
No Apple account, signing key or device provisioning is used for this test.

The app's current `vce-platform` implementation is Android-only. A successful
simulator build/launch does **not** establish local LLM, ASR/TTS, safety, contacts,
or wake-word parity on iOS. These require the iOS platform integration and its
own tests. There is no signed iPhone IPA in this workflow.

The workflow builds from the dated source candidate, not the older repository
root. Its Actions run and artifact identify the exact commit under test.
