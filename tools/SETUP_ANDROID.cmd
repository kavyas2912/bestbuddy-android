@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_ANDROID.ps1" %*
endlocal & exit /b %ERRORLEVEL%
