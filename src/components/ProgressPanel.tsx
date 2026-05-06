import { useMemo } from 'react';
import { useTranscriptionStore } from '../store/transcription';

const STEPS = [
  ['downloading', 'Téléchargement de l’audio', 'Récupération du média distant si nécessaire'],
  ['converting', 'Préparation du fichier', 'Conversion en 16 kHz mono · audio extrait'],
  ['segmenting', 'Chargement du modèle Whisper', 'Exécuté entièrement sur votre Mac'],
  ['transcribing', 'Transcription en cours…', 'Segment X/N · langue détectée · confiance X%'],
  ['merging', 'Détection des locuteurs', 'Identification de qui parle quand'],
  ['cleanup', 'Ponctuation et formatage', 'Phrases complètes, paragraphes, majuscules'],
  ['done', 'Finalisation', 'Sauvegarde du transcript']
] as const;

export function ProgressPanel() {
  const { progress, isTranscribing } = useTranscriptionStore();

  const activeIndex = useMemo(() => {
    if (!progress) {
      return -1;
    }
    const index = STEPS.findIndex(([step]) => step === progress.step);
    return index;
  }, [progress]);

  if (!progress && !isTranscribing) {
    return null;
  }

  return (
    <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div className="mono" style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-semibold)' }}>
          {Math.round(progress?.pct ?? 0)}%
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>{progress?.message ?? 'Préparation…'}</div>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress?.pct ?? 0)}
        style={{
          height: 8,
          borderRadius: 'var(--r-pill)',
          background: 'var(--bg-3)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${progress?.pct ?? 0}%`,
            height: '100%',
            borderRadius: 'var(--r-pill)',
            background: 'linear-gradient(90deg, var(--violet-600), var(--violet-400))',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.6s linear infinite',
            boxShadow: '0 0 16px var(--violet-glow)'
          }}
        />
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {STEPS.map(([stepKey, title, subtitle], index) => {
          const state =
            index < activeIndex
              ? 'done'
              : index === activeIndex
                ? 'active'
                : 'pending';

          return (
            <div
              key={stepKey}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                gap: 'var(--space-3)',
                opacity: state === 'pending' ? 0.55 : 1
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background:
                    state === 'done'
                      ? 'var(--success)'
                      : state === 'active'
                        ? 'var(--violet-900)'
                        : 'var(--bg-3)',
                  border:
                    state === 'active'
                      ? '1px solid var(--violet-700)'
                      : '1px solid var(--border-default)',
                  color: state === 'done' ? 'white' : 'var(--violet-200)'
                }}
              >
                {state === 'done' ? '✓' : state === 'active' ? (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: '2px solid var(--violet-400)',
                      borderTopColor: 'transparent',
                      animation: 'spin 900ms linear infinite'
                    }}
                  />
                ) : (
                  <span className="dot" />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 'var(--fw-medium)' }}>{title}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                  {stepKey === 'transcribing' && progress?.chunk && progress?.totalChunks
                    ? `Segment ${progress.chunk}/${progress.totalChunks} · langue détectée · confiance en cours`
                    : subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
