param([switch]$Release,[ValidateSet('arm64','x86_64')][string]$Architecture='arm64')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SHA256_WINDOWS.ps1')
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$android = Join-Path $source 'apps\vce-desktop\src-tauri\gen\android'
$assets = Join-Path $android 'app\src\main\assets\voice-models'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr') }
$ndk = if ($env:NDK_HOME) { $env:NDK_HOME } else {
    $installed = @(Get-ChildItem -LiteralPath (Join-Path $sdk 'ndk') -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending)
    if ($installed.Count -eq 0) { throw 'No Android NDK found. Install an NDK with SDK Manager or set NDK_HOME.' }
    $installed[0].FullName
}
if (-not (Test-Path -LiteralPath (Join-Path $jdk 'bin\java.exe'))) { throw 'Java 21 is required. Set JAVA_HOME to an installed JDK.' }
if (-not (Test-Path -LiteralPath (Join-Path $ndk 'source.properties'))) { throw 'Android NDK is incomplete. Install it with the Android SDK Manager and set NDK_HOME.' }
if (-not (Test-Path -LiteralPath (Join-Path $sdk 'platforms\android-36\android.jar'))) { throw 'Android SDK platform 36 is required by the generated Gradle project.' }
if (-not (Test-Path -LiteralPath $android)) { throw 'Android project missing. From apps\vce-desktop run: npx tauri android init --ci' }
$rustTarget = if ($Architecture -eq 'arm64') { 'aarch64-linux-android' } else { 'x86_64-linux-android' }
$tauriTarget = if ($Architecture -eq 'arm64') { 'aarch64' } else { 'x86_64' }
$jniAbi = if ($Architecture -eq 'arm64') { 'arm64-v8a' } else { 'x86_64' }
$gradleFlavor = if ($Architecture -eq 'arm64') { 'Arm64' } else { 'X86_64' }
if (-not (rustup target list --installed | Select-String "^$rustTarget$")) { throw "Run rustup target add $rustTarget." }
$nativeCache = Join-Path $source 'tools\cache\sherpa-onnx'
$nativeArchive = Join-Path $nativeCache 'sherpa-onnx-v1.13.8-android.tar.bz2'
$nativeSource = Join-Path $source 'tools\cache\voice-release\android.tar.bz2'
$nativeHash = '2FF63469A71CB6009AA2E3ED5F4A670F8ABDCBE4BB9FFD23776AFC792A6B4F44'
if (-not (Test-Path -LiteralPath $nativeArchive)) {
    if (-not (Test-Path -LiteralPath $nativeSource)) {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($nativeSource)) | Out-Null
        $partial = $nativeSource + '.part'
        & curl.exe -L --fail --retry 3 -o $partial 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-android.tar.bz2'
        if ($LASTEXITCODE -ne 0) { throw 'Android native archive download failed.' }
        if ((Get-BuddySha256 $partial) -ne $nativeHash) { throw 'Downloaded Android native archive checksum mismatch.' }
        Move-Item -LiteralPath $partial -Destination $nativeSource
    }
    if ((Get-BuddySha256 $nativeSource) -ne $nativeHash) { throw 'Android native sherpa archive checksum mismatch.' }
    [IO.Directory]::CreateDirectory($nativeCache) | Out-Null
    Copy-Item -LiteralPath $nativeSource -Destination $nativeArchive
}
if ((Get-BuddySha256 $nativeArchive) -ne $nativeHash) { throw 'Android native sherpa archive checksum mismatch.' }

# sherpa-onnx-sys links dynamically on Android. Stage the two runtime libraries
# BestBuddy actually needs; a successful Rust link alone does not put them in the APK.
$nativeExtract = Join-Path $nativeCache 'android-extracted'
$nativeJni = Join-Path $nativeExtract "jniLibs\$jniAbi"
if (-not (Test-Path -LiteralPath (Join-Path $nativeJni 'libsherpa-onnx-c-api.so')) -or
    -not (Test-Path -LiteralPath (Join-Path $nativeJni 'libonnxruntime.so'))) {
    [IO.Directory]::CreateDirectory($nativeExtract) | Out-Null
    & tar.exe -xjf $nativeArchive -C $nativeExtract
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract the verified Android native archive.' }
}
$jniDir = Join-Path $android "app\src\main\jniLibs\$jniAbi"
[IO.Directory]::CreateDirectory($jniDir) | Out-Null
foreach ($library in @('libsherpa-onnx-c-api.so','libonnxruntime.so')) {
    $nativeLibrary = Join-Path $nativeJni $library
    if (-not (Test-Path -LiteralPath $nativeLibrary) -or (Get-Item -LiteralPath $nativeLibrary).Length -lt 100000) { throw "Android native library is incomplete: $library" }
    Copy-Item -LiteralPath $nativeLibrary -Destination (Join-Path $jniDir $library) -Force
}
Write-Host "[OK] Staged verified sherpa-onnx and ONNX Runtime libraries for $jniAbi."

& (Join-Path $PSScriptRoot 'REUSE_LOCAL_RESOURCES.ps1') -TargetRoot $source
if (-not $?) { throw 'Local voice resource reuse failed.' }
& (Join-Path $PSScriptRoot 'VERIFY_VOICE_MODELS_WINDOWS.ps1') -Root $source
if (-not $?) { throw 'Android voice assets are incomplete. Run tools\SETUP_ANDROID.cmd first.' }
[IO.Directory]::CreateDirectory($assets) | Out-Null
$groups = @(
    'asr\sherpa-onnx-whisper-base.en',
    'tts\vits-piper-en_US-lessac-medium',
    'vad', 'kws', 'denoise'
)
$modelsRoot = Join-Path $source 'models'
$manifest = [System.Collections.Generic.List[string]]::new()
foreach ($group in $groups) {
    $groupRoot = Join-Path $source (Join-Path 'models' $group)
    if (-not (Test-Path -LiteralPath $groupRoot)) { throw "Voice asset folder missing: $groupRoot" }
    foreach ($file in Get-ChildItem -LiteralPath $groupRoot -File -Recurse) {
        if (-not $file.FullName.StartsWith($modelsRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected model path: $($file.FullName)" }
        $relative = $file.FullName.Substring($modelsRoot.Length + 1).Replace('\','/')
        if ($relative -match '(^|/)(test_wavs|README|\.git)(/|\.|$)') { continue }
        $destination = Join-Path $assets $relative
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        $hash = Get-BuddySha256 $file.FullName
        if ((Test-Path -LiteralPath $destination) -and (Get-BuddySha256 $destination) -ne $hash) { Remove-Item -LiteralPath $destination -Force }
        if (-not (Test-Path -LiteralPath $destination)) {
            try { New-Item -ItemType HardLink -Path $destination -Target $file.FullName -ErrorAction Stop | Out-Null }
            catch { Copy-Item -LiteralPath $file.FullName -Destination $destination }
        }
        $manifest.Add("$($hash.ToLowerInvariant())  $($file.Length)  $relative")
    }
}
[IO.File]::WriteAllLines((Join-Path $assets 'SOURCE_SHA256.txt'), @($manifest | Sort-Object))
Write-Host "[OK] Staged $($manifest.Count) verified Android voice files (hard-linked when possible)."

$previousJava = $env:JAVA_HOME; $previousSdk = $env:ANDROID_HOME; $previousNdk = $env:NDK_HOME; $previousTarget = $env:CARGO_TARGET_DIR; $previousArchive = $env:SHERPA_ONNX_ARCHIVE_DIR; $previousPath = $env:PATH
try {
    $env:JAVA_HOME = $jdk; $env:ANDROID_HOME = $sdk; $env:NDK_HOME = $ndk
    $env:PATH = (Join-Path $jdk 'bin') + ';' + $env:PATH
    $env:CARGO_TARGET_DIR = if ($env:BUDDY_ANDROID_TARGET) { [IO.Path]::GetFullPath($env:BUDDY_ANDROID_TARGET) } else { Join-Path $env:TEMP 'buddy-android-target' }
    $env:SHERPA_ONNX_ARCHIVE_DIR = $nativeCache
    # Tauri Android canonicalizes the Gradle asset directory. A subst alias is
    # rejected as outside the physical app root, so use the real source path.
    Push-Location (Join-Path $source 'apps\vce-desktop')
    try {
        $args = @('tauri','android','build','--apk','--target',$tauriTarget,'--ci')
        if (-not $Release) { $args += '--debug' }
        $started = [DateTime]::UtcNow
        & npx.cmd @args
        if ($LASTEXITCODE -ne 0) {
            # On Windows without Developer Mode, Tauri can compile Rust but
            # cannot create its final JNI symlink. Copy that fresh library and
            # let Gradle package it without running Rust a second time.
            $kind = if ($Release) { 'release' } else { 'debug' }
            $library = Join-Path $env:CARGO_TARGET_DIR "$rustTarget\$kind\libvce_buddy_desktop_lib.so"
            if (-not (Test-Path -LiteralPath $library) -or (Get-Item -LiteralPath $library).LastWriteTimeUtc -lt $started.AddSeconds(-5)) { throw 'Android Rust build failed before JNI packaging; no fresh native library exists.' }
            $jniDir = Join-Path $android "app\src\main\jniLibs\$jniAbi"
            [IO.Directory]::CreateDirectory($jniDir) | Out-Null
            Copy-Item -LiteralPath $library -Destination (Join-Path $jniDir 'libvce_buddy_desktop_lib.so') -Force
            Push-Location $android
            try {
                $task = ":app:assemble$gradleFlavor$($kind.Substring(0,1).ToUpperInvariant())$($kind.Substring(1))"
                $skip = ":app:rustBuild$gradleFlavor$($kind.Substring(0,1).ToUpperInvariant())$($kind.Substring(1))"
                & .\gradlew.bat $task -x $skip --no-daemon
                if ($LASTEXITCODE -ne 0) { throw 'Gradle APK packaging failed after the Rust build.' }
            } finally { Pop-Location }
        }
    } finally { Pop-Location }
    $kind = if ($Release) { 'release' } else { 'debug' }
    $apks = @(Get-ChildItem -LiteralPath (Join-Path $android 'app\build\outputs\apk') -Filter '*.apk' -File -Recurse | Where-Object { $_.FullName -match "\\($Architecture|universal)\\$kind\\" })
    if ($apks.Count -eq 0) { throw 'Android build returned success but no APK was found.' }
    foreach ($apk in $apks) {
        $entries = @(& tar.exe -tf $apk.FullName)
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect APK entries.' }
        if ($apk.LastWriteTimeUtc -lt $started.AddSeconds(-5)) { throw 'Only a stale APK was found after the build.' }
        foreach ($required in @("lib/$jniAbi/libvce_buddy_desktop_lib.so","lib/$jniAbi/libsherpa-onnx-c-api.so","lib/$jniAbi/libonnxruntime.so",'assets/voice-models/SOURCE_SHA256.txt')) {
            if ($entries -notcontains $required) { throw "APK is missing required runtime entry: $required" }
        }
        Write-Host "Android APK: $($apk.FullName)"; Write-Host "SHA256: $(Get-BuddySha256 $apk.FullName)"
    }
    if ($Release) { Write-Warning 'Release APK still requires a release signing key and device acceptance before distribution.' }
} finally {
    $env:JAVA_HOME=$previousJava; $env:ANDROID_HOME=$previousSdk; $env:NDK_HOME=$previousNdk; $env:CARGO_TARGET_DIR=$previousTarget; $env:SHERPA_ONNX_ARCHIVE_DIR=$previousArchive; $env:PATH=$previousPath
}
