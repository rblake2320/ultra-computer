'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  shell,
  nativeImage,
} = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// ─── Auto-updater (placeholder — wire up electron-updater when distributing) ──
let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  // electron-updater not installed — skip silently in dev
  autoUpdater = null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const APP_URL = 'http://localhost:5000';
const SERVER_POLL_INTERVAL = 250;  // ms between readiness checks
const SERVER_POLL_TIMEOUT = 30000; // ms to wait before giving up

// Resolve icon path relative to this file (works both in dev and packaged)
const ICONS_DIR = path.join(__dirname, 'icons');
function iconPath(name) {
  return path.join(ICONS_DIR, name);
}

// ─── Single-instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── Globals ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let serverProcess = null;
let quitting = false; // true when the user has confirmed a real quit

// ─── Spawn the Express server ─────────────────────────────────────────────────
function startServer() {
  // dist/index.cjs lives one directory above this file (the project root)
  const serverEntry = path.join(__dirname, '..', 'dist', 'index.cjs');

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '5000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (d) =>
    process.stdout.write(`[server] ${d}`)
  );
  serverProcess.stderr.on('data', (d) =>
    process.stderr.write(`[server] ${d}`)
  );

  serverProcess.on('exit', (code, signal) => {
    if (!quitting) {
      console.error(`[server] exited unexpectedly — code=${code} signal=${signal}`);
      dialog.showErrorBox(
        'Server Error',
        'The Ultra Computer server stopped unexpectedly. The app will now close.'
      );
      app.quit();
    }
  });

  return serverProcess;
}

// ─── Wait for the server to be ready ─────────────────────────────────────────
function waitForServer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    function probe() {
      http
        .get(url, (res) => {
          res.resume(); // drain response
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start >= timeoutMs) {
            reject(new Error(`Server at ${url} did not start within ${timeoutMs} ms`));
          } else {
            setTimeout(probe, SERVER_POLL_INTERVAL);
          }
        });
    }

    probe();
  });
}

// ─── Tray icon ────────────────────────────────────────────────────────────────
function createTray() {
  // Prefer a 16×16 or 32×32 PNG; fall back gracefully
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath('icon-tray.png'));
    if (trayIcon.isEmpty()) throw new Error('empty');
  } catch {
    // Create a minimal 1×1 transparent fallback so Electron doesn't crash
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Ultra Computer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Ultra Computer',
      click: () => showWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => showWindow());   // single-click on Windows/Linux
  tray.on('double-click', () => showWindow()); // double-click on macOS
}

// ─── Show / restore the main window ──────────────────────────────────────────
function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ─── Create the BrowserWindow ─────────────────────────────────────────────────
function createWindow() {
  let appIcon;
  try {
    appIcon = nativeImage.createFromPath(
      process.platform === 'win32'
        ? iconPath('icon.ico')
        : process.platform === 'darwin'
        ? iconPath('icon.icns')
        : iconPath('icon.png')
    );
    if (appIcon.isEmpty()) appIcon = undefined;
  } catch {
    appIcon = undefined;
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false, // shown after the server is ready
    title: 'Ultra Computer',
    icon: appIcon,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools toggle — Ctrl+Shift+I (Windows/Linux) / Cmd+Opt+I (macOS)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const combo =
      (input.control || input.meta) && input.shift && input.key === 'I';
    if (combo && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });

  // Intercept the close button — minimise to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (quitting) return; // allow real quit

    event.preventDefault();

    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Minimise to Tray', 'Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Ultra Computer',
      message: 'What would you like to do?',
      detail: 'You can restore Ultra Computer from the system tray at any time.',
    });

    if (choice === 1) {
      quitting = true;
      app.quit();
    } else {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // macOS: hide the dock icon while the window is hidden
  if (process.platform === 'darwin') {
    app.dock?.setIcon(iconPath('icon.icns'));
  }

  createTray();
  const win = createWindow();

  // Start the Express server
  startServer();

  // Wait for it to be ready, then load the URL
  try {
    await waitForServer(APP_URL, SERVER_POLL_TIMEOUT);
  } catch (err) {
    dialog.showErrorBox('Startup Error', err.message);
    app.quit();
    return;
  }

  win.loadURL(APP_URL);
  win.once('ready-to-show', () => win.show());

  // ── Auto-updater ──────────────────────────────────────────────────────────
  if (autoUpdater) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) =>
      console.warn('[updater]', e.message)
    );
  }
});

// Focus or restore the existing window when a second instance is launched
app.on('second-instance', () => {
  showWindow();
});

// macOS: re-open the window when the dock icon is clicked
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    showWindow();
  }
});

// Prevent the app from quitting when all windows are closed (we have tray)
app.on('window-all-closed', (event) => {
  if (!quitting) {
    // Do nothing — the app lives in the tray
    return;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
});

// Kill the server process cleanly when the app exits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (serverProcess && !serverProcess.killed) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(serverProcess.pid), '/f', '/t']);
      } else {
        serverProcess.kill('SIGTERM');
      }
    } catch {
      // best-effort
    }
  }
});

// ─── IPC handlers (optional extensions) ──────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);
