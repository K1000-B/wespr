import type { Model } from '../../electron/preload';

export function selectBestModel(
  lang: string,
  diarize: boolean,
  installed: Model[]
) {
  let candidates = installed.filter((model) => model.installed);
  if (lang === 'en') {
    const enModels = candidates.filter((model) => model.id.includes('.en'));
    if (enModels.length) {
      candidates = enModels;
    }
  }
  if (diarize) {
    const tdrz = candidates.filter((model) => model.id.includes('-tdrz'));
    if (tdrz.length) {
      candidates = tdrz;
    }
  }
  return candidates.find((model) => model.id.includes('small')) ?? candidates[0];
}

