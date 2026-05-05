import axios from 'axios';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { writeLog } from './ffmpeg';
import { JsonStore } from './jsonStore';

export type ModelDefinition = {
  id: string;
  size: number;
  lang: 'multi' | 'en';
  tags: string[];
  default?: boolean;
};

export type ModelRecord = ModelDefinition & {
  installed: boolean;
  path?: string;
};

export type DownloadProgress = {
  modelId: string;
  bytesReceived: number;
  totalBytes: number;
  speed: number;
  eta: number;
};

type DownloadState = {
  controller: AbortController;
  paused: boolean;
  cancelled: boolean;
};

const store = new JsonStore<{ pausedDownloads: string[] }>('models', {
  pausedDownloads: []
});

export const MODELS: ModelDefinition[] = [
  { id: 'tiny', size: 75e6, lang: 'multi', tags: [] },
  { id: 'tiny.en', size: 75e6, lang: 'en', tags: [] },
  { id: 'base', size: 142e6, lang: 'multi', tags: [] },
  { id: 'base.en', size: 142e6, lang: 'en', tags: [] },
  { id: 'small', size: 466e6, lang: 'multi', tags: [], default: true },
  { id: 'small.en', size: 466e6, lang: 'en', tags: [], default: true },
  { id: 'small.en-tdrz', size: 466e6, lang: 'en', tags: ['diarize'] },
  { id: 'medium', size: 1500e6, lang: 'multi', tags: [] },
  { id: 'medium.en', size: 1500e6, lang: 'en', tags: [] },
  { id: 'large-v3', size: 3100e6, lang: 'multi', tags: [] },
  { id: 'large-v3-q5_0', size: 1100e6, lang: 'multi', tags: ['quantized'] },
  { id: 'large-v3-turbo', size: 1600e6, lang: 'multi', tags: [] }
];

const downloads = new Map<string, DownloadState>();

export function getModelsDir() {
  return path.join(app.getPath('userData'), 'models');
}

export function getModelPath(modelId: string) {
  return path.join(getModelsDir(), `ggml-${modelId}.bin`);
}

export async function resolveModelPath(modelId: string) {
  const candidates = getModelCandidates(modelId);
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }
  return getModelPath(modelId);
}

export async function listModels(): Promise<ModelRecord[]> {
  await fs.ensureDir(getModelsDir());

  return Promise.all(
    MODELS.map(async (model) => {
      const modelPath = await resolveModelPath(model.id);
      const installed = await fs.pathExists(modelPath);
      return {
        ...model,
        installed,
        path: installed ? modelPath : undefined
      };
    })
  );
}

export function selectModel(
  lang: string,
  diarize: boolean,
  installed: ModelRecord[]
) {
  let candidates = installed.filter((model) => model.installed);
  if (lang === 'en') {
    const enModels = candidates.filter((model) => model.id.includes('.en'));
    if (enModels.length) {
      candidates = enModels;
    }
  }
  if (diarize) {
    const tdrz = candidates.filter((model) => model.id.includes('-tdrz'));
    if (tdrz.length) {
      candidates = tdrz;
    }
  }
  return candidates.find((model) => model.id.includes('small')) ?? candidates[0];
}

export async function downloadModel(
  modelId: string,
  onProgress: (payload: DownloadProgress) => void
) {
  const model = MODELS.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Modèle inconnu: ${modelId}`);
  }

  await fs.ensureDir(getModelsDir());

  const destination = getModelPath(modelId);
  const partialPath = `${destination}.part`;
  const existingBytes = (await fs.pathExists(partialPath))
    ? (await fs.stat(partialPath)).size
    : 0;

  const controller = new AbortController();
  downloads.set(modelId, { controller, paused: false, cancelled: false });

  const startedAt = Date.now();
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelId}.bin`;
  const response = await axios.get(url, {
    responseType: 'stream',
    signal: controller.signal,
    headers: existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : undefined
  });

  const totalBytes = Number(response.headers['content-length'] ?? model.size) + existingBytes;
  let bytesReceived = existingBytes;
  const writer = fs.createWriteStream(partialPath, {
    flags: existingBytes > 0 ? 'a' : 'w'
  });

  await new Promise<void>((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
      const speed = (bytesReceived - existingBytes) / elapsedSeconds;
      const remaining = Math.max(totalBytes - bytesReceived, 0);
      onProgress({
        modelId,
        bytesReceived,
        totalBytes,
        speed,
        eta: speed > 0 ? remaining / speed : 0
      });
    });

    response.data.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', resolve);

    response.data.pipe(writer);
  }).catch(async (error) => {
    const state = downloads.get(modelId);
    if (state?.paused) {
      return;
    }
    if (state?.cancelled) {
      await fs.remove(partialPath);
      return;
    }
    await writeLog(`Téléchargement du modèle ${modelId} en échec: ${String(error)}`);
    throw error;
  });

  const state = downloads.get(modelId);
  if (state?.paused || state?.cancelled) {
    return;
  }

  await fs.move(partialPath, destination, { overwrite: true });
  const stat = await fs.stat(destination);
  if (Math.abs(stat.size - model.size) > 5_000_000) {
    await fs.remove(destination);
    throw new Error('Le fichier téléchargé semble incomplet.');
  }
  downloads.delete(modelId);
  await updatePausedDownloads(modelId, false);
}

export function pauseDownload(modelId: string) {
  const state = downloads.get(modelId);
  if (!state) {
    return;
  }
  state.paused = true;
  void updatePausedDownloads(modelId, true);
  controllerCleanup(modelId);
}

export async function cancelDownload(modelId: string) {
  const state = downloads.get(modelId);
  if (state) {
    state.cancelled = true;
    controllerCleanup(modelId);
  }
  await fs.remove(`${getModelPath(modelId)}.part`);
  await updatePausedDownloads(modelId, false);
}

function controllerCleanup(modelId: string) {
  const state = downloads.get(modelId);
  if (!state) {
    return;
  }
  state.controller.abort();
  downloads.delete(modelId);
}

export async function deleteModel(modelId: string) {
  const modelPath = await resolveModelPath(modelId);
  if (modelPath.startsWith(getModelsDir())) {
    await fs.remove(modelPath);
  }
}

export async function ensureStarterModels(
  onLog: (message: string) => void,
  onProgress: (payload: DownloadProgress) => void
) {
  const existing = await listModels();
  const mustInstall = ['small', 'small.en'].filter((id) => {
    const model = existing.find((entry) => entry.id === id);
    return !model?.installed;
  });

  for (const modelId of mustInstall) {
    onLog(`Téléchargement initial de ${modelId}...`);
    await downloadModel(modelId, onProgress);
    onLog(`${modelId} prêt.`);
  }
}

export async function getPausedDownloads() {
  const data = await store.getAll();
  return data.pausedDownloads;
}

async function updatePausedDownloads(modelId: string, paused: boolean) {
  const data = await store.getAll();
  const next = new Set(data.pausedDownloads);
  if (paused) {
    next.add(modelId);
  } else {
    next.delete(modelId);
  }
  await store.set({
    pausedDownloads: [...next]
  });
}

function getModelCandidates(modelId: string) {
  const fileName = `ggml-${modelId}.bin`;
  const explicitDir = process.env.WESPR_MODELS_DIR;
  const home = os.homedir();

  return [
    getModelPath(modelId),
    ...(explicitDir ? [path.join(explicitDir, fileName)] : []),
    '/Users/camile/Dev/ai/whisper-cpp/models/' + fileName,
    path.join(home, 'Dev', 'ai', 'whisper-cpp', 'models', fileName),
    path.join(home, '.cache', 'whisper.cpp', fileName)
  ];
}
