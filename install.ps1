#Requires -Version 5.1
<#
.SYNOPSIS
    Ultra Computer - Windows PowerShell Installer

.DESCRIPTION
    One-command installer for Ultra Computer (Express + Vite + React + SQLite).
    Node.js 20+ is required. API keys are configured through the web UI after startup.

.PARAMETER Update
    Pull the latest changes from the repository and rebuild.

.PARAMETER Docker
    Install and run via Docker Compose instead of Node.js.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -Update
    .\install.ps1 -Docker

.LINK
    https://github.com/rblake2320/ultra-computer
#>

[CmdletBinding()]
param(
    [switch]$Update,
    [switch]$Docker
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ============================================================
#  Constants
# ============================================================
$AppName   = 'Ultra Computer'
$RepoUrl   = 'https://github.com/rblake2320/ultra-computer.git'
$NodeUrl   = 'https://nodejs.org'
$MinNode   = 20
$MinNpm    = 9
$Port      = 5000
$AppUrl    = "http://localhost:$Port"

# ============================================================
#  Output helpers
# ============================================================
function Write-Banner {
    Write-Host ''
    Write-Host '  =====================================================' -ForegroundColor Cyan
    Write-Host "    $AppName Installer for Windows" -ForegroundColor Cyan
    Write-Host '  =====================================================' -ForegroundColor Cyan
    Write-Host ''
}

function Write-Step([string]$Message) {
    Write-Host ''
    Write-Host "--> $Message" -ForegroundColor Yellow
}

function Write-Ok([string]$Message) {
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host "[ERR ] $Message" -ForegroundColor Red
}

function Write-SuccessBanner {
    Write-Host ''
    Write-Host '  =====================================================' -ForegroundColor Green
    Write-Host "    $AppName is ready!" -ForegroundColor Green
    Write-Host '  =====================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host "    URL  : $AppUrl" -ForegroundColor White
    Write-Host '    Start: .\start.bat  (or  npm start)' -ForegroundColor White
    Write-Host ''
    Write-Host '    API keys are configured through the web UI.' -ForegroundColor Gray
    Write-Host '  =====================================================' -ForegroundColor Green
    Write-Host ''
}

# ============================================================
#  Admin elevation detection
# ============================================================
function Test-AdminElevation {
    $current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ============================================================
#  Version helpers
# ============================================================
function Get-MajorVersion([string]$VersionString) {
    # Handles "v20.11.0" or "20.11.0" or just "20"
    $clean = $VersionString.TrimStart('v')
    $parts = $clean.Split('.')
    return [int]$parts[0]
}

# ============================================================
#  Prerequisite checks
# ============================================================
function Test-Node {
    Write-Step 'Checking Node.js...'

    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Err 'Node.js not found.'
        Write-Host ''
        Write-Host "  Download Node.js (v$MinNode+) from:" -ForegroundColor White
        Write-Host "    $NodeUrl" -ForegroundColor Cyan
        Write-Host ''
        $open = Read-Host "  Open $NodeUrl in your browser? [Y/n]"
        if ($open -eq '' -or $open -imatch '^y') {
            Start-Process $NodeUrl
        }
        return $false
    }

    $rawVersion = (node --version 2>&1).Trim()
    $major = Get-MajorVersion $rawVersion

    if ($major -lt $MinNode) {
        Write-Err "Node.js $rawVersion found, but v$MinNode+ is required."
        Write-Host "  Please upgrade at: $NodeUrl" -ForegroundColor White
        return $false
    }

    Write-Ok "Node.js $rawVersion"
    return $true
}

function Test-Npm {
    Write-Step 'Checking npm...'

    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npmCmd) {
        Write-Err "npm not found. Reinstall Node.js from $NodeUrl"
        return $false
    }

    $rawVersion = (npm --version 2>&1).Trim()
    $major = Get-MajorVersion $rawVersion

    if ($major -lt $MinNpm) {
        Write-Err "npm v$rawVersion found, but v$MinNpm+ is required."
        Write-Host '  Run: npm install -g npm@latest' -ForegroundColor White
        return $false
    }

    Write-Ok "npm v$rawVersion"
    return $true
}

function Test-Git {
    Write-Step 'Checking git...'

    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Err 'git not found.'
        Write-Host '  Download Git from: https://git-scm.com/download/win' -ForegroundColor White
        return $false
    }

    $gitVersion = (git --version 2>&1).Trim()
    Write-Ok $gitVersion
    return $true
}

function Test-Docker {
    Write-Step 'Checking Docker...'

    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        Write-Err 'Docker not found.'
        Write-Host '  Install Docker Desktop: https://www.docker.com/products/docker-desktop' -ForegroundColor White
        return $false
    }

    try {
        docker compose version | Out-Null
    }
    catch {
        Write-Err 'Docker Compose (v2) not found. Update Docker Desktop.'
        return $false
    }

    Write-Ok 'Docker and Docker Compose are available.'
    return $true
}

# ============================================================
#  Clone / Update
# ============================================================
function Invoke-Clone {
    # If package.json exists here, assume we're already in the project
    if (Test-Path 'package.json') {
        Write-Info 'package.json found in current directory. Skipping clone.'
        return $true
    }

    if (Test-Path 'ultra-computer') {
        Write-Info 'ultra-computer directory already exists. Skipping clone.'
        Set-Location 'ultra-computer'
        return $true
    }

    Write-Step 'Cloning repository...'
    git clone $RepoUrl
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'git clone failed.'
        return $false
    }
    Set-Location 'ultra-computer'
    Write-Ok 'Repository cloned.'
    return $true
}

function Invoke-Update {
    Write-Step 'Pulling latest changes...'
    git pull
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'git pull failed. Ensure you are inside the project directory.'
        return $false
    }
    Write-Ok 'Repository updated.'
    return $true
}

# ============================================================
#  npm install + build
# ============================================================
function Invoke-NpmInstall {
    Write-Step 'Installing dependencies (npm install)...'
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'npm install failed.'
        return $false
    }
    Write-Ok 'Dependencies installed.'
    return $true
}

function Invoke-Build {
    Write-Step 'Building application (npm run build)...'
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'Build failed. Review the output above for details.'
        return $false
    }
    Write-Ok 'Build complete.'
    return $true
}

# ============================================================
#  .env setup
# ============================================================
function New-EnvFile {
    if (Test-Path '.env') {
        Write-Info '.env already exists, skipping.'
        return
    }
    Write-Step 'Creating .env with defaults...'
    @"
PORT=$Port
NODE_ENV=production
"@ | Set-Content -Path '.env' -Encoding UTF8
    Write-Ok '.env created.'
}

# ============================================================
#  start.bat convenience script
# ============================================================
function New-StartBat {
    Write-Step 'Creating start.bat...'
    @"
@echo off
setlocal
echo Starting $AppName...
npm start
endlocal
"@ | Set-Content -Path 'start.bat' -Encoding ASCII
    Write-Ok 'start.bat created.'
}

# ============================================================
#  Docker path
# ============================================================
function Invoke-DockerInstall {
    if (-not (Test-Path 'docker-compose.yml') -and -not (Test-Path 'docker-compose.yaml')) {
        Write-Err 'No docker-compose.yml found in the current directory.'
        return $false
    }
    Write-Step 'Running Docker Compose...'
    docker compose up --build -d
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'docker compose up failed.'
        return $false
    }
    Write-Ok 'Docker containers started.'
    return $true
}

# ============================================================
#  MAIN
# ============================================================

Write-Banner

# Admin check
if (-not (Test-AdminElevation)) {
    Write-Warn 'Not running as Administrator. Some operations may fail.'
    Write-Warn 'If you hit permission errors, rerun PowerShell as Administrator.'
    Write-Host ''
}

# Mode display
if ($Update) { Write-Info 'Mode: UPDATE (pull latest + rebuild)'; Write-Host '' }
if ($Docker) { Write-Info 'Mode: DOCKER COMPOSE'; Write-Host '' }

# ---- Docker path ----
if ($Docker) {
    if (-not (Test-Docker)) { exit 1 }
    if (-not (Invoke-DockerInstall)) { exit 1 }
    Write-SuccessBanner
    exit 0
}

# ---- Node.js path ----

Write-Step 'Checking prerequisites...'

if (-not (Test-Node))  { exit 1 }
if (-not (Test-Npm))   { exit 1 }
if (-not (Test-Git))   { exit 1 }

Write-Host ''
Write-Ok 'All prerequisites satisfied.'
Write-Host ''

# Clone or update
if ($Update) {
    if (-not (Invoke-Update)) { exit 1 }
} else {
    if (-not (Invoke-Clone)) { exit 1 }
}

# Install, build, configure
if (-not (Invoke-NpmInstall)) { exit 1 }
if (-not (Invoke-Build))      { exit 1 }

New-EnvFile
New-StartBat

Write-SuccessBanner

# Offer to start server
$startNow = Read-Host 'Start the server now? [Y/n]'
if ($startNow -eq '' -or $startNow -imatch '^y') {
    Write-Info 'Starting server... Press Ctrl+C to stop.'
    Write-Host ''
    npm start
}
