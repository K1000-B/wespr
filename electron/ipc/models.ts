import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { BrowserWindow, ipcMain, shell } from 'electron';
import {
  cancelDownload,
  deleteModel,
  downloadModel,
  ensureStarterModels,
  listModels,
  pauseDownload
} from '../services/modelManager';
import { clearTempCache } from '../services/cleanup';
import { ensureBundledBinaries, getLogPath, runCommand } from '../services/ffmpeg';
import { JsonStore } from '../services/jsonStore';

type AppPrefs = {
  defaultModelId?: string;
  timestampGranularity?: 'segment' | '10s' | '30s' | '1min';
  exportDirectory?: string;
};

const prefsStore = new JsonStore<AppPrefs>('preferences', {
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
    await downloadModel(id, (progress) => {
      sendToRenderer('wespr:download-progress', progress);
    });
  });

  ipcMain.handle('wespr:pause-download', (_event, id: string) => pauseDownload(id));
  ipcMain.handle('wespr:cancel-download', (_event, id: string) => cancelDownload(id));
  ipcMain.handle('wespr:delete-model', async (_event, id: string) => deleteModel(id));

  ipcMain.handle('wespr:get-prefs', async () => prefsStore.getAll());
  ipcMain.handle('wespr:set-prefs', async (_event, prefs: Record<string, unknown>) => {
    await prefsStore.set(prefs as Partial<AppPrefs>);
  });

  ipcMain.handle('wespr:open-logs-dir', async () => shell.openPath(getLogPath()));
  ipcMain.handle('wespr:clear-cache', async () => clearTempCache());

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

  ipcMain.handle('wespr:open-logs', async () => shell.openPath(getLogPath()));
}

export async function bootstrapModelsIfNeeded() {
  await fs.ensureDir(path.dirname(getLogPath()));
  await ensureStarterModels(
    (message) => sendToRenderer('wespr:bootstrap-log', message),
    (progress) => sendToRenderer('wespr:download-progress', progress)
  );
}
