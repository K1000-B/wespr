import type {
  AppVersion,
  DownloadProgress,
  FileInfo,
  Model,
  ProgressEvent,
  SaveOptions,
  TranscriptResult,
  TranscribeError,
  TranscribeOptions
} from '../../electron/preload';

type WesprApi = Window['wespr'];

const noop = () => {};

const browserFallback: WesprApi = {
  transcribe: async (_opts: TranscribeOptions) => {
    throw new Error('WeSpR n’est pas disponible dans un navigateur classique — lancez l’app Electron pour transcrire.');
  },
  onProgress: (_cb: (p: ProgressEvent) => void) => noop,
  onResult: (_cb: (r: TranscriptResult) => void) => noop,
  onError: (_cb: (e: TranscribeError) => void) => noop,
  cancelTranscribe: async () => {},
  listModels: async (): Promise<Model[]> => [],
  downloadModel: async (_id: string) => {
    throw new Error('Le téléchargement de modèles fonctionne uniquement dans l’app Electron.');
  },
  onDownloadProgress: (_cb: (p: DownloadProgress) => void) => noop,
  pauseDownload: async (_id: string) => {},
  cancelDownload: async (_id: string) => {},
  deleteModel: async (_id: string) => {},
  openFile: async () => null,
  saveTranscript: async (_result: TranscriptResult, _opts: SaveOptions) => {
    throw new Error('L’export fonctionne uniquement dans l’app Electron.');
  },
  getFileInfo: async (_path: string): Promise<FileInfo> => {
    throw new Error('Lecture de fichier indisponible hors Electron.');
  },
  openLogs: async () => {},
  clearCache: async () => ({ freed: 0 }),
  getVersion: async (): Promise<AppVersion> => ({
    app: '1.0.0',
    whisperCpp: 'Mode navigateur',
    ffmpeg: 'Mode navigateur'
  }),
  getPrefs: async () => ({}),
  setPrefs: async (_prefs: Record<string, unknown>) => {}
};

export const wespr = window.wespr ?? browserFallback;
export const hasNativeBridge = Boolean(window.wespr);

