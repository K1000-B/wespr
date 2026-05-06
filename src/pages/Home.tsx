import { DropZone } from '../components/DropZone';
import { OptionsPanel } from '../components/OptionsPanel';
import { ProgressPanel } from '../components/ProgressPanel';
import { UrlPanel } from '../components/UrlPanel';
import { VoicePanel } from '../components/VoicePanel';
import { useTranscriptionStore } from '../store/transcription';

function SidebarItem(props: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  const { active, label, onClick } = props;

  return (
    <button
      className={`btn ${active ? 'btn-secondary' : 'btn-ghost'}`}
      style={{
        justifyContent: 'flex-start',
        height: 40,
        color: active ? 'var(--violet-200)' : 'var(--text-secondary)'
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function FilePanel() {
  const { file, setFile, start, error, isTranscribing } = useTranscriptionStore();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.9fr', gap: 'var(--space-6)', minHeight: 0 }}>
      <div style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--lh-tight)' }}>
            Un fichier
          </div>
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)', maxWidth: 680 }}>
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

export function Home() {
  const { sourceView, setSourceView, setPage } = useTranscriptionStore();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', minHeight: 0, flex: 1 }}>
      <aside
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--border-subtle)',
          padding: 'var(--space-4)',
          display: 'grid',
          alignContent: 'start',
          gap: 'var(--space-2)'
        }}
      >
        <div style={{ padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 'var(--fw-semibold)' }}>
            Transcrire
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            Fichier, URL ou dictée, toujours avec une transcription locale.
          </div>
        </div>

        <SidebarItem active={sourceView === 'file'} label="Un fichier" onClick={() => setSourceView('file')} />
        <SidebarItem active={sourceView === 'url'} label="Depuis une URL" onClick={() => setSourceView('url')} />
        <SidebarItem active={sourceView === 'voice'} label="Ma voix" onClick={() => setSourceView('voice')} />

        <div style={{ padding: 'var(--space-3)', marginTop: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 'var(--fw-semibold)' }}>
            App
          </div>
        </div>
        <SidebarItem active={false} label="Réglages" onClick={() => setPage('settings')} />

        <div className="card" style={{ marginTop: 'auto', padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
          <span className="pill pill-success" style={{ width: 'fit-content' }}>Local sur votre Mac</span>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            Internet n’est requis que pour récupérer un média distant.
          </div>
        </div>
      </aside>

      <div style={{ padding: 'var(--space-8)', overflow: 'auto', minHeight: 0 }}>
        {sourceView === 'file' ? <FilePanel /> : null}
        {sourceView === 'url' ? <UrlPanel /> : null}
        {sourceView === 'voice' ? <VoicePanel /> : null}
      </div>
    </div>
  );
}
