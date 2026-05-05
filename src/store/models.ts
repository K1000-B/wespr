import { create } from 'zustand';
import type { DownloadProgress, Model } from '../../electron/preload';
import { wespr } from '../lib/wespr';

type ModelsState = {
  models: Model[];
  progress: Record<string, DownloadProgress>;
  refresh: () => Promise<void>;
  download: (id: string) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  bindProgress: () => () => void;
};

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  progress: {},
  refresh: async () => {
    const models = await wespr.listModels();
    set({ models });
  },
  download: async (id: string) => {
    await wespr.downloadModel(id);
    await get().refresh();
  },
  deleteModel: async (id: string) => {
    await wespr.deleteModel(id);
    await get().refresh();
  },
  pause: async (id: string) => {
    await wespr.pauseDownload(id);
  },
  cancel: async (id: string) => {
    await wespr.cancelDownload(id);
    set((state) => {
      const next = { ...state.progress };
      delete next[id];
      return { progress: next };
    });
  },
  bindProgress: () => {
    const offProgress = wespr.onDownloadProgress((payload) => {
      set((state) => ({
        progress: {
          ...state.progress,
          [payload.modelId]: payload
        }
      }));
    });
    return () => {
      offProgress();
    };
  }
}));
