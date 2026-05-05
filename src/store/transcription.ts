import { create } from 'zustand';
import type {
  FileInfo,
  ProgressEvent,
  TranscriptResult,
  TranscribeError
} from '../../electron/preload';
import type { Model } from '../../electron/preload';
import { selectBestModel } from '../lib/modelSelection';
import { wespr } from '../lib/wespr';

export type AppPage = 'home' | 'result' | 'settings';

type TranscriptionState = {
  page: AppPage;
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
  setPage: (page: AppPage) => void;
  setFile: (file: FileInfo | null) => void;
  setSearch: (value: string) => void;
  setViewMode: (value: 'texte' | 'locuteurs') => void;
  setOptions: (patch: Partial<TranscriptionState['options']>) => void;
  autoSelectModel: (models: Model[]) => void;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  bindIpc: () => () => void;
  applyPrefs: (prefs: { defaultModelId?: string }) => void;
  reset: () => void;
};

export const useTranscriptionStore = create<TranscriptionState>((set, get) => ({
  page: 'home',
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
  setPage: (page) => set({ page }),
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
          message: 'Aucun modèle installé — ouvrez Réglages pour en télécharger un.'
        }
      });
      return;
    }

    set({ isTranscribing: true, error: null, progress: null, result: null });
    await wespr.transcribe({
      filePath: file.path,
      modelId: options.modelId,
      language: options.language,
      translateToEn: options.translateToEn,
      diarize: options.diarize
    });
  },
  cancel: async () => {
    await wespr.cancelTranscribe();
    set({ isTranscribing: false });
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
    if (!prefs.defaultModelId) {
      return;
    }
    set((state) => ({
      options: {
        ...state.options,
        modelId: state.options.modelId || prefs.defaultModelId || ''
      }
    }));
  },
  reset: () =>
    set({
      file: null,
      result: null,
      progress: null,
      error: null,
      isTranscribing: false
    })
}));
