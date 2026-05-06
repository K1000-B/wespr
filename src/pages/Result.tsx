import { useState } from 'react';
import { ExportPanel } from '../components/ExportPanel';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { useTranscriptionStore } from '../store/transcription';
import { formatDuration } from '../lib/utils';

export function Result() {
  const { result } = useTranscriptionStore();
  const [showExport, setShowExport] = useState(false);

  if (!result) {
    return null;
  }

  return (
    <div style={{ padding: 'var(--space-8)', display: 'grid', gap: 'var(--space-6)', minHeight: 0 }}>
      <div className="card" style={{ padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="pill pill-success">Transcript prêt</span>
        <span className="mono">{formatDuration(result.duration)}</span>
        <span style={{ color: 'var(--text-secondary)' }}>Langue détectée: {result.language}</span>
        <span style={{ color: 'var(--text-secondary)' }}>Modèle: {result.modelUsed}</span>
        {result.sourceLabel ? <span style={{ color: 'var(--text-secondary)' }}>Source: {result.sourceLabel}</span> : null}
      </div>
      <TranscriptViewer onExport={() => setShowExport(true)} />
      {showExport ? <ExportPanel onClose={() => setShowExport(false)} /> : null}
    </div>
  );
}
