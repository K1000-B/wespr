import { create } from 'zustand';
import type { DownloadProgress, Model } from '../../electron/preload';
import { wespr } from '../lib/wespr';

type ModelsState = {
  models: Model[];
  progress: Record<string, DownloadProgress>;
  pausedIds: string[];
  recentlyInstalledIds: string[];
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
  recentlyInstalledIds: [],
  refresh: async () => {
    const [models, pausedIds] = await Promise.all([wespr.listModels(), wespr.getPausedDownloads()]);
    set((state) => ({
      models,
      pausedIds,
      recentlyInstalledIds: state.recentlyInstalledIds.filter((id) =>
        models.some((model) => model.id === id && model.installed)
      )
    }));
  },
  download: async (id: string) => {
    const result = await wespr.downloadModel(id);
    if (result === 'completed') {
      set((state) => ({
        progress: Object.fromEntries(
          Object.entries(state.progress).filter(([key]) => key !== id)
        ),
        pausedIds: state.pausedIds.filter((entry) => entry !== id),
        recentlyInstalledIds: state.recentlyInstalledIds.includes(id)
          ? state.recentlyInstalledIds
          : [...state.recentlyInstalledIds, id]
      }));
      await get().refresh();
      return;
    }
    if (result === 'cancelled') {
      set((state) => ({
        progress: Object.fromEntries(
          Object.entries(state.progress).filter(([key]) => key !== id)
        ),
        pausedIds: state.pausedIds.filter((entry) => entry !== id),
        recentlyInstalledIds: state.recentlyInstalledIds.filter((entry) => entry !== id)
      }));
      return;
    }
    if (result === 'paused') {
      set((state) => ({
        pausedIds: state.pausedIds.includes(id) ? state.pausedIds : [...state.pausedIds, id]
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
        pausedIds: state.pausedIds.filter((entry) => entry !== id),
        recentlyInstalledIds: state.recentlyInstalledIds.filter((entry) => entry !== id)
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
