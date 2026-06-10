'use strict';

const { app, BrowserWindow, nativeImage, ipcMain } = require('electron');
const { spawn }              = require('child_process');
const path                   = require('path');

const ICON_PATH = path.join(__dirname, 'icon.png');

let mainWindow    = null;
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1160,
    height:   800,
    minWidth: 860,
    minHeight: 620,
    icon: ICON_PATH,
    title: 'Project Beatrice – AI Voice Changer',
    // macOS/Windows: hide default titlebar, place windows control overlay properly
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
    backgroundColor: '#05050b',
    show: false,           // avoid white flash on load
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');

  // Uncomment to open DevTools for debugging:
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  // When packaged, __dirname points inside the .asar virtual filesystem which
  // Python cannot access. Use the unpacked path instead so the script exists
  // as a real file on disk.
  const appDir = app.isPackaged
    ? app.getAppPath().replace('app.asar', 'app.asar.unpacked')
    : __dirname;
  const scriptPath = path.join(appDir, 'beatrice_audio.py');
  console.log('[Beatrice] Spawning Python audio backend:', scriptPath);

  let spawnCmd;
  let spawnArgs = [];

  if (app.isPackaged) {
    const fs = require('fs');
    const exePath = path.join(appDir, 'beatrice_audio.exe');
    if (fs.existsSync(exePath)) {
      spawnCmd = exePath;
    } else {
      spawnCmd = process.platform === 'win32' ? 'python' : 'python3';
      spawnArgs = ['-u', scriptPath];
    }
  } else {
    spawnCmd = process.platform === 'win32' ? 'python' : 'python3';
    spawnArgs = ['-u', scriptPath];

    if (process.platform === 'darwin') {
      try {
        const { execSync } = require('child_process');
        const isArm = execSync('sysctl -in hw.optional.arm64').toString().trim() === '1';
        if (isArm) {
          spawnCmd = 'arch';
          spawnArgs = ['-arm64', 'python3', '-u', scriptPath];
        }
      } catch (e) {
        console.error('[Beatrice] Failed to check for Apple Silicon:', e);
      }
    }
  }

  pythonProcess = spawn(spawnCmd, spawnArgs, {
    cwd: appDir,
  });

  pythonProcess.stdout.on('data', data =>
    console.log('[Python]', data.toString().trimEnd()));

  pythonProcess.stderr.on('data', data =>
    console.error('[Python ERR]', data.toString().trimEnd()));

  pythonProcess.on('error', err =>
    console.error('[Beatrice] Failed to start Python backend:', err.message));

  pythonProcess.on('close', code =>
    console.log('[Beatrice] Python backend exited with code', code));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(ICON_PATH);
    app.dock.setIcon(icon);
  }
  startBackend();
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it is conventional to keep the process running
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (pythonProcess) {
    console.log('[Beatrice] Terminating Python backend…');
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
});

// Window control IPC handlers
ipcMain.on('win-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('win-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('win-close', () => {
  if (mainWindow) mainWindow.close();
});
