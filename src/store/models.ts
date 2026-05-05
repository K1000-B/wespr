import { create } from 'zustand';
import type { DownloadProgress, Model } from '../../electron/preload';
import { wespr } from '../lib/wespr';

type ModelsState = {
  models: Model[];
  progress: Record<string, DownloadProgress>;
  pausedIds: string[];
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
  pausedIds: [],
  refresh: async () => {
    const [models, pausedIds] = await Promise.all([wespr.listModels(), wespr.getPausedDownloads()]);
    set({ models, pausedIds });
  },
  download: async (id: string) => {
    const result = await wespr.downloadModel(id);
    if (result === 'completed') {
      set((state) => ({
        pausedIds: state.pausedIds.filter((entry) => entry !== id)
      }));
      await get().refresh();
      return;
    }
    if (result === 'cancelled') {
      set((state) => ({
        pausedIds: state.pausedIds.filter((entry) => entry !== id)
      }));
    }
  },
  deleteModel: async (id: string) => {
    await wespr.deleteModel(id);
    await get().refresh();
  },
  pause: async (id: string) => {
    await wespr.pauseDownload(id);
    set((state) => ({
      pausedIds: state.pausedIds.includes(id) ? state.pausedIds : [...state.pausedIds, id]
    }));
  },
  cancel: async (id: string) => {
    await wespr.cancelDownload(id);
    set((state) => {
      const next = { ...state.progress };
      delete next[id];
      return {
        progress: next,
        pausedIds: state.pausedIds.filter((entry) => entry !== id)
      };
    });
  },
  bindProgress: () => {
    const offProgress = wespr.onDownloadProgress((payload) => {
      set((state) => ({
        progress: {
          ...state.progress,
          [payload.modelId]: payload
        },
        pausedIds: state.pausedIds.filter((entry) => entry !== payload.modelId)
      }));
    });
    return () => {
      offProgress();
    };
  }
}));
