'use strict';

/**
 * preload.js — Electron preload script
 *
 * Runs in a sandboxed context before the renderer page loads.
 * Exposes a minimal, safe API on window.ultraComputer via contextBridge.
 * Never expose Node.js APIs or Electron internals directly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ultraComputer', {
  /**
   * Electron package version (from app.getVersion()).
   * Useful for displaying in an About dialog inside the React app.
   */
  getVersion: () => ipcRenderer.invoke('app:version'),

  /**
   * Host OS platform string — 'win32' | 'darwin' | 'linux'
   * Useful for conditional UI (e.g., keyboard shortcut labels).
   */
  getPlatform: () => ipcRenderer.invoke('app:platform'),

  /**
   * Static platform string available synchronously without an IPC round-trip.
   * Populated at preload time.
   */
  platform: process.platform,

  /**
   * Whether the app is running inside an Electron shell.
   * The web app can check window.ultraComputer?.isElectron to adapt its UI.
   */
  isElectron: true,
});
