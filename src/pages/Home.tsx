import { DropZone } from '../components/DropZone';
import { OptionsPanel } from '../components/OptionsPanel';
import { ProgressPanel } from '../components/ProgressPanel';
import { useTranscriptionStore } from '../store/transcription';

export function Home() {
  const { file, setFile, start, error, isTranscribing } = useTranscriptionStore();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.25fr 0.9fr',
        gap: 'var(--space-6)',
        padding: 'var(--space-8)',
        minHeight: 0
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--lh-tight)' }}>
            Transcription locale, simple et privée.
          </div>
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)', maxWidth: 640 }}>
            Déposez un fichier audio ou vidéo. WeSpR prépare, transcrit et exporte le texte sans rien envoyer ailleurs.
          </div>
        </div>
        <DropZone file={file} onFileInfo={setFile} />
        {error ? (
          <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--danger)', background: 'var(--danger-bg)' }}>
            {error.message}
          </div>
        ) : null}
        <ProgressPanel />
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
        <OptionsPanel />
        <button className="btn btn-primary btn-lg" onClick={() => void start()} disabled={!file || isTranscribing}>
          {isTranscribing ? 'Transcription en cours…' : 'Transcrire'}
        </button>
      </div>
    </div>
  );
}

