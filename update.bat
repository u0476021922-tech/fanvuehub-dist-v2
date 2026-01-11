@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

:: ============================================================================
:: CONFIGURATION - EDIT THIS BEFORE RELEASING
:: ============================================================================
set "REPO_URL=https://github.com/u0476021922-tech/fanvue-hub-updates.git"
set "BRANCH=main"
:: ============================================================================

title Fanvue Hub - Updater
echo ============================================================================
echo   FANVUE SYSTEM UPDATER
echo ============================================================================
echo.
echo [1/3] Checking environment...

set "GIT=git_embeded\cmd\git.exe"
if not exist "%GIT%" (
    echo [ERROR] git_embeded not found! Cannot perform update.
    pause
    exit /b 1
)

:: Ensure we are ignored by git (safety check, handled by .gitignore but good to know)
if not exist .gitignore (
    echo [WARNING] .gitignore missing! Downloading latest...
    rem We could download it, but hopefully the repo has it.
)

echo [2/3] Connecting to update server...

if not exist .git (
    echo [INFO] First time update. Initializing repository...
    "%GIT%" init
    "%GIT%" remote add origin %REPO_URL%
    
    echo [INFO] Fetching latest version...
    "%GIT%" fetch origin %BRANCH%
    
    echo [INFO] Applying updates (This may take a moment)
    rem reset --hard ensures we exactly match the repo state for tracked files
    rem It will NOT delete ignored folders (ComfyUI, python_embeded, etc.)
    "%GIT%" reset --hard origin/%BRANCH%
) else (
    echo [INFO] Repository found. Pulling changes
    "%GIT%" fetch origin %BRANCH%
    "%GIT%" reset --hard origin/%BRANCH%
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Update failed!
    echo Possible reasons:
    echo  - No internet connection
    echo  - GitHub repository issues
    echo  - REPO_URL is incorrect in update.bat
    pause
    exit /b 1
)

echo.
echo [3/3] Post-Update Tasks...
echo [INFO] Checking dependencies

:: Run Prisma generate if schema changed (safe to run always)
if exist "fanvue-hub\prisma\schema.prisma" (
    echo [INFO] Regenerating database client...
    cd fanvue-hub
    if exist node_modules (
        call npx prisma generate >nul 2>&1
    )
    cd ..
)

:: Install voice samples if missing (silent, non-blocking)
echo [INFO] Installing voice samples
powershell -ExecutionPolicy Bypass -File "scripts\install_voices.ps1" >nul 2>&1

echo.
echo ============================================================================
echo   UPDATE COMPLETE!
echo ============================================================================
echo.
echo You are now running the latest version.
echo Press any key to exit.
pause
