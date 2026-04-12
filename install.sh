#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Ultra Computer — One-Command Installer
# Supports: macOS (Homebrew), Linux (apt / yum / dnf)
# Requires: Node.js >= 20, npm >= 9, git
# =============================================================================

# ── Colors & symbols ──────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
WHITE="\033[0;37m"

info()    { echo -e "${BLUE}ℹ️  ${WHITE}${*}${RESET}"; }
success() { echo -e "${GREEN}✅  ${BOLD}${*}${RESET}"; }
warn()    { echo -e "${YELLOW}⚠️  ${*}${RESET}"; }
error()   { echo -e "${RED}❌  ${BOLD}${*}${RESET}" >&2; }
step()    { echo -e "\n${CYAN}🔧  ${BOLD}${*}${RESET}"; }
banner()  { echo -e "${BOLD}${BLUE}${*}${RESET}"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/rblake2320/ultra-computer.git"
REPO_NAME="ultra-computer"
APP_PORT=5000
UPDATE_MODE=false
DOCKER_MODE=false

for arg in "$@"; do
  case "$arg" in
    --update) UPDATE_MODE=true ;;
    --docker) DOCKER_MODE=true ;;
    --help|-h)
      echo ""
      banner "╔══════════════════════════════════════╗"
      banner "║       Ultra Computer Installer        ║"
      banner "╚══════════════════════════════════════╝"
      echo ""
      echo "Usage: bash install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  (no flags)   Fresh install"
      echo "  --update     Pull latest changes and rebuild"
      echo "  --docker     Install and run via Docker"
      echo "  --help       Show this help message"
      echo ""
      exit 0
      ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
banner "╔══════════════════════════════════════════════════╗"
banner "║                                                  ║"
banner "║   🖥️   Ultra Computer — Installer v1.0           ║"
banner "║                                                  ║"
banner "╚══════════════════════════════════════════════════╝"
echo ""

if $UPDATE_MODE; then
  info "Running in UPDATE mode — will pull latest code and rebuild."
fi

if $DOCKER_MODE; then
  info "Running in DOCKER mode."
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

# Detect OS
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
    echo "${ID:-linux}"
  else
    echo "linux"
  fi
}

OS=$(detect_os)
info "Detected OS: ${OS}"

# Prompt yes/no
confirm() {
  local prompt="${1:-Continue?}"
  local response
  while true; do
    read -rp "$(echo -e "${YELLOW}❓  ${prompt} [y/N]: ${RESET}")" response
    case "${response,,}" in
      y|yes) return 0 ;;
      n|no|"") return 1 ;;
      *) warn "Please answer y or n." ;;
    esac
  done
}

# Version comparison: returns 0 if $1 >= $2
version_gte() {
  local v1="$1" v2="$2"
  [[ "$(printf '%s\n' "$v1" "$v2" | sort -V | head -n1)" == "$v2" ]]
}

# ── Error trap ────────────────────────────────────────────────────────────────
on_error() {
  local exit_code=$?
  local line_no="${BASH_LINENO[0]}"
  echo ""
  error "Installation failed at line ${line_no} (exit code ${exit_code})."
  echo -e "${YELLOW}💡  Troubleshooting tips:${RESET}"
  echo "    • Check that you have internet connectivity"
  echo "    • Ensure you have write permissions in the current directory"
  echo "    • Run with 'bash -x install.sh' for verbose output"
  echo "    • Open an issue at ${REPO_URL}/issues"
  echo ""
  exit "$exit_code"
}
trap on_error ERR

# ── Docker mode ───────────────────────────────────────────────────────────────
run_docker() {
  step "Docker mode selected"

  if ! command -v docker &>/dev/null; then
    error "Docker is not installed or not in PATH."
    echo "    Install Docker Desktop from https://docs.docker.com/get-docker/"
    exit 1
  fi

  local docker_version
  docker_version=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
  success "Docker found: v${docker_version}"

  # Determine project root
  local project_dir
  if [[ -f "package.json" ]] && grep -q '"name"' package.json 2>/dev/null; then
    project_dir="."
  elif [[ -d "$REPO_NAME" ]]; then
    project_dir="./$REPO_NAME"
  else
    step "Cloning repository"
    git clone "$REPO_URL" "$REPO_NAME"
    project_dir="./$REPO_NAME"
  fi

  cd "$project_dir"

  # Write a minimal Dockerfile if one doesn't exist
  if [[ ! -f Dockerfile ]]; then
    step "Creating Dockerfile"
    cat > Dockerfile <<'DOCKERFILE'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=5000
EXPOSE 5000
CMD ["node", "server/index.js"]
DOCKERFILE
    success "Dockerfile created"
  fi

  step "Building Docker image"
  docker build -t ultra-computer:latest .
  success "Docker image built"

  step "Starting container"
  docker run -d \
    --name ultra-computer \
    -p "${APP_PORT}:${APP_PORT}" \
    --restart unless-stopped \
    ultra-computer:latest

  success "Container started!"
  print_success_banner
}

# ── NVM install ───────────────────────────────────────────────────────────────
install_node_via_nvm() {
  step "Installing Node.js 20 via nvm"

  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"

  if [[ ! -d "$nvm_dir" ]]; then
    info "Downloading and installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    success "nvm installed"
  else
    info "nvm already installed at ${nvm_dir}"
  fi

  # Load nvm into current shell
  export NVM_DIR="$nvm_dir"
  # shellcheck source=/dev/null
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
  # shellcheck source=/dev/null
  [[ -s "$NVM_DIR/bash_completion" ]] && source "$NVM_DIR/bash_completion"

  nvm install 20
  nvm use 20
  nvm alias default 20

  success "Node.js 20 installed and set as default via nvm"
  info "Note: Add the following to your ~/.bashrc or ~/.zshrc to persist nvm:"
  echo '    export NVM_DIR="$HOME/.nvm"'
  echo '    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
}

# ── System package manager install hint ───────────────────────────────────────
suggest_system_node_install() {
  echo ""
  warn "Node.js >= 20 is required but was not found."
  echo ""
  echo -e "${YELLOW}Installation options:${RESET}"
  case "$OS" in
    macos)
      echo "  • Homebrew:  brew install node"
      echo "  • nvm:       see below"
      ;;
    ubuntu|debian|linuxmint|pop)
      echo "  • apt:       curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
      echo "  • nvm:       see below"
      ;;
    fedora|rhel|centos|rocky|almalinux)
      echo "  • dnf/yum:   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo dnf install -y nodejs"
      echo "  • nvm:       see below"
      ;;
    *)
      echo "  • Visit:     https://nodejs.org/en/download"
      echo "  • nvm:       see below"
      ;;
  esac
  echo ""
}

# ── Success banner ─────────────────────────────────────────────────────────────
print_success_banner() {
  echo ""
  banner "╔══════════════════════════════════════════════════╗"
  banner "║                                                  ║"
  banner "║   🎉  Ultra Computer is ready!                   ║"
  banner "║                                                  ║"
  banner "║   🌐  http://localhost:${APP_PORT}                     ║"
  banner "║                                                  ║"
  banner "║   API keys and settings are configured           ║"
  banner "║   through the web UI after first launch.         ║"
  banner "║                                                  ║"
  banner "╚══════════════════════════════════════════════════╝"
  echo ""
  info "To start Ultra Computer in the future, run:"
  echo -e "    ${CYAN}./start.sh${RESET}   or   ${CYAN}npm start${RESET}   (from the project directory)"
  echo ""
}

# ── Docker shortcut ───────────────────────────────────────────────────────────
if $DOCKER_MODE; then
  run_docker
  exit 0
fi

# =============================================================================
# MAIN INSTALLATION FLOW
# =============================================================================

# ── 1. Check git ──────────────────────────────────────────────────────────────
step "Checking prerequisites"

if ! command -v git &>/dev/null; then
  error "git is not installed or not in PATH."
  case "$OS" in
    macos)   echo "    Install via Homebrew: brew install git" ;;
    ubuntu|debian|linuxmint|pop) echo "    sudo apt-get install -y git" ;;
    fedora|rhel|centos|rocky|almalinux) echo "    sudo dnf install -y git" ;;
    *) echo "    https://git-scm.com/downloads" ;;
  esac
  exit 1
fi
success "git found: $(git --version)"

# ── 2. Check Node.js ──────────────────────────────────────────────────────────
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_RAW=$(node --version | tr -d 'v')
  NODE_MAJOR=$(echo "$NODE_RAW" | cut -d. -f1)
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    success "Node.js found: v${NODE_RAW} (>= 20 ✓)"
    NODE_OK=true
  else
    warn "Node.js v${NODE_RAW} is installed but version >= 20 is required."
  fi
fi

if ! $NODE_OK; then
  suggest_system_node_install
  if confirm "Would you like to install Node.js 20 automatically via nvm?"; then
    install_node_via_nvm
    NODE_OK=true
  else
    error "Node.js >= 20 is required. Please install it and re-run this script."
    exit 1
  fi
fi

# ── 3. Check npm ──────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  error "npm is not installed. It should be bundled with Node.js."
  exit 1
fi

NPM_RAW=$(npm --version)
NPM_MAJOR=$(echo "$NPM_RAW" | cut -d. -f1)
if [[ "$NPM_MAJOR" -lt 9 ]]; then
  warn "npm v${NPM_RAW} detected. npm >= 9 is recommended."
  if confirm "Upgrade npm to the latest version now?"; then
    npm install -g npm@latest
    success "npm upgraded to $(npm --version)"
  fi
else
  success "npm found: v${NPM_RAW} (>= 9 ✓)"
fi

# ── 4. Clone or enter project directory ───────────────────────────────────────
step "Setting up project directory"

# Detect if we are already inside the project
IN_PROJECT=false
if [[ -f "package.json" ]] && grep -q '"name"' package.json 2>/dev/null; then
  DETECTED_NAME=$(node -e "try{console.log(require('./package.json').name)}catch(e){}" 2>/dev/null || true)
  if [[ "$DETECTED_NAME" == "$REPO_NAME" ]]; then
    IN_PROJECT=true
    info "Already inside the ${REPO_NAME} project directory."
  fi
fi

if $IN_PROJECT; then
  PROJECT_DIR="$(pwd)"
elif [[ -d "$REPO_NAME" ]]; then
  warn "Directory '${REPO_NAME}' already exists."
  if confirm "Use the existing directory (skip re-cloning)?"; then
    PROJECT_DIR="$(pwd)/${REPO_NAME}"
  else
    if confirm "Delete and re-clone '${REPO_NAME}'?"; then
      rm -rf "$REPO_NAME"
      info "Cloning ${REPO_URL}..."
      git clone "$REPO_URL" "$REPO_NAME"
      success "Repository cloned"
      PROJECT_DIR="$(pwd)/${REPO_NAME}"
    else
      error "Cannot proceed without a valid project directory. Exiting."
      exit 1
    fi
  fi
else
  info "Cloning ${REPO_URL}..."
  git clone "$REPO_URL" "$REPO_NAME"
  success "Repository cloned into ./${REPO_NAME}"
  PROJECT_DIR="$(pwd)/${REPO_NAME}"
fi

cd "$PROJECT_DIR"
info "Working directory: ${PROJECT_DIR}"

# ── 5. Update mode ────────────────────────────────────────────────────────────
if $UPDATE_MODE; then
  step "Pulling latest changes"
  git fetch origin
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "unknown")
  if [[ "$LOCAL" == "$REMOTE" ]]; then
    success "Already up to date."
  else
    git pull --rebase origin "$(git rev-parse --abbrev-ref HEAD)"
    success "Repository updated"
  fi
fi

# ── 6. npm install ────────────────────────────────────────────────────────────
step "Installing dependencies"

# Check for permission issues with node_modules
if [[ -d node_modules ]] && [[ ! -w node_modules ]]; then
  warn "node_modules exists but is not writable. Attempting to fix permissions..."
  chmod -R u+w node_modules || {
    error "Cannot write to node_modules. Try running: sudo chown -R \$(whoami) node_modules"
    exit 1
  }
fi

npm install
success "Dependencies installed"

# ── 7. Build ─────────────────────────────────────────────────────────────────
step "Building application"

# Check if there are native module build issues
if npm run build 2>&1 | tee /tmp/ultra_build.log | grep -qiE "error|ERR!"; then
  # Re-examine the log for actual fatal errors vs warnings
  if grep -qiE "^npm ERR!|Error: " /tmp/ultra_build.log; then
    error "Build failed. See output above."
    echo ""
    info "Common fixes:"
    echo "    • Delete node_modules and retry:  rm -rf node_modules && bash install.sh"
    echo "    • Check Node.js version:          node --version (need >= 20)"
    echo "    • View full log:                  cat /tmp/ultra_build.log"
    exit 1
  fi
fi

success "Application built successfully"

# ── 8. Create .env file ───────────────────────────────────────────────────────
step "Configuring environment"

if [[ -f .env ]]; then
  info ".env file already exists — skipping creation."
else
  cat > .env <<EOF
# Ultra Computer — Environment Configuration
# Generated by install.sh on $(date)

# Server port
PORT=${APP_PORT}

# Node environment
NODE_ENV=production

# Database path (SQLite — relative to project root)
DATABASE_URL=./data/ultra-computer.db

# Session secret — change this to a long random string in production!
SESSION_SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c 48 2>/dev/null || echo "change-me-to-a-secure-random-string-please")
EOF
  success ".env file created with sensible defaults"
  info "API keys are configured through the web UI — no manual .env editing needed."
fi

# ── 9. Ensure data directory exists ───────────────────────────────────────────
if [[ ! -d data ]]; then
  mkdir -p data
  info "Created data/ directory for SQLite database"
fi

# ── 10. Create start.sh convenience script ───────────────────────────────────
step "Creating convenience start script"

cat > start.sh <<'STARTSH'
#!/usr/bin/env bash
set -euo pipefail

# Load nvm if present (for environments where node is managed via nvm)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "🚀  Starting Ultra Computer..."
echo "    http://localhost:${PORT:-5000}"
echo "    Press Ctrl+C to stop."
echo ""

# Load .env if present
if [[ -f .env ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

npm start
STARTSH

chmod +x start.sh
success "start.sh created and made executable"

# ── 11. Offer to start the server ─────────────────────────────────────────────
echo ""
print_success_banner

if confirm "Start Ultra Computer now?"; then
  step "Starting server"
  info "Server starting on http://localhost:${APP_PORT} — press Ctrl+C to stop."
  echo ""

  # Load nvm if needed
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh" || true

  # Load .env vars
  if [[ -f .env ]]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
  fi

  npm start
else
  info "You can start Ultra Computer later by running:"
  echo ""
  echo -e "    ${CYAN}cd ${PROJECT_DIR}${RESET}"
  echo -e "    ${CYAN}./start.sh${RESET}"
  echo ""
  success "Installation complete. Enjoy Ultra Computer! 🖥️"
fi
