export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 o';
  }
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function languageLabel(code: string) {
  const map: Record<string, string> = {
    auto: 'Détection automatique',
    fr: 'Français',
    en: 'Anglais',
    es: 'Espagnol',
    de: 'Allemand',
    it: 'Italien',
    pt: 'Portugais',
    nl: 'Néerlandais',
    ja: 'Japonais'
  };
  return map[code] ?? code.toUpperCase();
}
