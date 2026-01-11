@echo off
cd /d "%~dp0.."

echo ============================================================================
echo   VoxCPM Voice Pack Downloader
echo ============================================================================
echo.

:: Admin Check
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b
)

echo Starting voice download...
powershell -ExecutionPolicy Bypass -File "scripts\install_voices.ps1"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Voice installation failed!
    pause
    exit /b %errorlevel%
)

echo.
echo Voice pack installed successfully!
echo You can now use these voices in the Lipsync section.
pause
