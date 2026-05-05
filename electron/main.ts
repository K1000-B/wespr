import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { ensureBundledBinaries, writeLog } from './services/ffmpeg';
import { registerTranscribeIpc } from './ipc/transcribe';
import { registerModelIpc } from './ipc/models';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1140,
    minHeight: 760,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: '#0e0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  await ensureBundledBinaries();
  registerTranscribeIpc();
  registerModelIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('render-process-gone', (_event, _webContents, details) => {
  void writeLog(`Renderer arrêté: ${details.reason}`);
});
