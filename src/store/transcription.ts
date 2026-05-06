import { create } from 'zustand';
import type {
  AppPrefs,
  FileInfo,
  ProgressEvent,
  TranscriptResult,
  TranscribeError,
  UrlPreview
} from '../../electron/preload';
import type { Model, TranscribeOptions, UrlSourceKind } from '../../electron/preload';
import { selectBestModel } from '../lib/modelSelection';
import { wespr } from '../lib/wespr';

export type AppPage = 'home' | 'result' | 'settings';
export type SourceView = 'file' | 'url' | 'voice';

type TranscriptionState = {
  page: AppPage;
  sourceView: SourceView;
  file: FileInfo | null;
  result: TranscriptResult | null;
  progress: ProgressEvent | null;
  error: TranscribeError | null;
  isTranscribing: boolean;
  search: string;
  viewMode: 'texte' | 'locuteurs';
  options: {
    language: string | 'auto';
    translateToEn: boolean;
    modelId: string;
    diarize: boolean;
  };
  url: {
    sourceType: UrlSourceKind;
    value: string;
    referer: string;
    preview: UrlPreview | null;
    isResolving: boolean;
    keepMedia: boolean;
    destinationDirectory: string;
  };
  setPage: (page: AppPage) => void;
  setSourceView: (view: SourceView) => void;
  setFile: (file: FileInfo | null) => void;
  setSearch: (value: string) => void;
  setViewMode: (value: 'texte' | 'locuteurs') => void;
  setOptions: (patch: Partial<TranscriptionState['options']>) => void;
  setUrlInput: (patch: Partial<TranscriptionState['url']>) => void;
  autoSelectModel: (models: Model[]) => void;
  resolveUrl: () => Promise<void>;
  start: () => Promise<void>;
  startFromUrl: () => Promise<void>;
  bindIpc: () => () => void;
  applyPrefs: (prefs: AppPrefs) => void;
  showResult: (result: TranscriptResult) => void;
  reset: () => void;
};

function buildBaseOptions(state: TranscriptionState['options']): Omit<TranscribeOptions, 'source'> {
  return {
    modelId: state.modelId,
    language: state.language,
    translateToEn: state.translateToEn,
    diarize: state.diarize
  };
}

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  page: 'home',
  sourceView: 'file',
  file: null,
  result: null,
  progress: null,
  error: null,
  isTranscribing: false,
  search: '',
  viewMode: 'texte',
  options: {
    language: 'auto',
    translateToEn: false,
    modelId: '',
    diarize: false
  },
  url: {
    sourceType: 'youtube',
    value: '',
    referer: '',
    preview: null,
    isResolving: false,
    keepMedia: false,
    destinationDirectory: ''
  },
  setPage: (page) => set({ page }),
  setSourceView: (sourceView) => set({ sourceView, error: null }),
  setFile: (file) => set({ file, error: null }),
  setSearch: (search) => set({ search }),
  setViewMode: (viewMode) => set({ viewMode }),
  setOptions: (patch) =>
    set((state) => ({
      options: {
        ...state.options,
        ...patch
      }
    })),
  setUrlInput: (patch) =>
    set((state) => ({
      url: {
        ...state.url,
        ...patch,
        preview: patch.value !== undefined || patch.sourceType !== undefined || patch.referer !== undefined
          ? null
          : state.url.preview
      }
    })),
  autoSelectModel: (models) => {
    const selected = selectBestModel(
      get().options.language,
      get().options.diarize,
      models
    );
    if (selected) {
      set((state) => ({
        options: {
          ...state.options,
          modelId: selected.id
        }
      }));
    }
  },
  resolveUrl: async () => {
    const { url } = get();
    if (!url.value.trim()) {
      set({
        error: {
          step: 'ingestion',
          message: 'Collez un lien valide pour préparer la transcription.'
        }
      });
      return;
    }

    set((state) => ({
      url: {
        ...state.url,
        isResolving: true
      },
      error: null
    }));

    try {
      const preview = await wespr.resolveUrlSource({
        url: url.value.trim(),
        sourceType: url.sourceType,
        referer: url.referer.trim() || undefined
      });
      set((state) => ({
        url: {
          ...state.url,
          preview,
          isResolving: false
        }
      }));
    } catch (error) {
      set((state) => ({
        url: {
          ...state.url,
          isResolving: false
        },
        error: {
          step: 'ingestion',
          message:
            error instanceof Error
              ? `${error.message} — vérifiez le lien et réessayez.`
              : 'Impossible de lire ce lien — vérifiez son format et réessayez.'
        }
      }));
    }
  },
  start: async () => {
    const { file, options } = get();
    if (!file) {
      set({
        error: {
          step: 'ingestion',
          message: 'Aucun fichier sélectionné — ajoutez un fichier pour lancer la transcription.'
        }
      });
      return;
    }

    if (!options.modelId) {
      set({
        error: {
          step: 'modèle',
          message: 'Choisissez un modèle avant de lancer la transcription.'
        }
      });
      return;
    }

    set({ isTranscribing: true, error: null, progress: null, result: null });
    await wespr.transcribe({
      source: {
        kind: 'file',
        filePath: file.path
      },
      ...buildBaseOptions(options)
    });
  },
  startFromUrl: async () => {
    const { options, url } = get();
    if (!options.modelId) {
      set({
        error: {
          step: 'modèle',
          message: 'Choisissez un modèle avant de lancer la transcription.'
        }
      });
      return;
    }

    if (!url.value.trim()) {
      set({
        error: {
          step: 'ingestion',
          message: 'Collez un lien valide pour lancer la transcription.'
        }
      });
      return;
    }

    set({ isTranscribing: true, error: null, progress: null, result: null });
    await wespr.transcribe({
      source: {
        kind: 'url',
        url: url.value.trim(),
        sourceType: url.sourceType,
        referer: url.referer.trim() || undefined,
        keepMedia: url.keepMedia,
        destinationDirectory: url.destinationDirectory.trim() || undefined
      },
      ...buildBaseOptions(options)
    });
  },
  bindIpc: () => {
    const offProgress = wespr.onProgress((progress) => {
      set({ progress, isTranscribing: progress.pct < 100 });
    });
    const offResult = wespr.onResult((result) => {
      set({
        result,
        page: 'result',
        isTranscribing: false,
        progress: {
          step: 'cleanup',
          pct: 100,
          message: 'Transcript prêt'
        }
      });
    });
    const offError = wespr.onError((error) => {
      set({ error, isTranscribing: false });
    });
    return () => {
      offProgress();
      offResult();
      offError();
    };
  },
  applyPrefs: (prefs) => {
    set((state) => ({
      options: {
        ...state.options,
        modelId: state.options.modelId || prefs.defaultModelId || ''
      },
      url: {
        ...state.url,
        keepMedia: prefs.keepRemoteMedia,
        destinationDirectory: prefs.remoteMediaDirectory
      }
    }));
  },
  showResult: (result) =>
    set({
      result,
      page: 'result',
      isTranscribing: false,
      progress: {
        step: 'cleanup',
        pct: 100,
        message: 'Transcript prêt'
      }
    }),
  reset: () =>
    set((state) => ({
      file: null,
      result: null,
      progress: null,
      error: null,
      isTranscribing: false,
      page: 'home',
      sourceView: state.sourceView
    }))
}));
