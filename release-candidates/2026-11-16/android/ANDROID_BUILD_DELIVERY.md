# Android source + build-script delivery

This package is the current V1.08.0 companion source candidate with a rewritten Windows Android build launcher. **It is not a completed V1.08.0 release**. Do not uninstall the tested V1.07.6 APK.

## Windows build

From the extracted project root, run `BUILD_ANDROID.cmd` or `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\BUILD_ANDROID.ps1`.

Optional: `-JdkPath 'C:\Program Files\Android\openjdk\jdk-21.0.8' -SdkPath "$env:LOCALAPPDATA\Android\Sdk" -NdkPath '...\ndk\<installed-version>'`. Add `-Offline` only when all required artifacts are already cached. Add `-Release` only with a configured signing setup.

Build checks JDK 21, Android SDK, installed NDK, Node >=20, Rust cargo and cargo-tauri 2. It runs existing tests, synchronizes Android plugin sources, builds ARM64 APK, rejects stale APKs, copies the result to `out`, and records SHA-256 and diagnostics. It does not install dependencies, overwrite baseline sources, or alter system settings.

## Verification boundaries

JavaScript syntax and Node release/legacy tests were executed in the current Linux environment. The Windows PowerShell script was statically reviewed but **not executed** because Windows PowerShell, JDK, Android SDK, NDK and Rust toolchain are unavailable here. Therefore no Android APK build or device test is claimed. This package is an actionable source and build-script handoff, not a verified final release.
