import { useMemo, useState } from 'react';
import { useTranscriptionStore } from '../store/transcription';
import { formatDuration } from '../lib/utils';

type Props = {
  onExport: () => void;
};

export function TranscriptViewer({ onExport }: Props) {
  const { result, search, setSearch, viewMode, setViewMode } = useTranscriptionStore();
  const [copied, setCopied] = useState(false);

  const segments = useMemo(() => {
    if (!result) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return result.segments.filter((segment) =>
      query.length === 0 ? true : segment.text.toLowerCase().includes(query)
    );
  }, [result, search]);

  if (!result) {
    return null;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 12,
              top: 8,
              color: 'var(--text-tertiary)'
            }}
          >
            ⌕
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Rechercher dans le transcript"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="card" style={{ display: 'flex', padding: 4 }}>
          <button
            className={`btn ${viewMode === 'texte' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
            onClick={() => setViewMode('texte')}
          >
            Texte
          </button>
          <button
            className={`btn ${viewMode === 'locuteurs' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
            onClick={() => setViewMode('locuteurs')}
          >
            Locuteurs
          </button>
        </div>
        <button className="btn btn-secondary" onClick={handleCopy}>
          {copied ? 'Copié' : 'Copier'}
        </button>
        <button className="btn btn-primary" onClick={onExport}>
          Exporter
        </button>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-primary"
            style={{
              width: 36,
              minWidth: 36,
              padding: 0,
              borderRadius: '50%'
            }}
            aria-label="Lecture"
          >
            ▶
          </button>
          <div className="mono" style={{ minWidth: 72 }}>
            {formatDuration(result.duration)}
          </div>
          <div style={{ flex: 1, height: 4, borderRadius: 'var(--r-pill)', background: 'var(--bg-3)' }} />
          <span className="pill pill-violet">1×</span>
        </div>
      </div>

      <div
        style={{
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gap: 'var(--space-2)'
        }}
      >
        {segments.map((segment, index) => {
          const highlighted = index === 0;
          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 'var(--space-4)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-lg)',
                background: highlighted ? 'var(--violet-900)' : 'transparent',
                color: highlighted ? 'var(--violet-50)' : 'var(--text-primary)'
              }}
            >
              <button
                className="btn btn-ghost btn-sm mono"
                style={{ justifyContent: 'flex-start', padding: 0 }}
              >
                {formatDuration(segment.start)}
              </button>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {viewMode === 'locuteurs' && segment.speaker ? (
                  <span className="pill pill-neutral" style={{ width: 'fit-content' }}>
                    <span className="dot" style={{ color: 'var(--violet-400)' }} />
                    {segment.speaker.toUpperCase()}
                  </span>
                ) : null}
                <div
                  style={{
                    fontSize: 'var(--fs-md)',
                    lineHeight: 'var(--lh-normal)'
                  }}
                >
                  {segment.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

