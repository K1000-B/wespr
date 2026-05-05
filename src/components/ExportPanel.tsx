import { useEffect, useMemo, useState } from 'react';
import { useTranscriptionStore } from '../store/transcription';
import { useModelsStore } from '../store/models';
import { formatBytes } from '../lib/utils';
import { wespr } from '../lib/wespr';

const FORMATS = [
  ['txt', 'TXT'],
  ['txt-timestamps', 'TXT+timestamps'],
  ['srt', 'SRT'],
  ['vtt', 'VTT'],
  ['md', 'MD'],
  ['json', 'JSON'],
  ['docx', 'DOCX']
] as const;

type Props = {
  onClose: () => void;
};

export function ExportPanel({ onClose }: Props) {
  const { result } = useTranscriptionStore();
  const { models } = useModelsStore();
  const [selected, setSelected] = useState<Array<(typeof FORMATS)[number][0]>>(['txt', 'srt']);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeSpeakers, setIncludeSpeakers] = useState(true);
  const [exportDirectory, setExportDirectory] = useState('');
  const [timestampGranularity, setTimestampGranularity] = useState<'segment' | '10s' | '30s' | '1min'>('segment');

  const estimatedBytes = useMemo(() => {
    if (!result) {
      return 0;
    }
    return selected.length * Math.max(result.text.length, 1024);
  }, [result, selected]);

  useEffect(() => {
    void wespr.getPrefs().then((prefs) => {
      setExportDirectory(prefs.exportDirectory);
      setTimestampGranularity(prefs.timestampGranularity);
    });
  }, []);

  if (!result) {
    return null;
  }

  const handleExport = async () => {
    await wespr.saveTranscript(result, {
      defaultName: 'transcript',
      formats: selected,
      includeTimestamps,
      includeSpeakers,
      timestampGranularity,
      destination: exportDirectory || undefined
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-6)'
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-lg)', padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-semibold)' }}>Exporter</div>
            <div style={{ color: 'var(--text-secondary)' }}>Choisissez les formats à générer.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            Fermer
          </button>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {FORMATS.map(([id, label]) => {
            const checked = selected.includes(id);
            return (
              <label
                key={id}
                className="card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 36px 1fr auto',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)'
                }}
              >
                <input
                  className="check"
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, id]
                        : current.filter((entry) => entry !== id)
                    );
                  }}
                />
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    width: 30,
                    textAlign: 'center',
                    padding: '4px 0',
                    borderRadius: 'var(--r-pill)',
                    background: checked ? 'var(--violet-900)' : 'var(--bg-3)',
                    color: checked ? 'var(--violet-200)' : 'var(--text-secondary)'
                  }}
                >
                  {label}
                </span>
                <span>{label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{checked ? 'Oui' : 'Non'}</span>
              </label>
            );
          })}
        </div>

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Inclure les horodatages</span>
          <input
            className="toggle"
            type="checkbox"
            checked={includeTimestamps}
            onChange={(event) => setIncludeTimestamps(event.target.checked)}
          />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Inclure les locuteurs</span>
          <input
            className="toggle"
            type="checkbox"
            checked={includeSpeakers}
            onChange={(event) => setIncludeSpeakers(event.target.checked)}
          />
        </label>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Granularité des horodatages</span>
          <select
            className="input"
            value={timestampGranularity}
            onChange={(event) => setTimestampGranularity(event.target.value as typeof timestampGranularity)}
          >
            <option value="segment">Segment</option>
            <option value="10s">Toutes les 10 s</option>
            <option value="30s">Toutes les 30 s</option>
            <option value="1min">Toutes les 1 min</option>
          </select>
        </div>

        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          Dossier d’export: <span className="mono">{exportDirectory || 'Downloads'}</span>
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleExport} disabled={selected.length === 0}>
          Exporter {selected.length} fichiers · {formatBytes(estimatedBytes)}
        </button>
      </div>
    </div>
  );
}
