@echo off
cd /d "%~dp0.."

echo ============================================================================
echo   Downloading EMMA LoRA Pack
echo ============================================================================
echo.

:: Admin Check
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
    exit /b
)

echo Handing over to PowerShell...
powershell -ExecutionPolicy Bypass -File "scripts\download_emma.ps1"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Download script failed!
    pause
    exit /b %errorlevel%
)
