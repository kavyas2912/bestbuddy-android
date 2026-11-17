@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD_ANDROID.ps1" %*
set "result=%ERRORLEVEL%"
if not "%result%"=="0" (
  echo BUILD FAILED - see build-logs\BUILD_FAILURE.md
) else (
  echo BUILD SUCCEEDED - see out\BestBuddy_Android_V1.10.0-arm64-debug.apk
)
exit /b %result%
