import fs from 'node:fs';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { app, BrowserWindow, nativeImage, nativeTheme, protocol, session, systemPreferences } from 'electron';
import { ensureBundledBinaries, writeLog } from './services/ffmpeg';
import { registerTranscribeIpc } from './ipc/transcribe';
import { registerModelIpc } from './ipc/models';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'wespr-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;

app.setName('WeSpR');

function createWindow() {
  const appIconPath = resolveWindowIconPath();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1140,
    minHeight: 760,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor: '#0e0d12',
    icon: appIconPath,
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
  applyDockIcon();
  protocol.handle('wespr-media', async (request) => {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    if (!filePath) {
      return new Response('Chemin média manquant.', { status: 400 });
    }
    const info = await stat(filePath);
    const range = request.headers.get('range');
    const contentType = guessMediaType(filePath);

    if (!range) {
      return new Response(Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(info.size),
          'Content-Type': contentType
        }
      });
    }

    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return new Response('Plage invalide.', { status: 416 });
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : info.size - 1;
    const safeEnd = Math.min(end, info.size - 1);

    if (!Number.isFinite(start) || start < 0 || start >= info.size || safeEnd < start) {
      return new Response('Plage invalide.', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${info.size}`
        }
      });
    }

    return new Response(
      Readable.toWeb(fs.createReadStream(filePath, { start, end: safeEnd })) as ReadableStream,
      {
        status: 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(safeEnd - start + 1),
          'Content-Range': `bytes ${start}-${safeEnd}/${info.size}`,
          'Content-Type': contentType
        }
      }
    );
  });
  session.defaultSession.setPermissionRequestHandler(async (_webContents, permission, callback) => {
    if (permission === 'media') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      void writeLog(`mic: permission request from renderer → ${String(granted)}`);
      callback(granted);
    } else {
      callback(false);
    }
  });

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

function guessMediaType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm'
  };
  return types[ext] ?? 'application/octet-stream';
}

function resolveAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.icns')
    : path.join(app.getAppPath(), 'resources', 'icon.icns');
}

function resolveWindowIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png');
}

function applyDockIcon() {
  if (process.platform !== 'darwin') {
    return;
  }

  const iconPath = resolveWindowIconPath();
  if (!fs.existsSync(iconPath)) {
    return;
  }

  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) {
    app.dock.setIcon(image);
  }
}
