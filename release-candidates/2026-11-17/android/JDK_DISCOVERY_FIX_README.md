# BestBuddy Android — JDK discovery correction

This package is the previously supplied V1.08.0 source candidate with a targeted Windows build-script correction. It is **not** the complete Companion Experience Edition.

## Fix
- Detects JDK installations under `C:\Program Files\Java\*` before falling back to Android OpenJDK, Adoptium, `JAVA_HOME` and Android Studio.
- Validates `java.exe` **and** `javac.exe` report Java 21; skips incompatible versions.
- Supports explicit `-JdkPath` override; reports detected JDK.
- Preserves all existing source files and Android build operations.

## Run
`BUILD_ANDROID.cmd`

Or select a specific JDK:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\BUILD_ANDROID.ps1 -JdkPath "C:\Program Files\Java\jdk-21"`

## Verification
Archive integrity and patch assertions checked in this environment. Windows PowerShell and Android build execution **not** verified here.
