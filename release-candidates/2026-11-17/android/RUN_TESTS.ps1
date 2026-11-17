[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$logDir=Join-Path $root 'build-logs'
New-Item -ItemType Directory -Force -Path $logDir|Out-Null
$report=Join-Path $logDir 'TEST_FAILURE.md'
try {
  if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 20+ not installed'}
  $major=[int]((& node -v).TrimStart('v').Split('.')[0]);if($major -lt 20){throw "Node.js >=20 required, found $major"}
  foreach($f in 'ui/src/app.js','ui/src/seed.js','ui/src/news-ui.js','ui/src/market-ui.js','ui/src/market-data.js','ui/src/source-discovery.js','ui/src/settings-navigation.js'){
    & node --check (Join-Path $root $f)
    if($LASTEXITCODE -ne 0){throw "JavaScript syntax error: $f"}
  }
  & node --test (Join-Path $root 'tests/release.test.mjs')
  if($LASTEXITCODE -ne 0){throw 'Regression contract tests failed'}
  foreach($f in 'legacy-frontend-tests.mjs','legacy-launch-tests.mjs'){
    & node (Join-Path (Join-Path $root 'tests') $f)
    if($LASTEXITCODE -ne 0){throw "Preservation regression failure: $f"}
  }
  Get-Content (Join-Path $root 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json | Out-Null
  Get-Content (Join-Path $root 'vce-core/seed/content.json') -Raw | ConvertFrom-Json | Out-Null
  Get-Content (Join-Path $root 'vce-core/seed/sources.json') -Raw | ConvertFrom-Json | Out-Null
  if(Get-Command cargo -ErrorAction SilentlyContinue){
    Push-Location $root
    try { & cargo metadata --offline --format-version 1 --no-deps *> $null; if($LASTEXITCODE -ne 0){throw 'Cargo metadata verification failed'}
      & cargo test -p vce-core --locked
      if($LASTEXITCODE -ne 0){throw 'Rust vce-core regression tests failed'} }finally{Pop-Location}
  }
  if(Test-Path $report){Remove-Item -LiteralPath $report -Force}
  Write-Host 'PASS: static, content, routing and version tests' -ForegroundColor Green
  exit 0
}catch{
  @('# BestBuddy_Android_V1.10.0 Test Failure','',"- Error: $($_.Exception.Message)","- Time: $(Get-Date -Format o)",'- Do not promote this build. Fix and rerun tests.')|Set-Content -LiteralPath $report -Encoding UTF8
  Write-Error $_
  exit 1
}
