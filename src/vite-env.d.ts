/// <reference types="vite/client" />

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
} from '../electron/preload';

declare global {
  interface Window {
    wespr: {
      transcribe: (opts: TranscribeOptions) => Promise<void>;
      onProgress: (cb: (p: ProgressEvent) => void) => () => void;
      onResult: (cb: (r: TranscriptResult) => void) => () => void;
      onError: (cb: (e: TranscribeError) => void) => () => void;
      cancelTranscribe: () => Promise<void>;
      listModels: () => Promise<Model[]>;
      downloadModel: (id: string) => Promise<void>;
      onDownloadProgress: (cb: (p: DownloadProgress) => void) => () => void;
      pauseDownload: (id: string) => Promise<void>;
      cancelDownload: (id: string) => Promise<void>;
      deleteModel: (id: string) => Promise<void>;
      openFile: () => Promise<string | null>;
      saveTranscript: (result: TranscriptResult, opts: SaveOptions) => Promise<string[]>;
      getFileInfo: (path: string) => Promise<FileInfo>;
      openLogs: () => Promise<void>;
      clearCache: () => Promise<{ freed: number }>;
      getVersion: () => Promise<AppVersion>;
      getPrefs: () => Promise<Record<string, unknown>>;
      setPrefs: (prefs: Record<string, unknown>) => Promise<void>;
    };
  }
}

export {};

