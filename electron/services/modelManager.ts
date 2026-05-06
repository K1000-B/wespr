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
  downloadable?: boolean;
  note?: string;
  summary: string;
  speedScore: number;
  qualityScore: number;
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

export type DownloadResult = 'completed' | 'paused' | 'cancelled';

type DownloadState = {
  controller: AbortController;
  paused: boolean;
  cancelled: boolean;
};

type HuggingFaceModelApi = {
  siblings?: Array<{ rfilename?: string }>;
};

const store = new JsonStore<{ pausedDownloads: string[] }>('models', {
  pausedDownloads: []
});

const STATIC_MODELS: ModelDefinition[] = [
  { id: 'tiny', size: 75e6, lang: 'multi', tags: [], summary: 'Très rapide pour des brouillons multilingues.', speedScore: 5, qualityScore: 2 },
  { id: 'tiny-q5_1', size: 31e6, lang: 'multi', tags: ['quantized'], summary: 'Version très légère pour les Macs les plus contraints.', speedScore: 5, qualityScore: 1 },
  { id: 'tiny-q8_0', size: 42e6, lang: 'multi', tags: ['quantized'], summary: 'Très léger avec un peu plus de fidélité que q5.', speedScore: 5, qualityScore: 2 },
  { id: 'tiny.en', size: 75e6, lang: 'en', tags: [], summary: 'Très rapide si votre audio est uniquement en anglais.', speedScore: 5, qualityScore: 2 },
  { id: 'tiny.en-q5_1', size: 31e6, lang: 'en', tags: ['quantized'], summary: 'Anglais, très léger, pratique pour des tests rapides.', speedScore: 5, qualityScore: 1 },
  { id: 'tiny.en-q8_0', size: 42e6, lang: 'en', tags: ['quantized'], summary: 'Anglais, léger, un peu plus propre que q5.', speedScore: 5, qualityScore: 2 },
  { id: 'base', size: 142e6, lang: 'multi', tags: [], summary: 'Bon point de départ multilingue, encore rapide.', speedScore: 4, qualityScore: 3 },
  { id: 'base-q5_1', size: 57e6, lang: 'multi', tags: ['quantized'], summary: 'Base multilingue compressé pour économiser l’espace.', speedScore: 4, qualityScore: 2 },
  { id: 'base-q8_0', size: 78e6, lang: 'multi', tags: ['quantized'], summary: 'Base multilingue compressé avec meilleure fidélité.', speedScore: 4, qualityScore: 3 },
  { id: 'base.en', size: 142e6, lang: 'en', tags: [], summary: 'Rapide et adapté à des réunions ou notes en anglais.', speedScore: 4, qualityScore: 3 },
  { id: 'base.en-q5_1', size: 57e6, lang: 'en', tags: ['quantized'], summary: 'Anglais compressé pour gagner de la place.', speedScore: 4, qualityScore: 2 },
  { id: 'base.en-q8_0', size: 78e6, lang: 'en', tags: ['quantized'], summary: 'Anglais compressé avec rendu plus propre.', speedScore: 4, qualityScore: 3 },
  { id: 'small', size: 466e6, lang: 'multi', tags: [], default: true, summary: 'Le meilleur équilibre vitesse/précision pour la plupart des usages.', speedScore: 3, qualityScore: 4 },
  { id: 'small-q5_1', size: 181e6, lang: 'multi', tags: ['quantized'], summary: 'Compromis léger si vous manquez d’espace disque.', speedScore: 4, qualityScore: 3 },
  { id: 'small-q8_0', size: 252e6, lang: 'multi', tags: ['quantized'], summary: 'Compromis léger avec meilleure précision que q5.', speedScore: 4, qualityScore: 4 },
  { id: 'small.en', size: 466e6, lang: 'en', tags: [], default: true, summary: 'Excellent choix si vos enregistrements sont en anglais.', speedScore: 3, qualityScore: 4 },
  { id: 'small.en-q5_1', size: 181e6, lang: 'en', tags: ['quantized'], summary: 'Version anglaise allégée pour les machines plus modestes.', speedScore: 4, qualityScore: 3 },
  { id: 'small.en-q8_0', size: 252e6, lang: 'en', tags: ['quantized'], summary: 'Version anglaise allégée avec bon rendu.', speedScore: 4, qualityScore: 4 },
  {
    id: 'small.en-tdrz',
    size: 466e6,
    lang: 'en',
    tags: ['diarize'],
    downloadable: true,
    note: 'Téléchargé via le dépôt tinydiarize, car le fichier manque dans les fichiers du dépôt officiel.',
    summary: 'Modèle anglais pour marquer les changements de locuteur.',
    speedScore: 3,
    qualityScore: 4
  },
  { id: 'medium', size: 1500e6, lang: 'multi', tags: [], summary: 'Plus précis sur des audios difficiles ou du vocabulaire dense.', speedScore: 2, qualityScore: 5 },
  { id: 'medium-q5_0', size: 514e6, lang: 'multi', tags: ['quantized'], summary: 'Version moyenne compressée, utile si vous voulez plus fin que small sans 1,5 Go.', speedScore: 3, qualityScore: 4 },
  { id: 'medium-q8_0', size: 785e6, lang: 'multi', tags: ['quantized'], summary: 'Très bon compromis pour améliorer la précision sans passer à large.', speedScore: 3, qualityScore: 5 },
  { id: 'medium.en', size: 1500e6, lang: 'en', tags: [], summary: 'Très bon niveau de détail pour des audios anglais exigeants.', speedScore: 2, qualityScore: 5 },
  { id: 'medium.en-q5_0', size: 514e6, lang: 'en', tags: ['quantized'], summary: 'Anglais, plus précis que small, avec taille réduite.', speedScore: 3, qualityScore: 4 },
  { id: 'medium.en-q8_0', size: 785e6, lang: 'en', tags: ['quantized'], summary: 'Anglais, très solide, avec taille encore raisonnable.', speedScore: 3, qualityScore: 5 },
  { id: 'large-v1', size: 2900e6, lang: 'multi', tags: [], summary: 'Ancienne grande version, encore utile si vous la connaissez déjà.', speedScore: 1, qualityScore: 4 },
  { id: 'large-v2', size: 2900e6, lang: 'multi', tags: [], summary: 'Grande version plus ancienne, très précise mais lourde.', speedScore: 1, qualityScore: 5 },
  { id: 'large-v2-q5_0', size: 1100e6, lang: 'multi', tags: ['quantized'], summary: 'Grande version compressée pour garder de la précision.', speedScore: 2, qualityScore: 5 },
  { id: 'large-v2-q8_0', size: 1500e6, lang: 'multi', tags: ['quantized'], summary: 'Grande version compressée avec rendu haut de gamme.', speedScore: 2, qualityScore: 5 },
  { id: 'large-v3', size: 3100e6, lang: 'multi', tags: [], summary: 'Très haute précision, surtout utile si la vitesse compte peu.', speedScore: 1, qualityScore: 5 },
  { id: 'large-v3-q5_0', size: 1100e6, lang: 'multi', tags: ['quantized'], summary: 'Large v3 compressé pour limiter le poids disque.', speedScore: 2, qualityScore: 5 },
  { id: 'large-v3-turbo', size: 1600e6, lang: 'multi', tags: ['turbo'], summary: 'Version rapide de large-v3, très intéressante sur Mac puissant.', speedScore: 3, qualityScore: 5 },
  { id: 'large-v3-turbo-q5_0', size: 547e6, lang: 'multi', tags: ['quantized', 'turbo'], summary: 'Turbo compressé, très bon compromis haut de gamme.', speedScore: 4, qualityScore: 4 },
  { id: 'large-v3-turbo-q8_0', size: 834e6, lang: 'multi', tags: ['quantized', 'turbo'], summary: 'Turbo compressé avec plus de fidélité.', speedScore: 3, qualityScore: 5 }
];

const REMOTE_MODEL_CARD_URL = 'https://huggingface.co/ggerganov/whisper.cpp/raw/main/README.md';
const REMOTE_MODEL_API_URL = 'https://huggingface.co/api/models/ggerganov/whisper.cpp';
const FALLBACK_DOWNLOADS: Record<string, { url: string; note: string }> = {
  'small.en-tdrz': {
    url: 'https://huggingface.co/akashmjn/tinydiarize-whisper.cpp/resolve/main/ggml-small.en-tdrz.bin',
    note: 'Téléchargé via le dépôt tinydiarize, car le fichier manque dans les fichiers du dépôt officiel.'
  }
};

let cachedCatalog: ModelDefinition[] | null = null;
let cachedCatalogAt = 0;

const downloads = new Map<string, DownloadState>();

export function getModelsDir() {
  return path.join(app.getPath('userData'), 'models');
}

export function getModelPath(modelId: string) {
  return path.join(getModelsDir(), `ggml-${modelId}.bin`);
}

async function isManagedModelFile(filePath: string, expectedBytes: number) {
  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  const stat = await fs.stat(filePath);
  const minimumBytes = Math.floor(expectedBytes * 0.9);
  const maximumBytes = Math.ceil(expectedBytes * 1.1);
  return stat.size >= minimumBytes && stat.size <= maximumBytes;
}

async function isDetectedExternalModelFile(filePath: string, expectedBytes: number) {
  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  const stat = await fs.stat(filePath);
  const minimumBytes = Math.floor(expectedBytes * 0.85);
  const maximumBytes = Math.ceil(expectedBytes * 1.15);
  return stat.size >= minimumBytes && stat.size <= maximumBytes;
}

async function resolveInstalledModel(modelId: string) {
  const catalog = await getModelCatalog();
  const model = catalog.find((entry) => entry.id === modelId);
  if (!model) {
    return null;
  }

  for (const candidate of getModelCandidates(modelId)) {
    const valid = candidate.source === 'wespr'
      ? await isManagedModelFile(candidate.path, model.size)
      : await isDetectedExternalModelFile(candidate.path, model.size);
    if (valid) {
      return candidate;
    }
  }

  return null;
}

async function resolveInstalledModelOffline(modelId: string) {
  // Résolution hors ligne : utilise le cache déjà chargé ou les modèles statiques.
  // Évite toute requête réseau pendant la transcription.
  const catalog = cachedCatalog ?? STATIC_MODELS;
  const model = catalog.find((entry) => entry.id === modelId);
  if (!model) {
    return null;
  }

  for (const candidate of getModelCandidates(modelId)) {
    const valid = candidate.source === 'wespr'
      ? await isManagedModelFile(candidate.path, model.size)
      : await isDetectedExternalModelFile(candidate.path, model.size);
    if (valid) {
      return candidate;
    }
  }

  return null;
}

export async function resolveModelPath(modelId: string) {
  const installed = await resolveInstalledModelOffline(modelId);
  return installed?.path ?? getModelPath(modelId);
}

export async function listModels(): Promise<ModelRecord[]> {
  await fs.ensureDir(getModelsDir());
  const catalog = await getModelCatalog();

  return Promise.all(
    catalog.map(async (model) => {
      const installedModel = await resolveInstalledModel(model.id);
      return {
        ...model,
        installed: Boolean(installedModel),
        path: installedModel?.path,
        managed: installedModel?.source === 'wespr',
        source: installedModel?.source ?? 'wespr',
        downloadable: model.downloadable !== false,
        note: model.note
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
): Promise<DownloadResult> {
  const catalog = await getModelCatalog();
  const model = catalog.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Modèle inconnu: ${modelId}`);
  }
  if (model.downloadable === false) {
    throw new Error(model.note ?? `Le modèle ${modelId} doit être ajouté manuellement.`);
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
  const url = getModelDownloadUrl(modelId);
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
  let interrupted: DownloadResult | null = null;
  let lastProgressAt = 0;
  const writer = fs.createWriteStream(partialPath, {
    flags: appendMode ? 'a' : 'w'
  });

  await new Promise<void>((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
      const speed = (bytesReceived - resumedBytes) / elapsedSeconds;
      const remaining = Math.max(totalBytes - bytesReceived, 0);
      const now = Date.now();
      const shouldEmit = bytesReceived >= totalBytes || now - lastProgressAt >= 120;
      if (!shouldEmit) {
        return;
      }
      lastProgressAt = now;
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
      interrupted = 'paused';
      return;
    }
    if (state?.cancelled) {
      await fs.remove(partialPath);
      interrupted = 'cancelled';
      return;
    }
    const normalized = toModelDownloadError(error, modelId);
    await writeLog(`Téléchargement du modèle ${modelId} en échec: ${normalized.message}`);
    throw normalized;
  });

  if (interrupted) {
    return interrupted;
  }

  const state = downloads.get(modelId);
  if (state?.paused || state?.cancelled) {
    return state.paused ? 'paused' : 'cancelled';
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

  if (!(await isManagedModelFile(destination, totalBytes))) {
    await fs.remove(destination);
    downloads.delete(modelId);
    throw new Error('Le fichier téléchargé est incomplet — relancez l’installation du modèle.');
  }
  downloads.delete(modelId);
  await updatePausedDownloads(modelId, false);
  return 'completed';
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

async function getModelCatalog() {
  const now = Date.now();
  if (cachedCatalog && now - cachedCatalogAt < 5 * 60_000) {
    return cachedCatalog;
  }

  try {
    const [readmeResponse, apiResponse] = await Promise.all([
      axios.get<string>(REMOTE_MODEL_CARD_URL, {
        responseType: 'text',
        timeout: 10_000
      }),
      axios.get<HuggingFaceModelApi>(REMOTE_MODEL_API_URL, {
        timeout: 10_000
      })
    ]);

    const parsed = parseModelCard(readmeResponse.data, apiResponse.data);
    if (parsed.length > 0) {
      cachedCatalog = parsed;
      cachedCatalogAt = now;
      return parsed;
    }
  } catch (error) {
    await writeLog(`Catalogue distant indisponible, repli local: ${String(error)}`);
  }

  cachedCatalog = STATIC_MODELS;
  cachedCatalogAt = now;
  return STATIC_MODELS;
}

function parseModelCard(readme: string, api: HuggingFaceModelApi) {
  const siblings = new Set(
    (api.siblings ?? [])
      .map((entry) => entry.rfilename)
      .filter((value): value is string => Boolean(value))
  );

  const lines = readme.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Available models');
  if (start < 0) {
    return STATIC_MODELS;
  }

  const parsed: ModelDefinition[] = [];
  for (let index = start + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('|')) {
      if (parsed.length > 0) {
        break;
      }
      continue;
    }

    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 3 || cells[0] === 'Model' || cells[0] === '---') {
      continue;
    }

    const id = cells[0];
    const size = parseDiskSize(cells[1]);
    const fallback = FALLBACK_DOWNLOADS[id];
    const hints = getModelHints(id);
    const downloadable = siblings.has(`ggml-${id}.bin`) || Boolean(fallback);
    parsed.push({
      id,
      size,
      lang: inferLanguage(id),
      tags: inferTags(id),
      default: id === 'small' || id === 'small.en',
      downloadable,
      note: !siblings.has(`ggml-${id}.bin`) && fallback
        ? fallback.note
        : !siblings.has(`ggml-${id}.bin`) && id.includes('-tdrz')
          ? 'La page officielle le liste, mais le fichier n’est pas servi dans les fichiers du dépôt officiel.'
          : undefined,
      summary: hints.summary,
      speedScore: hints.speedScore,
      qualityScore: hints.qualityScore
    });
  }

  return parsed.length > 0 ? parsed : STATIC_MODELS;
}

function parseDiskSize(value: string) {
  const match = value.match(/([\d.]+)\s*(MiB|GiB)/i);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'gib' ? amount * 1024 * 1024 * 1024 : amount * 1024 * 1024;
}

function inferLanguage(id: string): ModelDefinition['lang'] {
  return id.includes('.en') ? 'en' : 'multi';
}

function inferTags(id: string) {
  const tags: string[] = [];
  if (id.includes('q5') || id.includes('q8')) {
    tags.push('quantized');
  }
  if (id.includes('turbo')) {
    tags.push('turbo');
  }
  if (id.includes('tdrz')) {
    tags.push('diarize');
  }
  return tags;
}

function getModelHints(id: string) {
  const fromStatic = STATIC_MODELS.find((entry) => entry.id === id);
  if (fromStatic) {
    return {
      summary: fromStatic.summary,
      speedScore: fromStatic.speedScore,
      qualityScore: fromStatic.qualityScore
    };
  }

  const base = id.includes('tiny')
    ? { speedScore: 5, qualityScore: 2 }
    : id.includes('base')
      ? { speedScore: 4, qualityScore: 3 }
      : id.includes('small')
        ? { speedScore: 3, qualityScore: 4 }
        : id.includes('medium')
          ? { speedScore: 2, qualityScore: 5 }
          : { speedScore: 1, qualityScore: 5 };

  return {
    ...base,
    summary: buildGenericSummary(id)
  };
}

function buildGenericSummary(id: string) {
  if (id.includes('turbo')) {
    return 'Variante orientée vitesse pour réduire le temps de transcription.';
  }
  if (id.includes('q5') || id.includes('q8')) {
    return 'Variante compressée pour réduire le poids disque et la mémoire utilisée.';
  }
  if (id.includes('tdrz')) {
    return 'Variante dédiée au marquage des changements de locuteur.';
  }
  if (id.includes('medium') || id.includes('large')) {
    return 'Variante plus précise pour des audios difficiles ou détaillés.';
  }
  return 'Variante standard adaptée à un usage général.';
}

function getModelDownloadUrl(modelId: string) {
  return FALLBACK_DOWNLOADS[modelId]?.url
    ?? `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${modelId}.bin`;
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
