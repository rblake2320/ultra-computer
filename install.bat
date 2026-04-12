@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  Ultra Computer - Windows Installer
::  Requires: Node.js 20+, npm 9+, git
::  Usage:
::    install.bat          - Normal install
::    install.bat /update  - Pull latest and rebuild
::    install.bat /docker  - Install via Docker Compose
:: ============================================================

:: Color helper - uses a temp file trick to get color output
:: Color codes: 0=Black 1=Blue 2=Green 3=Cyan 4=Red 5=Magenta 6=Yellow 7=White
:: Bright variants: 8-F

set "APP_NAME=Ultra Computer"
set "REPO_URL=https://github.com/rblake2320/ultra-computer.git"
set "NODE_URL=https://nodejs.org"
set "MIN_NODE=20"
set "MIN_NPM=9"
set "PORT=5000"
set "APP_URL=http://localhost:%PORT%"

:: Parse flags
set "FLAG_UPDATE=0"
set "FLAG_DOCKER=0"
for %%A in (%*) do (
    if /I "%%A"=="/update" set "FLAG_UPDATE=1"
    if /I "%%A"=="/docker" set "FLAG_DOCKER=1"
)

:: ============================================================
:: Admin elevation detection
:: ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    call :print_warn "Not running as Administrator. Some operations may fail."
    call :print_warn "If you encounter permission errors, right-click install.bat"
    call :print_warn "and select 'Run as administrator'."
    echo.
)

:: ============================================================
:: Banner
:: ============================================================
color 0B
echo.
echo  =====================================================
echo    %APP_NAME% Installer for Windows
echo  =====================================================
echo.
color 07

if "%FLAG_UPDATE%"=="1" (
    call :print_info "Mode: UPDATE (pull latest + rebuild)"
    echo.
)
if "%FLAG_DOCKER%"=="1" (
    call :print_info "Mode: DOCKER COMPOSE"
    echo.
)

:: ============================================================
:: Docker path
:: ============================================================
if "%FLAG_DOCKER%"=="1" (
    call :check_docker
    if errorlevel 1 goto :end_error
    call :docker_install
    goto :end_success
)

:: ============================================================
:: Check prerequisites
:: ============================================================
call :print_step "Checking prerequisites..."

:: --- Node.js ---
call :check_node
if errorlevel 1 goto :end_error

:: --- npm ---
call :check_npm
if errorlevel 1 goto :end_error

:: --- git ---
call :check_git
if errorlevel 1 goto :end_error

call :print_ok "All prerequisites satisfied."
echo.

:: ============================================================
:: Clone or update repository
:: ============================================================
if "%FLAG_UPDATE%"=="1" (
    call :do_update
    if errorlevel 1 goto :end_error
) else (
    call :do_clone
    if errorlevel 1 goto :end_error
)

:: ============================================================
:: npm install
:: ============================================================
call :print_step "Installing dependencies (npm install)..."
npm install
if errorlevel 1 (
    call :print_error "npm install failed."
    goto :end_error
)
call :print_ok "Dependencies installed."
echo.

:: ============================================================
:: npm run build
:: ============================================================
call :print_step "Building application (npm run build)..."
npm run build
if errorlevel 1 (
    call :print_error "Build failed. Check the output above for details."
    goto :end_error
)
call :print_ok "Build complete."
echo.

:: ============================================================
:: Create .env if not exists
:: ============================================================
if not exist ".env" (
    call :print_step "Creating .env with defaults..."
    (
        echo PORT=%PORT%
        echo NODE_ENV=production
    ) > .env
    call :print_ok ".env created."
) else (
    call :print_info ".env already exists, skipping."
)
echo.

:: ============================================================
:: Create start.bat convenience script
:: ============================================================
call :create_start_bat
echo.

:: ============================================================
:: Success banner
:: ============================================================
:end_success
color 0A
echo.
echo  =====================================================
echo    %APP_NAME% is ready!
echo  =====================================================
echo.
echo    URL  : %APP_URL%
echo    Start: start.bat  (or  npm start)
echo.
echo    API keys are configured through the web UI.
echo  =====================================================
echo.
color 07

:: ============================================================
:: Offer to start server
:: ============================================================
if "%FLAG_DOCKER%"=="1" goto :end_clean

set /p "START_NOW=Start the server now? [Y/n]: "
if /I "!START_NOW!"=="" set "START_NOW=Y"
if /I "!START_NOW!"=="Y" (
    call :print_info "Starting server... Press Ctrl+C to stop."
    echo.
    npm start
)

goto :end_clean

:: ============================================================
:: Error exit
:: ============================================================
:end_error
color 0C
echo.
echo  [ERROR] Installation did not complete successfully.
echo  Review the messages above and try again.
echo.
color 07
endlocal
exit /b 1

:end_clean
endlocal
exit /b 0

:: ============================================================
:: SUBROUTINES
:: ============================================================

:check_node
    where node >nul 2>&1
    if errorlevel 1 (
        call :print_error "Node.js not found."
        echo.
        echo  Download Node.js ^(v%MIN_NODE%+^) from:
        echo    %NODE_URL%
        echo.
        set /p "OPEN_BROWSER=Open %NODE_URL% in your browser? [Y/n]: "
        if /I "!OPEN_BROWSER!"=="" set "OPEN_BROWSER=Y"
        if /I "!OPEN_BROWSER!"=="Y" (
            start "" "%NODE_URL%"
        )
        exit /b 1
    )
    :: Parse major version
    for /f "tokens=1 delims=." %%V in ('node --version 2^>nul') do (
        set "NODE_VER_RAW=%%V"
    )
    set "NODE_MAJOR=!NODE_VER_RAW:~1!"
    if !NODE_MAJOR! LSS %MIN_NODE% (
        call :print_error "Node.js v!NODE_MAJOR! found, but v%MIN_NODE%+ is required."
        echo  Please upgrade at: %NODE_URL%
        exit /b 1
    )
    call :print_ok "Node.js v!NODE_MAJOR! found."
    exit /b 0

:check_npm
    where npm >nul 2>&1
    if errorlevel 1 (
        call :print_error "npm not found. Reinstall Node.js from %NODE_URL%"
        exit /b 1
    )
    for /f "tokens=1 delims=." %%V in ('npm --version 2^>nul') do (
        set "NPM_MAJOR=%%V"
    )
    if !NPM_MAJOR! LSS %MIN_NPM% (
        call :print_error "npm v!NPM_MAJOR! found, but v%MIN_NPM%+ is required."
        echo  Run: npm install -g npm@latest
        exit /b 1
    )
    call :print_ok "npm v!NPM_MAJOR! found."
    exit /b 0

:check_git
    where git >nul 2>&1
    if errorlevel 1 (
        call :print_error "git not found."
        echo  Download Git from: https://git-scm.com/download/win
        exit /b 1
    )
    for /f "tokens=3" %%V in ('git --version 2^>nul') do set "GIT_VER=%%V"
    call :print_ok "git !GIT_VER! found."
    exit /b 0

:check_docker
    where docker >nul 2>&1
    if errorlevel 1 (
        call :print_error "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
        exit /b 1
    )
    docker compose version >nul 2>&1
    if errorlevel 1 (
        call :print_error "Docker Compose (v2) not found. Update Docker Desktop."
        exit /b 1
    )
    call :print_ok "Docker and Docker Compose found."
    exit /b 0

:do_clone
    :: Check if we're already inside the project directory
    if exist "package.json" (
        call :print_info "package.json found in current directory. Skipping clone."
        exit /b 0
    )
    :: Check if the folder already exists
    if exist "ultra-computer\" (
        call :print_info "ultra-computer directory already exists. Skipping clone."
        cd ultra-computer
        exit /b 0
    )
    call :print_step "Cloning repository..."
    git clone "%REPO_URL%"
    if errorlevel 1 (
        call :print_error "git clone failed."
        exit /b 1
    )
    cd ultra-computer
    call :print_ok "Repository cloned."
    exit /b 0

:do_update
    call :print_step "Pulling latest changes..."
    git pull
    if errorlevel 1 (
        call :print_error "git pull failed. Ensure you are inside the project directory."
        exit /b 1
    )
    call :print_ok "Repository updated."
    exit /b 0

:docker_install
    call :print_step "Running Docker Compose..."
    if not exist "docker-compose.yml" (
        if not exist "docker-compose.yaml" (
            call :print_error "No docker-compose.yml found in current directory."
            exit /b 1
        )
    )
    docker compose up --build -d
    if errorlevel 1 (
        call :print_error "docker compose up failed."
        exit /b 1
    )
    call :print_ok "Docker containers started."
    exit /b 0

:create_start_bat
    call :print_step "Creating start.bat..."
    (
        echo @echo off
        echo setlocal
        echo echo Starting %APP_NAME%...
        echo npm start
        echo endlocal
    ) > start.bat
    call :print_ok "start.bat created."
    exit /b 0

:: Print helpers (use color codes via ANSI where supported, fallback to prefix tags)
:print_ok
    echo [ OK ] %~1
    exit /b 0

:print_info
    echo [INFO] %~1
    exit /b 0

:print_warn
    echo [WARN] %~1
    exit /b 0

:print_error
    echo [ERR ] %~1
    exit /b 0

:print_step
    echo.
    echo --^> %~1
    exit /b 0
