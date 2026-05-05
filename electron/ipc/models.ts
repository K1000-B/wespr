import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import {
  cancelDownload,
  deleteModel,
  downloadModel,
  getPausedDownloads,
  getModelsDir,
  listModels,
  pauseDownload
} from '../services/modelManager';
import { clearTempCache, getTempCacheSize } from '../services/cleanup';
import { ensureBundledBinaries, getLogDir, getLogPath, runCommand } from '../services/ffmpeg';
import { JsonStore } from '../services/jsonStore';

type AppPrefs = {
  defaultModelId: string;
  timestampGranularity: 'segment' | '10s' | '30s' | '1min';
  exportDirectory: string;
};

const prefsStore = new JsonStore<AppPrefs>('preferences', {
  defaultModelId: '',
  timestampGranularity: 'segment',
  exportDirectory: path.join(os.homedir(), 'Downloads')
});

function sendToRenderer(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

export function registerModelIpc() {
  ipcMain.handle('wespr:list-models', async () => listModels());

  ipcMain.handle('wespr:download-model', async (_event, id: string) => {
    return downloadModel(id, (progress) => {
      sendToRenderer('wespr:download-progress', progress);
    });
  });

  ipcMain.handle('wespr:pause-download', (_event, id: string) => pauseDownload(id));
  ipcMain.handle('wespr:cancel-download', (_event, id: string) => cancelDownload(id));
  ipcMain.handle('wespr:delete-model', async (_event, id: string) => deleteModel(id));
  ipcMain.handle('wespr:get-paused-downloads', async () => getPausedDownloads());

  ipcMain.handle('wespr:get-prefs', async () => prefsStore.getAll());
  ipcMain.handle('wespr:set-prefs', async (_event, prefs: Partial<AppPrefs>) => {
    await prefsStore.set(prefs);
    return prefsStore.getAll();
  });

  ipcMain.handle('wespr:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir un dossier',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('wespr:open-path', async (_event, targetPath: string) => {
    if (await fs.pathExists(targetPath)) {
      const stat = await fs.stat(targetPath);
      if (stat.isFile()) {
        shell.showItemInFolder(targetPath);
        return '';
      }
    }
    return shell.openPath(targetPath);
  });

  ipcMain.handle('wespr:clear-cache', async () => clearTempCache());
  ipcMain.handle('wespr:get-storage-info', async () => {
    const prefs = await prefsStore.getAll();
    const models = await listModels();
    const managedModelsBytes = models
      .filter((model) => model.installed && model.managed)
      .reduce((sum, model) => sum + model.size, 0);
    const logBytes = (await fs.pathExists(getLogPath())) ? (await fs.stat(getLogPath())).size : 0;

    return {
      modelsDir: getModelsDir(),
      logsPath: getLogPath(),
      tempDir: app.getPath('temp'),
      exportDirectory: prefs.exportDirectory,
      managedModelsBytes,
      logBytes,
      tempCacheBytes: await getTempCacheSize()
    };
  });

  ipcMain.handle('wespr:get-version', async () => {
    const binaries = await ensureBundledBinaries();
    let ffmpegVersion = 'indisponible';
    let whisperVersion = 'indisponible';

    try {
      const ffmpeg = await runCommand(binaries.ffmpeg, ['-version']);
      ffmpegVersion = ffmpeg.stdout.split('\n')[0] ?? ffmpegVersion;
    } catch {
      ffmpegVersion = 'ffmpeg non trouvé';
    }

    try {
      const whisper = await runCommand(binaries.whisper, ['--help']);
      const helpText = [whisper.stdout, whisper.stderr].find((value) => value.trim().length > 0) ?? '';
      whisperVersion = helpText.split('\n')[0] || 'whisper.cpp prêt';
    } catch {
      whisperVersion = 'whisper.cpp non trouvé';
    }

    return {
      app: '1.0.0',
      whisperCpp: whisperVersion,
      ffmpeg: ffmpegVersion
    };
  });

  ipcMain.handle('wespr:open-logs', async () => shell.openPath(getLogDir()));
}
