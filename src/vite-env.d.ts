/// <reference types="vite/client" />

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
      downloadModel: (id: string) => Promise<DownloadResult>;
      onDownloadProgress: (cb: (p: DownloadProgress) => void) => () => void;
      pauseDownload: (id: string) => Promise<void>;
      cancelDownload: (id: string) => Promise<void>;
      deleteModel: (id: string) => Promise<void>;
      getPausedDownloads: () => Promise<string[]>;
      openFile: () => Promise<string | null>;
      saveTranscript: (result: TranscriptResult, opts: SaveOptions) => Promise<string[]>;
      getFileInfo: (path: string) => Promise<FileInfo>;
      openLogs: () => Promise<void>;
      openPath: (targetPath: string) => Promise<string>;
      pickDirectory: () => Promise<string | null>;
      clearCache: () => Promise<{ freed: number }>;
      getVersion: () => Promise<AppVersion>;
      getPrefs: () => Promise<AppPrefs>;
      setPrefs: (prefs: Partial<AppPrefs>) => Promise<AppPrefs>;
      getStorageInfo: () => Promise<StorageInfo>;
      getMediaSourceUrl: (filePath: string) => Promise<string>;
    };
  }
}

export {};
