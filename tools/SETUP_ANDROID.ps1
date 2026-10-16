param([ValidateSet('arm64','x86_64')][string]$Architecture = 'arm64')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($command in @('cargo','rustup','node','npm.cmd','python','curl.exe','tar.exe')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command missing: $command" }
}
Push-Location (Join-Path $root 'apps/vce-desktop')
try {
    & npm.cmd ci --ignore-scripts --include=optional --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Locked frontend dependency installation failed.' }
    & node node_modules/esbuild/install.js
    if ($LASTEXITCODE -ne 0) { throw 'esbuild setup failed.' }
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Reminder tests failed.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }
$target = if ($Architecture -eq 'arm64') { 'aarch64-linux-android' } else { 'x86_64-linux-android' }
& rustup target add $target
if ($LASTEXITCODE -ne 0) { throw 'Rust Android target installation failed.' }
& python (Join-Path $PSScriptRoot 'prepare_voice_models.py') --target-root $root --cache (Join-Path $PSScriptRoot 'cache/voice-models')
if ($LASTEXITCODE -ne 0) { throw 'Verified voice model preparation failed.' }
Write-Host 'Android source dependencies and voice models prepared. Run tools\BUILD_ANDROID_WINDOWS.ps1 to validate the SDK/NDK and build the APK.'
