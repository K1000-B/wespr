import { contextBridge, ipcRenderer } from 'electron';

export type SourceKind = 'file' | 'url' | 'voice';
export type VoiceMode = 'memo' | 'live';
export type UrlSourceKind = 'youtube' | 'm3u8';

export interface FileTranscribeSource {
  kind: 'file';
  filePath: string;
}

export interface UrlTranscribeSource {
  kind: 'url';
  url: string;
  sourceType: UrlSourceKind;
  referer?: string;
  keepMedia?: boolean;
  destinationDirectory?: string;
}

export interface VoiceTranscribeSource {
  kind: 'voice';
  sessionId: string;
  filePath: string;
}

export type TranscribeSource = FileTranscribeSource | UrlTranscribeSource | VoiceTranscribeSource;

export interface TranscribeOptions {
  source: TranscribeSource;
  modelId: string;
  language: string | 'auto';
  translateToEn: boolean;
  diarize: boolean;
}

export interface ProgressEvent {
  step: 'downloading' | 'converting' | 'segmenting' | 'transcribing' | 'merging' | 'cleanup';
  pct: number;
  chunk?: number;
  totalChunks?: number;
  message?: string;
  eta?: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  confidence?: number;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
  modelUsed: string;
  processingTime: number;
  sourceFilePath: string;
  sourceKind: SourceKind;
  sourceLabel?: string;
  mediaFilePath?: string;
}

export interface TranscribeError {
  step: string;
  message: string;
  code?: number;
  stderr?: string;
}

export interface Model {
  id: string;
  size: number;
  lang: 'multi' | 'en';
  tags: string[];
  installed: boolean;
  default?: boolean;
  path?: string;
  managed: boolean;
  source: 'wespr' | 'external';
  downloadable: boolean;
  note?: string;
  summary: string;
  speedScore: number;
  qualityScore: number;
}

export interface DownloadProgress {
  modelId: string;
  bytesReceived: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

export type DownloadResult = 'completed' | 'paused' | 'cancelled';

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  duration: number;
  format: string;
  sampleRate?: number;
}

export interface SaveOptions {
  defaultName: string;
  formats: Array<'txt' | 'txt-timestamps' | 'srt' | 'vtt' | 'md' | 'json' | 'docx'>;
  includeTimestamps: boolean;
  includeSpeakers: boolean;
  timestampGranularity: 'segment' | '10s' | '30s' | '1min';
  destination?: string;
}

export interface AppVersion {
  app: string;
  whisperCpp: string;
  ffmpeg: string;
}

export interface AppPrefs {
  defaultModelId: string;
  timestampGranularity: 'segment' | '10s' | '30s' | '1min';
  exportDirectory: string;
  keepRemoteMedia: boolean;
  remoteMediaDirectory: string;
  keepVoiceAudio: boolean;
  defaultMicrophoneId: string;
  defaultVoiceMode: VoiceMode;
}

export interface StorageInfo {
  modelsDir: string;
  logsPath: string;
  tempDir: string;
  exportDirectory: string;
  remoteMediaDir: string;
  voiceSessionsDir: string;
  managedModelsBytes: number;
  logBytes: number;
  tempCacheBytes: number;
  remoteMediaBytes: number;
  voiceAudioBytes: number;
}

export interface UrlSourceInput {
  url: string;
  sourceType: UrlSourceKind;
  referer?: string;
}

export interface UrlPreview {
  sourceType: UrlSourceKind;
  url: string;
  title: string;
  creator?: string;
  duration?: number;
  thumbnailUrl?: string;
  description?: string;
}

export interface VoiceSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  duration: number;
  wordCount: number;
  mode: VoiceMode;
  transcriptPath: string;
  audioPath?: string;
  previewText: string;
}

export interface VoiceSessionDetail {
  session: VoiceSessionSummary;
  transcript: TranscriptResult;
}

export interface VoiceSessionStartInput {
  mode: VoiceMode;
  keepAudio: boolean;
}

export interface VoiceChunkInput {
  sessionId: string;
  pcm16: number[];
}

export interface VoiceLiveState {
  committedText: string;
  partialText: string;
  updatedAt: string;
}

const on = <T,>(channel: string, cb: (payload: T) => void) => {
  const listener = (_event: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api = {
  transcribe: (opts: TranscribeOptions) => ipcRenderer.invoke('wespr:transcribe', opts),
  onProgress: (cb: (p: ProgressEvent) => void) => on('wespr:progress', cb),
  onResult: (cb: (r: TranscriptResult) => void) => on('wespr:result', cb),
  onError: (cb: (e: TranscribeError) => void) => on('wespr:error', cb),
  cancelTranscribe: () => ipcRenderer.invoke('wespr:cancel-transcribe'),

  listModels: () => ipcRenderer.invoke('wespr:list-models') as Promise<Model[]>,
  downloadModel: (id: string) => ipcRenderer.invoke('wespr:download-model', id) as Promise<DownloadResult>,
  onDownloadProgress: (cb: (p: DownloadProgress) => void) => on('wespr:download-progress', cb),
  pauseDownload: (id: string) => ipcRenderer.invoke('wespr:pause-download', id),
  cancelDownload: (id: string) => ipcRenderer.invoke('wespr:cancel-download', id),
  deleteModel: (id: string) => ipcRenderer.invoke('wespr:delete-model', id),
  getPausedDownloads: () => ipcRenderer.invoke('wespr:get-paused-downloads') as Promise<string[]>,

  openFile: () => ipcRenderer.invoke('wespr:open-file') as Promise<string | null>,
  saveTranscript: (result: TranscriptResult, opts: SaveOptions) =>
    ipcRenderer.invoke('wespr:save-transcript', result, opts) as Promise<string[]>,
  getFileInfo: (filePath: string) => ipcRenderer.invoke('wespr:file-info', filePath) as Promise<FileInfo>,
  resolveUrlSource: (input: UrlSourceInput) => ipcRenderer.invoke('wespr:resolve-url-source', input) as Promise<UrlPreview>,

  startVoiceSession: (input: VoiceSessionStartInput) =>
    ipcRenderer.invoke('wespr:start-voice-session', input) as Promise<{ sessionId: string }>,
  appendVoiceChunk: (input: VoiceChunkInput) =>
    ipcRenderer.invoke('wespr:append-voice-chunk', input) as Promise<VoiceLiveState | null>,
  finalizeVoiceSession: (sessionId: string, options: Omit<TranscribeOptions, 'source'>) =>
    ipcRenderer.invoke('wespr:finalize-voice-session', sessionId, options) as Promise<VoiceSessionDetail>,
  discardVoiceSession: (sessionId: string) => ipcRenderer.invoke('wespr:discard-voice-session', sessionId),
  listVoiceSessions: () => ipcRenderer.invoke('wespr:list-voice-sessions') as Promise<VoiceSessionSummary[]>,
  getVoiceSession: (sessionId: string) => ipcRenderer.invoke('wespr:get-voice-session', sessionId) as Promise<VoiceSessionDetail>,
  deleteVoiceSession: (sessionId: string) => ipcRenderer.invoke('wespr:delete-voice-session', sessionId) as Promise<void>,

  openLogs: () => ipcRenderer.invoke('wespr:open-logs'),
  openPath: (targetPath: string) => ipcRenderer.invoke('wespr:open-path', targetPath) as Promise<string>,
  pickDirectory: () => ipcRenderer.invoke('wespr:pick-directory') as Promise<string | null>,
  clearCache: () => ipcRenderer.invoke('wespr:clear-cache') as Promise<{ freed: number }>,
  purgeRemoteMedia: () => ipcRenderer.invoke('wespr:purge-remote-media') as Promise<{ freed: number }>,
  purgeVoiceAudio: () => ipcRenderer.invoke('wespr:purge-voice-audio') as Promise<{ freed: number }>,
  getVersion: () => ipcRenderer.invoke('wespr:get-version') as Promise<AppVersion>,
  getPrefs: () => ipcRenderer.invoke('wespr:get-prefs') as Promise<AppPrefs>,
  setPrefs: (prefs: Partial<AppPrefs>) => ipcRenderer.invoke('wespr:set-prefs', prefs) as Promise<AppPrefs>,
  getStorageInfo: () => ipcRenderer.invoke('wespr:get-storage-info') as Promise<StorageInfo>,
  getMediaSourceUrl: (filePath: string) => ipcRenderer.invoke('wespr:get-media-source-url', filePath) as Promise<string>
};

contextBridge.exposeInMainWorld('wespr', api);
