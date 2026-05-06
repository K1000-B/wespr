import type {
  AppPrefs,
  AppVersion,
  DownloadProgress,
  DownloadResult,
  FileInfo,
  Model,
  ProgressEvent,
  SaveOptions,
  StorageInfo,
  TranscriptResult,
  TranscribeError,
  TranscribeOptions,
  UrlPreview,
  UrlSourceInput,
  VoiceChunkInput,
  VoiceLiveState,
  VoiceSessionDetail,
  VoiceSessionStartInput,
  VoiceSessionSummary
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
  downloadModel: async (_id: string): Promise<DownloadResult> => {
    throw new Error('Le téléchargement de modèles fonctionne uniquement dans l’app Electron.');
  },
  onDownloadProgress: (_cb: (p: DownloadProgress) => void) => noop,
  pauseDownload: async (_id: string) => {},
  cancelDownload: async (_id: string) => {},
  deleteModel: async (_id: string) => {},
  getPausedDownloads: async () => [],
  openFile: async () => null,
  saveTranscript: async (_result: TranscriptResult, _opts: SaveOptions) => {
    throw new Error('L’export fonctionne uniquement dans l’app Electron.');
  },
  getFileInfo: async (_path: string): Promise<FileInfo> => {
    throw new Error('Lecture de fichier indisponible hors Electron.');
  },
  resolveUrlSource: async (_input: UrlSourceInput): Promise<UrlPreview> => {
    throw new Error('L’import URL fonctionne uniquement dans l’app Electron.');
  },
  startVoiceSession: async (_input: VoiceSessionStartInput) => ({ sessionId: '' }),
  appendVoiceChunk: async (_input: VoiceChunkInput): Promise<VoiceLiveState | null> => null,
  finalizeVoiceSession: async (_sessionId: string, _options: Omit<TranscribeOptions, 'source'>) => {
    throw new Error('La dictée vocale fonctionne uniquement dans l’app Electron.');
  },
  discardVoiceSession: async (_sessionId: string) => {},
  listVoiceSessions: async (): Promise<VoiceSessionSummary[]> => [],
  getVoiceSession: async (_sessionId: string): Promise<VoiceSessionDetail> => {
    throw new Error('Les sessions vocales sont indisponibles hors Electron.');
  },
  deleteVoiceSession: async (_sessionId: string) => {},
  openLogs: async () => {},
  openPath: async (_targetPath: string) => '',
  pickDirectory: async () => null,
  clearCache: async () => ({ freed: 0 }),
  purgeRemoteMedia: async () => ({ freed: 0 }),
  purgeVoiceAudio: async () => ({ freed: 0 }),
  getVersion: async (): Promise<AppVersion> => ({
    app: '1.0.0',
    whisperCpp: 'Mode navigateur',
    ffmpeg: 'Mode navigateur'
  }),
  getPrefs: async (): Promise<AppPrefs> => ({
    defaultModelId: '',
    timestampGranularity: 'segment',
    exportDirectory: '',
    keepRemoteMedia: false,
    remoteMediaDirectory: '',
    keepVoiceAudio: false,
    defaultMicrophoneId: '',
    defaultVoiceMode: 'memo'
  }),
  setPrefs: async (prefs: Partial<AppPrefs>) => ({
    defaultModelId: prefs.defaultModelId ?? '',
    timestampGranularity: prefs.timestampGranularity ?? 'segment',
    exportDirectory: prefs.exportDirectory ?? '',
    keepRemoteMedia: prefs.keepRemoteMedia ?? false,
    remoteMediaDirectory: prefs.remoteMediaDirectory ?? '',
    keepVoiceAudio: prefs.keepVoiceAudio ?? false,
    defaultMicrophoneId: prefs.defaultMicrophoneId ?? '',
    defaultVoiceMode: prefs.defaultVoiceMode ?? 'memo'
  }),
  getStorageInfo: async (): Promise<StorageInfo> => ({
    modelsDir: '',
    logsPath: '',
    tempDir: '',
    exportDirectory: '',
    remoteMediaDir: '',
    voiceSessionsDir: '',
    managedModelsBytes: 0,
    logBytes: 0,
    tempCacheBytes: 0,
    remoteMediaBytes: 0,
    voiceAudioBytes: 0
  }),
  getMediaSourceUrl: async (filePath: string) => filePath
};

export const wespr = window.wespr ?? browserFallback;
export const hasNativeBridge = Boolean(window.wespr);
