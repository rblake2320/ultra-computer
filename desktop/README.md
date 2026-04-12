# Ultra Computer — Desktop App

Native desktop wrapper for Ultra Computer built with [Electron](https://www.electronjs.org/).

The wrapper embeds the Express + Vite + React + SQLite server and displays it in a
`BrowserWindow`, giving users a self-contained `.exe` (Windows), `.dmg` (macOS), or
`.AppImage` (Linux) — no browser or Node.js installation required.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | 20 LTS+ |
| npm         | 10+     |
| Git         | any     |
| (macOS) Xcode Command Line Tools | latest |
| (Windows cross-build) Wine + Mono | latest |

---

## Directory Layout

```
ultra-computer/
├── dist/              ← compiled server + client (npm run build)
├── node_modules/      ← server dependencies
├── desktop/
│   ├── main.js        ← Electron main process
│   ├── preload.js     ← context bridge / renderer API
│   ├── package.json   ← Electron + electron-builder config
│   ├── build.sh       ← convenience build script
│   ├── release/       ← generated installers (git-ignored)
│   └── icons/
│       ├── icon.svg   ← master vector icon (source of truth)
│       ├── icon.ico   ← Windows (generate from SVG — see icons/README.md)
│       ├── icon.icns  ← macOS  (generate from SVG — see icons/README.md)
│       ├── icon.png   ← Linux  (generate from SVG — see icons/README.md)
│       └── icon-tray.png ← system tray (22×22 px)
```

---

## Development Workflow

### 1. Start in dev mode (no packaging)

```bash
# Terminal 1 — run the Express server
cd ultra-computer
NODE_ENV=production node dist/index.cjs

# Terminal 2 — open the Electron shell pointing at localhost:5000
cd ultra-computer/desktop
npm install
npm start
```

Or build the server first if `dist/` is out of date:

```bash
cd ultra-computer && npm run build
```

### 2. Hot-reload during development

Point `APP_URL` in `main.js` at the Vite dev server (`http://localhost:5173`) and
run Vite and Electron side-by-side for HMR:

```bash
# Terminal 1
cd ultra-computer && npm run dev        # Vite + Express dev server

# Terminal 2
cd ultra-computer/desktop && npm start  # Electron (change APP_URL to :5173)
```

### 3. DevTools

Press **Ctrl+Shift+I** (Windows/Linux) or **Cmd+Option+I** (macOS) to toggle the
Chromium DevTools panel inside the running app.

---

## Building Installers

### Quick — all platforms at once

```bash
cd ultra-computer/desktop
chmod +x build.sh
./build.sh
```

### Platform-specific

```bash
./build.sh --win    # Windows: NSIS installer + portable .exe
./build.sh --mac    # macOS:   .dmg + .zip
./build.sh --linux  # Linux:   .AppImage + .deb
```

Output is placed in `desktop/release/`.

### Manual steps (without build.sh)

```bash
# 1. Build the web app
cd ultra-computer
npm run build

# 2. Generate icons (see desktop/icons/README.md)

# 3. Install Electron deps and package
cd desktop
npm install
npm run build:all   # or build:win / build:mac / build:linux
```

---

## Code-Signing & Notarization

Unsigned builds will trigger security warnings on macOS ("unidentified developer")
and Windows SmartScreen. For distribution, sign your builds:

### macOS

1. Enrol in the [Apple Developer Program](https://developer.apple.com/programs/).
2. Create a **Developer ID Application** certificate in Xcode → Settings → Accounts.
3. Export the certificate to your keychain.
4. Set environment variables before building:

```bash
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-p12-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run build:mac
```

electron-builder handles codesigning and notarization automatically when these
variables are set. See the
[electron-builder macOS docs](https://www.electron.build/configuration/mac.html).

### Windows

1. Obtain an **EV Code Signing Certificate** from a trusted CA
   (DigiCert, Sectigo, etc.).
2. Set:

```bash
set CSC_LINK=path\to\certificate.p12
set CSC_KEY_PASSWORD=your-p12-password
npm run build:win
```

### Linux

Linux packages (`.AppImage`, `.deb`) do not require signing, but you can optionally
sign the AppImage with GPG for integrity verification.

---

## Auto-Updates

The main process includes a placeholder for
[electron-updater](https://www.electron.build/auto-update.html).
To activate it:

1. Set up a GitHub release or custom update server.
2. Ensure `publish` in `desktop/package.json` points to your server.
3. Set `GH_TOKEN` (for GitHub) when building and publishing.
4. `electron-updater` is already imported in `main.js` — it will activate
   automatically once a valid `app-update.yml` is bundled (electron-builder
   generates this during packaging).

---

## System Tray Behaviour

- Clicking the **× close button** shows a dialog: *Minimise to Tray* or *Quit*.
- Clicking the tray icon restores the window.
- Right-clicking the tray icon shows: **Show Ultra Computer** / **Quit**.
- On macOS the Dock badge follows the same logic.

---

## Single Instance

If a second instance of the app is launched, it is immediately terminated and the
existing window is brought into focus. This is enforced via
`app.requestSingleInstanceLock()`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| White/blank window on launch | Server hasn't started yet | Increase `SERVER_POLL_TIMEOUT` in `main.js` |
| "Server stopped unexpectedly" dialog | `dist/index.cjs` missing or crashed | Run `npm run build` in the project root |
| App icon shows as default Electron icon | Missing `.ico`/`.icns`/`.png` files | Generate icons from `icon.svg` (see `icons/README.md`) |
| Windows SmartScreen warning | App not signed | Sign with a code-signing cert (see above) |
| macOS Gatekeeper blocks app | App not notarized | Notarize via Apple (see above) |
| Cross-platform build fails on Linux | Missing Wine/Mono for Windows targets | `sudo apt install wine` or build on native OS |

---

## License

MIT — see the root `LICENSE` file.
