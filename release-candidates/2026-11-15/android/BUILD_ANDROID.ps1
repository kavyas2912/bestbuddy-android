# BestBuddy Android V1.11.7 - Windows PowerShell 5.1 / PowerShell 7
# Read-only checks before invoking build; no dependency installation or destructive cleanup.
[CmdletBinding()]
param([switch]$Release, [switch]$Bundle, [switch]$Offline, [string]$SdkPath, [string]$JdkPath, [string]$NdkPath)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$logs=Join-Path $root 'build-logs'; $out=Join-Path $root 'out'
New-Item -ItemType Directory -Force -Path $logs,$out | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$log=Join-Path $logs "android-$stamp.log"
$failure=Join-Path $logs 'BUILD_FAILURE.md'
$summary=Join-Path $logs "android-$stamp-summary.txt"
function Stop-Build([string]$message) { 
  @('# Android build failure','',"Time: $(Get-Date -Format o)","Reason: $message","Log: $log",'The previous APK, if any, has not been promoted.') | Set-Content -LiteralPath $failure -Encoding UTF8
  Write-Host "BUILD FAILED: $message" -ForegroundColor Red
  Write-Host "Details: $failure"
  exit 1
}
# Normalize Windows paths that were stored with literal quote characters.
# Example: JAVA_HOME="C:\Program Files\Android\openjdk\jdk-21.0.8"
function Normalize-Directory([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $null }
  $p=$value.Trim()
  while ($p.Length -ge 2 -and (($p[0] -eq '"' -and $p[$p.Length-1] -eq '"') -or ($p[0] -eq "'" -and $p[$p.Length-1] -eq "'"))) {
    $p=$p.Substring(1,$p.Length-2).Trim()
  }
  if ($p.StartsWith('"') -or $p.StartsWith("'")) {
    throw "Malformed quoted path: $value. Remove literal quotation marks from the environment variable."
  }
  return $p
}
function Resolve-Exe([string]$name) {
  $c=Get-Command $name -ErrorAction SilentlyContinue
  if(-not $c){throw "Required command not found: $name"}
  return $c.Source
}
function Invoke-Logged([string]$exe,[string[]]$arguments) {
  # Redirecting a native process's stderr through the PowerShell pipeline can
  # generate NativeCommandError under Windows PowerShell 5.1. Do not treat text
  # written to stderr as failure; only the native process exit code is authoritative.
  Write-Host ("RUN: " + $exe + ' ' + ($arguments -join ' '))
  $old=$ErrorActionPreference
  $ErrorActionPreference='Continue'
  try {
    & $exe @arguments 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
    $code=$LASTEXITCODE
  } finally { $ErrorActionPreference=$old }
  if($code -ne 0){throw "Command failed (exit $code): $exe $($arguments -join ' ')"}
}
try {
  # Discover JDKs from explicit path, standard Java installations, Android OpenJDK,
  # Adoptium and Android Studio. Validate Java AND javac are actually version 21.
  # A stale JAVA_HOME must never override a valid JDK 21 installation.
  $candidates=New-Object 'System.Collections.Generic.List[string]'
  if($JdkPath){[void]$candidates.Add($JdkPath)}
  $javaRoot=Join-Path $env:ProgramFiles 'Java'
  if(Test-Path -LiteralPath $javaRoot){
    Get-ChildItem -LiteralPath $javaRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object {[void]$candidates.Add($_.FullName)}
  }
  $androidJdk=Join-Path $env:ProgramFiles 'Android\openjdk'
  if(Test-Path -LiteralPath $androidJdk){
    Get-ChildItem -LiteralPath $androidJdk -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object {[void]$candidates.Add($_.FullName)}
  }
  $adoptium=Join-Path $env:ProgramFiles 'Eclipse Adoptium'
  if(Test-Path -LiteralPath $adoptium){
    Get-ChildItem -LiteralPath $adoptium -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending | ForEach-Object {[void]$candidates.Add($_.FullName)}
  }
  if($env:JAVA_HOME){[void]$candidates.Add($env:JAVA_HOME)}
  [void]$candidates.Add((Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'))
  $jdk=$null
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach($raw in $candidates){
    $c=Normalize-Directory $raw
    if(-not $c -or -not $seen.Add($c)){continue}
    $javaExe=Join-Path $c 'bin\java.exe'
    $javacExe=Join-Path $c 'bin\javac.exe'
    if(-not (Test-Path -LiteralPath $javaExe -PathType Leaf) -or -not (Test-Path -LiteralPath $javacExe -PathType Leaf)){continue}
    $oldPref=$ErrorActionPreference; $ErrorActionPreference='Continue'
    try {
      $javaVersion=(& $javaExe -version 2>&1 | Out-String)
      $javaExit=$LASTEXITCODE
      $javacVersion=(& $javacExe -version 2>&1 | Out-String)
      $javacExit=$LASTEXITCODE
    } finally {$ErrorActionPreference=$oldPref}
    if($javaExit -eq 0 -and $javacExit -eq 0 -and
       $javaVersion -match '(?m)(?:openjdk|java) version "21\.|openjdk 21\.' -and
       $javacVersion -match '(?m)javac 21\.'){ $jdk=$c;break }
    Write-Host "Skipping incompatible JDK: $c (java=$($javaVersion.Trim()); javac=$($javacVersion.Trim()))"
  }
  if($JdkPath -and (Normalize-Directory $JdkPath) -ne $jdk){throw "The requested -JdkPath does not contain a valid Java 21 JDK: $JdkPath"}
  if(-not $jdk){throw 'JDK 21 not found. Check C:\Program Files\Java or pass -JdkPath "C:\Program Files\Java\jdk-21". Both bin\java.exe and bin\javac.exe must report version 21.'}
  $env:JAVA_HOME=$jdk; $env:PATH=(Join-Path $jdk 'bin')+';'+$env:PATH
  $oldPref=$ErrorActionPreference; $ErrorActionPreference='Continue'
  try { $javaVersion=& (Join-Path $jdk 'bin\java.exe') -version 2>&1 | Out-String } finally { $ErrorActionPreference=$oldPref }
  if($LASTEXITCODE -ne 0 -or $javaVersion -notmatch '(?m)(?:openjdk|java) version "21\.|openjdk 21\.'){throw "Expected JDK 21, found: $javaVersion"}
  $sdk=if($SdkPath){$SdkPath}elseif($env:ANDROID_HOME){$env:ANDROID_HOME}elseif($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}else{Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
  $sdk=Normalize-Directory $sdk
  if(-not (Test-Path -LiteralPath $sdk)){throw "Android SDK not found: $sdk"}
  $env:ANDROID_HOME=$sdk; $env:ANDROID_SDK_ROOT=$sdk
  $ndk=if($NdkPath){$NdkPath}elseif($env:NDK_HOME){$env:NDK_HOME}else{$null}
  $ndk=Normalize-Directory $ndk
  if(-not $ndk){
    $ndks=Join-Path $sdk 'ndk'
    if(Test-Path $ndks){
      $ndk=Get-ChildItem $ndks -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'source.properties')} | Sort-Object {try{[version]$_.Name}catch{[version]'0.0'}} -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
  }
  if(-not $ndk -or -not (Test-Path (Join-Path $ndk 'source.properties'))){throw 'Android NDK missing. Install a compatible SDK NDK or specify -NdkPath.'}
  $ndk=Normalize-Directory $ndk
  $env:NDK_HOME=$ndk; $env:ANDROID_NDK_HOME=$ndk
  $node=Resolve-Exe 'node'; $cargo=Resolve-Exe 'cargo'
  $major=[int]((& $node -v).TrimStart('v').Split('.')[0]);if($major -lt 20){throw 'Node.js 20+ is required'}
  $oldPref=$ErrorActionPreference; $ErrorActionPreference='Continue'
  try { $tauriVersion=& $cargo tauri --version 2>&1 | Out-String } finally { $ErrorActionPreference=$oldPref }
  if($LASTEXITCODE -ne 0 -or $tauriVersion -notmatch 'tauri-cli 2\.|cargo-tauri 2\.|tauri 2\.'){throw "cargo-tauri CLI v2 required. Found: $tauriVersion"}
  $env:CARGO_BUILD_JOBS='2';$env:GRADLE_OPTS='-Dorg.gradle.workers.max=2'
  $env:CARGO_TARGET_DIR=Join-Path $root 'target'
  if($Offline){$env:CARGO_NET_OFFLINE='true'}
  Write-Host "JDK: $jdk`nSDK: $sdk`nNDK: $ndk`nTauri: $tauriVersion"
  # Regression tests are deliberately NOT run by the build script.
  # The device owner runs RUN_TESTS.ps1 separately when desired.
  $config=Get-Content -LiteralPath (Join-Path $root 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json
  $releaseVersion=$config.version
  $displayName=[Security.SecurityElement]::Escape($config.productName)
  $strings=Join-Path $root 'src-tauri/gen/android/app/src/main/res/values/strings.xml'
  [xml]$resources=Get-Content -LiteralPath $strings -Raw
  foreach($key in 'app_name','main_activity_title'){
    $entry=$resources.resources.SelectSingleNode("string[@name='$key']")
    if(-not $entry){throw "Missing Android label $key"}
    $entry.InnerText=$config.productName
  }
  $resources.Save($strings)
  $cargoManifest=Get-Content -LiteralPath (Join-Path $root 'src-tauri/Cargo.toml') -Raw
  if($cargoManifest -notmatch ('(?m)^version = "'+[regex]::Escape($releaseVersion)+'"')){throw 'Cargo and Tauri versions disagree'}
  $htmlPath=Join-Path $root 'ui/index.html'
  $html=Get-Content -LiteralPath $htmlPath -Raw
  if(-not $html.Contains('V'+$releaseVersion)){throw 'Visible app version and Tauri version disagree'}
  $main=Join-Path $root 'src-tauri\gen\android\app\src\main'
  $dest=Join-Path $main 'java\app\vce\platform'
  $assets=Join-Path $main 'assets'
  if(-not (Test-Path $dest) -or -not (Test-Path $assets)){throw 'Generated Android project missing. Restore the approved V1.07.6 generated project; no regeneration was attempted.'}
  $native=Join-Path $root 'android-plugins\vce-platform'
  foreach($file in (Get-ChildItem $native -Filter '*.kt' -File)){Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $dest $file.Name) -Force}
  foreach($f in @('models.json','legacy-models.json','connections.json')){Copy-Item -LiteralPath (Join-Path $native $f) -Destination (Join-Path $assets ('vce-'+$f)) -Force}
  $apkDir=Join-Path $root 'src-tauri\gen\android\app\build\outputs\apk'
  $started=Get-Date
  Push-Location $root
  try {
    $args=@('tauri','android','build','--target','aarch64','--apk','--ci')
    if($Bundle){$args+='--aab'}
    if(-not $Release){$args+= '--debug'}
    Invoke-Logged $cargo $args
  } finally {Pop-Location}
  $type=if($Release){'release'}else{'debug'}
  $apk=Get-ChildItem $apkDir -Filter '*.apk' -Recurse -File -ErrorAction SilentlyContinue | Where-Object {$_.FullName -match "[\\/]$type[\\/]" -and $_.LastWriteTime -ge $started.AddSeconds(-5)} | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if(-not $apk){throw "Build succeeded but no NEW $type APK was found. An older APK will not be reused."}
  $name="BestBuddy_Companion_V$releaseVersion-arm64-$type.apk"
  $output=Join-Path $out $name
  Copy-Item -LiteralPath $apk.FullName -Destination $output -Force
  $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $output).Hash
  @("APK=$output","SHA256=$hash","Source=$($apk.FullName)","Created=$(Get-Date -Format o)","Mode=$type","Log=$log",'NOTE: Device installation and voice/media behavior require physical-device testing.') | Set-Content -LiteralPath $summary -Encoding UTF8
  if(Test-Path $failure){Remove-Item $failure -Force}
  Write-Host "BUILD SUCCEEDED: $output" -ForegroundColor Green
  Write-Host "SHA256: $hash"
  if($Release){Write-Warning 'Release APK signing and installation must be verified before distribution.'}
  exit 0
} catch { Stop-Build $_.Exception.Message }
