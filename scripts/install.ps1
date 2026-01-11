# ============================================================================ 
# FEDDAKALKUN ComfyUI - Ultimate Portable Installer
# ============================================================================ 

$ErrorActionPreference = "Stop"
$ScriptPath = $PSScriptRoot
$RootPath = Split-Path -Parent $ScriptPath
$RootPath = (Resolve-Path $RootPath).Path  # Ensure absolute path
Set-Location $RootPath

# Toggle to pause after each major step for review
$PauseEachStep = $false

Write-Host "Installation root: $RootPath"


# Always create logs directory at the root (not inside custom_nodes)
$LogsDir = Join-Path $RootPath "logs"
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir | Out-Null }
$LogFile = Join-Path $LogsDir "install_log.txt"

function Write-Log {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] $Message"
    Write-Host $Message
    
    # Add mutex to prevent concurrent write errors
    $MaxRetries = 5
    $RetryCount = 0
    while ($RetryCount -lt $MaxRetries) {
        try {
            Add-Content -Path $LogFile -Value $LogEntry -ErrorAction Stop
            break
        }
        catch {
            $RetryCount++
            Start-Sleep -Milliseconds 100
            if ($RetryCount -eq $MaxRetries) {
                # Silently fail after retries to avoid breaking the install
                Write-Host "[WARNING] Could not write to log file after $MaxRetries attempts"
            }
        }
    }
}

function Download-File {
    param([string]$Url, [string]$Dest)
    if (-not (Test-Path $Dest)) {
        Write-Log "Downloading $(Split-Path $Dest -Leaf)..."
        try {
            Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
        }
        catch {
            Write-Log "ERROR: Failed to download $Url"
            throw $_ 
        }
    }
}

function Extract-Zip {
    param([string]$ZipFile, [string]$DestDir)
    Write-Log "Extracting $(Split-Path $ZipFile -Leaf)..."
    Expand-Archive -Path $ZipFile -DestinationPath $DestDir -Force
}

# Pause helper for step-by-step review
function Pause-Step {
    if ($PauseEachStep) {
        Read-Host "Step complete. Press Enter to continue"
    }
}

Write-Log "========================================="
Write-Log "Portable Installation Started"
Write-Log "========================================="

# ============================================================================ 
# 1. BOOTSTRAP PORTABLE TOOLS
# ============================================================================ 

# --- 1.1 Portable Python ---
$PyDir = Join-Path $RootPath "python_embeded"
$PyExe = Join-Path $PyDir "python.exe"

if (-not (Test-Path $PyExe)) {
    Write-Log "[ComfyUI 1/9] Setting up Portable Python..."
    $PyZip = Join-Path $RootPath "python_embed.zip"
    Download-File "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip" $PyZip
    
    New-Item -ItemType Directory -Path $PyDir -Force | Out-Null
    Extract-Zip $PyZip $PyDir
    Remove-Item $PyZip -Force

    # --- CRITICAL FIX: Configure python311._pth ---
    # 1. Enable site-packages (import site)
    # 2. Add ../ComfyUI to path so 'import comfy' works
    $PthFile = Join-Path $PyDir "python311._pth"
    $Content = Get-Content $PthFile
    $Content = $Content -replace "#import site", "import site"
    
    if ($Content -notcontains "../ComfyUI") {
        $Content += "../ComfyUI"
    }
    
    Set-Content -Path $PthFile -Value $Content
    Write-Log "Portable Python configured (Path fixed)."

    # Install Pip
    Write-Log "Installing Pip..."
    $GetPip = Join-Path $RootPath "get-pip.py"
    Download-File "https://bootstrap.pypa.io/get-pip.py" $GetPip
    Start-Process -FilePath $PyExe -ArgumentList "$GetPip" -NoNewWindow -Wait
    Remove-Item $GetPip -Force
}
else {
    Write-Log "[ComfyUI 1/9] Portable Python found."
}

Pause-Step

# --- 1.2 Portable Git (MinGit) ---
$GitDir = Join-Path $RootPath "git_embeded"
$GitExe = Join-Path $GitDir "cmd\git.exe"

if (-not (Test-Path $GitExe)) {
    Write-Log "[ComfyUI 2/9] Setting up Portable Git..."
    $GitZip = Join-Path $RootPath "mingit.zip"
    Download-File "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/MinGit-2.43.0-64-bit.zip" $GitZip
    
    New-Item -ItemType Directory -Path $GitDir -Force | Out-Null
    Extract-Zip $GitZip $GitDir
    Remove-Item $GitZip -Force
    Write-Log "Portable Git configured."
}
else {
    Write-Log "[ComfyUI 2/9] Portable Git found."
}

Pause-Step

# --- 1.3 Portable Node.js ---
$NodeDir = Join-Path $RootPath "node_embeded"
$NodeExe = Join-Path $NodeDir "node.exe"

if (-not (Test-Path $NodeExe)) {
    Write-Log "[ComfyUI 3/9] Setting up Portable Node.js..."
    $NodeZip = Join-Path $RootPath "node.zip"
    Download-File "https://nodejs.org/dist/v20.11.0/node-v20.11.0-win-x64.zip" $NodeZip
    
    Extract-Zip $NodeZip $RootPath
    $ExtractedNode = Get-ChildItem -Path $RootPath -Directory -Filter "node-v*-win-x64" | Select-Object -First 1
    if ($ExtractedNode) {
        Rename-Item -Path $ExtractedNode.FullName -NewName "node_embeded"
    }
    Remove-Item $NodeZip -Force
    Write-Log "Portable Node.js configured."
}
else {
    Write-Log "[ComfyUI 3/9] Portable Node.js found."
}

Pause-Step

# Helper to run commands with portable environment
$env:PATH = "$GitDir\cmd;$NodeDir;$PyDir;$PyDir\Scripts;$env:PATH"

function Run-Pip {
    param([string]$Arguments)
    $Process = Start-Process -FilePath $PyExe -ArgumentList "-m pip $Arguments" -NoNewWindow -Wait -PassThru
    if ($Process.ExitCode -ne 0) {
        Write-Log "WARNING: Pip command failed: $Arguments"
    }
}

function Run-Git {
    param([string]$Arguments)
    $Process = Start-Process -FilePath $GitExe -ArgumentList "$Arguments" -NoNewWindow -Wait -PassThru
    return $Process.ExitCode
}

# ============================================================================ 
# 3. COMPONENT INSTALLERS
# ============================================================================ 

function Install-FanvueHub {
    Write-Log "`n[Fanvue Hub] Installing dependencies..."
    $HubDir = Join-Path $RootPath "fanvue-hub"
    
    if (-not (Test-Path $HubDir)) {
        Write-Log "ERROR: fanvue-hub directory missing!"
        return
    }

    Set-Location $HubDir
    # Use portable node
    & "$NodeExe" "npm" "install" "--legacy-peer-deps"
    
    Write-Log "[Fanvue Hub] Initializing Database..."
    & "$NodeExe" "npx" "prisma" "generate"
    & "$NodeExe" "npx" "prisma" "db" "push"
    
    Set-Location $RootPath
    Write-Log "[Fanvue Hub] Setup complete."
    Pause-Step
}

function Install-Ollama {
    Write-Log "`n[Ollama] Setting up Ollama..."
    $OllamaDir = Join-Path $RootPath "ollama_embeded"
    $OllamaExe = Join-Path $OllamaDir "ollama.exe"
    
    if (-not (Test-Path $OllamaExe)) {
        New-Item -ItemType Directory -Path $OllamaDir -Force | Out-Null
        
        $OllamaZip = Join-Path $OllamaDir "ollama.zip"
        $OllamaUrl = "https://github.com/ollama/ollama/releases/download/v0.5.4/ollama-windows-amd64.zip"
        
        Write-Log "Downloading Ollama portable binary..."
        Download-File $OllamaUrl $OllamaZip
        
        Write-Log "Extracting Ollama..."
        Extract-Zip $OllamaZip $OllamaDir
        Remove-Item $OllamaZip -Force
        
        Write-Log "[Ollama] Installed successfully."
    }
    else {
        Write-Log "[Ollama] Already installed."
    }
    Pause-Step
}

function Install-VoxCPM {
    Write-Log "`n[VoxCPM] Setting up VoxCPM..."
    $VoxDir = Join-Path $RootPath "VoxCPM"
    
    if (-not (Test-Path $VoxDir)) {
        Write-Log "Cloning VoxCPM..."
        Run-Git "clone https://github.com/OpenBMB/VoxCPM.git `"$VoxDir`""
    }
    
    if (Test-Path $VoxDir) {
        Write-Log "Installing VoxCPM dependencies (via portable pip)..."
        Set-Location $VoxDir
        Run-Pip "install ."
        Set-Location $RootPath
        Write-Log "[VoxCPM] Installed successfully."
    }
    else {
        Write-Log "ERROR: VoxCPM directory missing."
    }
    Pause-Step
}

# ============================================================================ 
# 2. INSTALLATION LOGIC
# ============================================================================ 

# 4. Setup ComfyUI Repository
Write-Log "`n[ComfyUI 4/9] Setting up ComfyUI repository..."
$ComfyDir = Join-Path $RootPath "ComfyUI"
if (-not (Test-Path $ComfyDir)) {
    Write-Log "Cloning ComfyUI repository (official)..."
    try {
        Run-Git "clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git `"$ComfyDir`""
        Write-Log "ComfyUI cloned successfully."
    }
    catch {
        Write-Log "ERROR: Failed to clone ComfyUI repository."
        exit 1
    }
}
else {
    Write-Log "ComfyUI directory already exists."
}

Pause-Step

# 5. Core Dependencies
Write-Log "`n[ComfyUI 5/9] Installing core dependencies..."
$ComfyDir = Join-Path $RootPath "ComfyUI"

Write-Log "Upgrading pip..."
Run-Pip "install --upgrade pip wheel setuptools"

Write-Log "Installing PyTorch (CUDA)..."
Run-Pip "install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118"
if ($LASTEXITCODE -ne 0) {
    Write-Log "CUDA PyTorch failed, trying CPU..."
    Run-Pip "install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu"
}

Write-Log "Installing ComfyUI requirements..."
$ReqFile = Join-Path $ComfyDir "requirements.txt"
Run-Pip "install -r $ReqFile"

Write-Log "Installing core dependencies..."
Run-Pip "install numpy scipy matplotlib pillow tqdm requests psutil"

Pause-Step

# 6. Custom Nodes Installation
Write-Log "`n[ComfyUI 6/9] Installing Custom Nodes..."
$NodesConfig = Get-Content (Join-Path $RootPath "config\nodes.json") | ConvertFrom-Json
$CustomNodesDir = Join-Path $ComfyDir "custom_nodes"

$InstalledCount = 0
$SkippedCount = 0
$FailedCount = 0

foreach ($Node in $NodesConfig) {
    # Skip local nodes (e.g., AutoModelFetcher)
    if ($Node.local -eq $true) {
        Write-Log "[$($Node.name)] - Local node, skipping git clone"
        continue
    }
    
    $NodeDir = Join-Path $CustomNodesDir $Node.folder
    if (-not (Test-Path $NodeDir)) {
        Write-Log "Installing $($Node.name)..."
        Run-Git "clone --depth 1 $($Node.url) `"$NodeDir`""
        if ($LASTEXITCODE -eq 0) {
            Write-Log "[$($Node.name)] - Installed successfully"
            $InstalledCount++
            
            # Install node requirements if requirements.txt exists
            $NodeReqFile = Join-Path $NodeDir "requirements.txt"
            if (Test-Path $NodeReqFile) {
                Write-Log "[$($Node.name)] - Installing node requirements..."
                
                # Create a filtered requirements file (skip insightface - installed globally)
                $RequirementsContent = Get-Content $NodeReqFile
                $FilteredRequirements = $RequirementsContent | Where-Object { $_ -notmatch '^\s*insightface' }
                
                if ($FilteredRequirements.Count -lt $RequirementsContent.Count) {
                    Write-Log "[$($Node.name)] - Skipping insightface (already installed globally)"
                    $TempReqFile = Join-Path $NodeDir "requirements_filtered.txt"
                    Set-Content -Path $TempReqFile -Value $FilteredRequirements
                    Run-Pip "install -r `"$TempReqFile`" --no-warn-script-location"
                    Remove-Item $TempReqFile -Force
                }
                else {
                    Run-Pip "install -r `"$NodeReqFile`" --no-warn-script-location"
                }
            }
            
            # Create __init__.py if missing
            $InitFile = Join-Path $NodeDir "__init__.py"
            if (-not (Test-Path $InitFile)) {
                # Ensure the directory exists first
                if (-not (Test-Path $NodeDir)) {
                    New-Item -ItemType Directory -Path $NodeDir -Force | Out-Null
                }
                $InitContent = @"
# $($Node.folder) - Custom nodes for ComfyUI
import sys
import os
from pathlib import Path

current_dir = os.path.dirname(__file__)
if current_dir not in sys.path:
    sys.path.append(current_dir)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
"@
                Set-Content -Path $InitFile -Value $InitContent
            }
        }
        else {
            Write-Log "[$($Node.name)] - Failed to install"
            $FailedCount++
        }
    }
    else {
        Write-Log "[$($Node.name)] - Already present"
        $SkippedCount++
    }
}

# --- CRITICAL FIX: Patch Efficiency Nodes ---
$EffNodeFile = Join-Path $CustomNodesDir "Efficiency-Nodes\py\smZ_cfg_denoiser.py"
if (Test-Path $EffNodeFile) {
    Write-Log "Patching Efficiency Nodes..."
    $EffContent = Get-Content $EffNodeFile -Raw
    if ($EffContent -match "CompVisVDenoiser") {
        $EffContent = $EffContent.Replace(
            "from comfy.samplers import KSampler, CompVisVDenoiser, KSamplerX0Inpaint",
            "from comfy.samplers import KSampler, KSamplerX0Inpaint"
        )
        $EffContent = $EffContent.Replace(
            "from comfy.k_diffusion.external import CompVisDenoiser",
            "from comfy.k_diffusion.external import CompVisDenoiser, CompVisVDenoiser"
        )
        Set-Content -Path $EffNodeFile -Value $EffContent
        Write-Log "Efficiency Nodes patched successfully."
    }
}

# Enforce compatible OpenCV setup (opencv-python for transparent-background, contrib for extras)
Write-Log "Cleaning up OpenCV variants (headless conflicts)..."
Run-Pip "uninstall -y opencv-python-headless opencv-contrib-python-headless"
Write-Log "Installing opencv-python (required by transparent-background)..."
Run-Pip "install opencv-python>=4.6.0.66"
Write-Log "Installing opencv-contrib-python (optional extras)..."
Run-Pip "install opencv-contrib-python"

Pause-Step

# 7. Comprehensive Dependencies (Updated with fixes)
Write-Log "`n[ComfyUI 7/9] Installing comprehensive dependencies..."

# 7.1 Install Build Tools first (Fix for llama-cpp-python and insightface)
Write-Log "Installing build dependencies..."
Run-Pip "install scikit-build-core cmake ninja Cython"

# 7.1.5 Install insightface early with pre-built wheel (avoid compilation)
Write-Log "Installing insightface (pre-built wheel)..."
Run-Pip "install insightface --prefer-binary --no-build-isolation"

# 7.2 Main Dependencies
$Deps = @(
    "accelerate", "transformers", "diffusers", "safetensors",
    "huggingface-hub", "onnxruntime-gpu", "onnxruntime", "omegaconf",
    "aiohttp", "aiohttp-sse",
    "pytube", "yt-dlp", "moviepy", "youtube-transcript-api",
    "numba",
    "imageio", "imageio-ffmpeg", "av",
    "gdown", "pandas", "reportlab", "google-auth>=2.45.0", "google-auth-oauthlib", "google-auth-httplib2",
    "GPUtil", "wandb",
    "piexif", "rembg",
    "pillow-heif",
    "librosa", "soundfile",
    "webdriver-manager", "beautifulsoup4", "lxml", "shapely",
    "deepdiff", "fal_client", "matplotlib", "scipy", "scikit-image", "scikit-learn",
    "timm", "colour-science", "blend-modes", "loguru"
)
Run-Pip "install $($Deps -join ' ')"

# 7.3 Install llama-cpp-python separately (with pre-built wheel preference)
Write-Log "Installing llama-cpp-python..."
# Try installing with --prefer-binary to avoid building from source if possible
Run-Pip "install llama-cpp-python --prefer-binary --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu118"

Pause-Step


# 8. Install Custom Assets (styles.csv only - workflows excluded in free version)
Write-Log "`n[ComfyUI 8/9] Installing Custom Assets..."

# Install styles.csv to ComfyUI root
$StylesSrc = Join-Path $RootPath "assets\styles.csv"
if (Test-Path $StylesSrc) {
    Copy-Item -Path $StylesSrc -Destination $ComfyDir -Force
    Write-Log "Installed styles.csv for Styles CSV Loader node."
}
else {
    Write-Log "styles.csv not found, skipping."
}


Pause-Step

# ============================================================================ 
# 8.5 INSTALL CHARACTER WORKFLOW NODES (Optional but Recommended)
# ============================================================================ 

Write-Log "`n[ComfyUI 8.5/9] Installing Character Workflow Nodes..."
Write-Log "  - ComfyUI-Impact-Pack (SAM, FaceDetailer)"
Write-Log "  - ComfyUI InstantID (facial identity)"
Write-Log "  - AutoCropFaces (intelligent detection)"
Write-Log "  - Chibi Nodes (UI components)"

$CustomNodesDir = Join-Path $ComfyDir "custom_nodes"

# Helper function for node installation
function Install-CustomNode {
    param([string]$NodeName, [string]$RepoUrl, [string]$FolderName)
    
    $NodeDir = Join-Path $CustomNodesDir $FolderName
    
    if (-not (Test-Path $NodeDir)) {
        Write-Log "  Installing $NodeName..."
        try {
            Set-Location $CustomNodesDir
            & git clone $RepoUrl $FolderName
            
            # Install requirements if requirements.txt exists and is not empty
            $ReqFile = Join-Path $NodeDir "requirements.txt"
            if (Test-Path $ReqFile) {
                $reqContent = Get-Content $ReqFile -Raw
                if ($reqContent.Trim().Length -gt 0) {
                    Write-Log "    Installing dependencies for $NodeName..."
                    & $PyExe -m pip install -r $ReqFile
                }
                else {
                    Write-Log "    requirements.txt is empty, skipping pip install."
                }
            }
            else {
                Write-Log "    No requirements.txt found, skipping pip install."
            }
            
            Write-Log "  ✓ $NodeName installed successfully"
        }
        catch {
            Write-Log "  ⚠️  WARNING: Failed to install $NodeName (non-fatal)"
            Write-Log "    You can install it manually later or skip it"
        }
    }
    else {
        Write-Log "  ✓ $NodeName already installed"
    }
}


# Install character workflow nodes
Install-CustomNode "ComfyUI-Impact-Pack" "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git" "ComfyUI-Impact-Pack"
Install-CustomNode "ComfyUI InstantID" "https://github.com/cubiq/ComfyUI_InstantID.git" "comfyui_instantid"
Install-CustomNode "AutoCropFaces" "https://github.com/liusida/ComfyUI-AutoCropFaces.git" "ComfyUI-AutoCropFaces"
Install-CustomNode "Chibi Nodes" "https://github.com/CheapCyborg/Chibi-Nodes.git" "chibi"
Install-CustomNode "ComfyUI_LayerStyle_Advance" "https://github.com/chflame163/ComfyUI_LayerStyle_Advance.git" "ComfyUI_LayerStyle_Advance"

Set-Location $RootPath
Write-Log "Character workflow nodes installation complete."

Pause-Step

# 9. Configure ComfyUI-Manager Security (Weak Mode)
Write-Log "`n[ComfyUI 9/9] Configuring ComfyUI-Manager Security..."
$ManagerConfigDir = Join-Path $ComfyDir "user\default\ComfyUI-Manager"
$ManagerConfigFile = Join-Path $ManagerConfigDir "config.ini"

if (-not (Test-Path $ManagerConfigDir)) {
    New-Item -ItemType Directory -Path $ManagerConfigDir -Force | Out-Null
}

if (-not (Test-Path $ManagerConfigFile)) {
    $ConfigContent = @"
[default]
preview_method = latent2rgb
git_exe =
use_uv = False
channel_url = https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/node_db/dev
share_option = all
bypass_ssl = False
file_logging = True
component_policy = mine
update_policy = stable-comfyui
windows_selector_event_loop_policy = False
model_download_by_agent = False
downgrade_blacklist =
security_level = weak
always_lazy_install = False
network_mode = public
db_mode = cache
host = 0.0.0.0
port = 8188
allow_remote = true
auto_update = false
auto_start = false
username =
password =
token =
"@
    Set-Content -Path $ManagerConfigFile -Value $ConfigContent
    Write-Log "Security level set to 'weak' (Developer Mode)."
}
else {
    Write-Log "ComfyUI-Manager config already exists. Skipping."
}

Pause-Step

# 9.5 Cleanup legacy ComfyUI-Manager backup (if exists)
$LegacyBackup = Join-Path $ComfyDir "user\__manager\.legacy-manager-backup"
if (Test-Path $LegacyBackup) {
    Write-Log "Cleaning up legacy ComfyUI-Manager backup..."
    Remove-Item -Path $LegacyBackup -Recurse -Force
    Write-Log "Legacy backup removed."
}

# 10. Installation Complete
# Note: Fanvue Hub, Ollama, and VoxCPM will be auto-installed by run.bat on first launch

# 10.5. Install Voice Samples
Write-Log "`n[Voice Pack] Installing TTS voice samples..."
$VoiceScriptPath = Join-Path $ScriptPath "install_voices.ps1"
if (Test-Path $VoiceScriptPath) {
    try {
        & $VoiceScriptPath
        Write-Log "[Voice Pack] Installation complete."
    }
    catch {
        Write-Log "[Voice Pack] Installation failed (non-critical): $($_.Exception.Message)"
    }
}
else {
    Write-Log "[Voice Pack] Script not found, skipping..."
}
Pause-Step

# 11. Final Cleanup
Write-Log "Skipping desktop shortcut creation (use run.bat)."
Pause-Step

Write-Log "`n================================================"
Write-Log " ComfyUI Setup Complete!"
Write-Log " Returning to main installer..."
Write-Log "================================================"

# Keep window open for user review
Write-Host "`nPress any key to continue..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")