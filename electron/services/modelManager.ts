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
  managed: boolean;
  source: 'wespr' | 'external';
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

async function isValidModelFile(filePath: string, expectedBytes: number) {
  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  const stat = await fs.stat(filePath);
  return Math.abs(stat.size - expectedBytes) <= 5_000_000;
}

async function resolveInstalledModel(modelId: string) {
  const model = MODELS.find((entry) => entry.id === modelId);
  if (!model) {
    return null;
  }

  for (const candidate of getModelCandidates(modelId)) {
    if (await isValidModelFile(candidate.path, model.size)) {
      return candidate;
    }
  }

  return null;
}

export async function resolveModelPath(modelId: string) {
  const installed = await resolveInstalledModel(modelId);
  return installed?.path ?? getModelPath(modelId);
}

export async function listModels(): Promise<ModelRecord[]> {
  await fs.ensureDir(getModelsDir());

  return Promise.all(
    MODELS.map(async (model) => {
      const installedModel = await resolveInstalledModel(model.id);
      return {
        ...model,
        installed: Boolean(installedModel),
        path: installedModel?.path,
        managed: installedModel?.source === 'wespr',
        source: installedModel?.source ?? 'wespr'
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
  const partialBytes = (await fs.pathExists(partialPath))
    ? (await fs.stat(partialPath)).size
    : 0;

  const controller = new AbortController();
  downloads.set(modelId, { controller, paused: false, cancelled: false });

  const startedAt = Date.now();
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelId}.bin`;
  let response;

  try {
    response = await axios.get(url, {
      responseType: 'stream',
      signal: controller.signal,
      headers: partialBytes > 0 ? { Range: `bytes=${partialBytes}-` } : undefined,
      validateStatus: (status) => status >= 200 && status < 400
    });
  } catch (error) {
    downloads.delete(modelId);
    throw toModelDownloadError(error, modelId);
  }

  const appendMode = partialBytes > 0 && response.status === 206;
  if (partialBytes > 0 && !appendMode && (await fs.pathExists(partialPath))) {
    await fs.remove(partialPath);
  }

  const resumedBytes = appendMode ? partialBytes : 0;
  const contentRange = String(response.headers['content-range'] ?? '');
  const totalFromRange = Number(contentRange.split('/').pop());
  const totalFromLength = Number(response.headers['content-length'] ?? 0);
  const totalBytes = Number.isFinite(totalFromRange) && totalFromRange > 0
    ? totalFromRange
    : appendMode && totalFromLength > 0
      ? totalFromLength + resumedBytes
      : totalFromLength > 0
        ? totalFromLength
        : model.size;
  let bytesReceived = resumedBytes;
  const writer = fs.createWriteStream(partialPath, {
    flags: appendMode ? 'a' : 'w'
  });

  await new Promise<void>((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
      const speed = (bytesReceived - resumedBytes) / elapsedSeconds;
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
    const normalized = toModelDownloadError(error, modelId);
    await writeLog(`Téléchargement du modèle ${modelId} en échec: ${normalized.message}`);
    throw normalized;
  });

  const state = downloads.get(modelId);
  if (state?.paused || state?.cancelled) {
    return;
  }

  if (!(await fs.pathExists(partialPath))) {
    downloads.delete(modelId);
    throw new Error('Téléchargement interrompu avant la fin du fichier — relancez l’installation du modèle.');
  }

  try {
    await fs.move(partialPath, destination, { overwrite: true });
  } catch (error) {
    downloads.delete(modelId);
    if (typeof error === 'object' && error && 'code' in error && String((error as { code?: unknown }).code) === 'ENOENT') {
      throw new Error('Téléchargement interrompu avant la fin du fichier — relancez l’installation du modèle.');
    }
    throw toModelDownloadError(error, modelId);
  }

  if (!(await isValidModelFile(destination, model.size))) {
    await fs.remove(destination);
    downloads.delete(modelId);
    throw new Error('Le fichier téléchargé est incomplet — relancez l’installation du modèle.');
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
  const installed = await resolveInstalledModel(modelId);
  if (installed?.source === 'wespr') {
    await fs.remove(installed.path);
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
    {
      path: getModelPath(modelId),
      source: 'wespr' as const
    },
    ...(explicitDir
      ? [
          {
            path: path.join(explicitDir, fileName),
            source: 'external' as const
          }
        ]
      : []),
    {
      path: '/Users/camile/Dev/ai/whisper-cpp/models/' + fileName,
      source: 'external' as const
    },
    {
      path: path.join(home, 'Dev', 'ai', 'whisper-cpp', 'models', fileName),
      source: 'external' as const
    },
    {
      path: path.join(home, '.cache', 'whisper.cpp', fileName),
      source: 'external' as const
    }
  ];
}

function toModelDownloadError(error: unknown, modelId: string) {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ERR_CANCELED') {
      return new Error('Téléchargement interrompu.');
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return new Error(`Le serveur a refusé l’accès au modèle ${modelId} — réessayez plus tard.`);
    }
    if (error.response?.status === 404) {
      return new Error(`Le modèle ${modelId} est introuvable sur le serveur.`);
    }
    if (error.code === 'ENOSPC') {
      return new Error('Espace disque insuffisant pour installer ce modèle.');
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return new Error('Permission refusée pendant l’écriture du modèle sur ce Mac.');
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return new Error('Connexion impossible pour télécharger le modèle — vérifiez votre réseau puis réessayez.');
    }
  }

  if (typeof error === 'object' && error && 'code' in error) {
    const code = String((error as { code?: unknown }).code);
    if (code === 'ENOSPC') {
      return new Error('Espace disque insuffisant pour installer ce modèle.');
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return new Error('Permission refusée pendant l’écriture du modèle sur ce Mac.');
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Téléchargement impossible pour le moment — réessayez dans quelques instants.');
}
