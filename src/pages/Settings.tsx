import { useEffect, useState } from 'react';
import { ModelCard } from '../components/ModelCard';
import { ModelRow } from '../components/ModelRow';
import { formatBytes } from '../lib/utils';
import { wespr } from '../lib/wespr';
import { useModelsStore } from '../store/models';

type AppVersion = Awaited<ReturnType<typeof wespr.getVersion>>;

const sections = [
  ['models', 'Modèles'],
  ['storage', 'Stockage'],
  ['app', 'Application']
] as const;

export function Settings() {
  const { models, refresh, bootstrapLogs } = useModelsStore();
  const [section, setSection] = useState<(typeof sections)[number][0]>('models');
  const [version, setVersion] = useState<AppVersion | null>(null);

  useEffect(() => {
    void refresh();
    void wespr.getVersion().then(setVersion);
  }, [refresh]);

  const installedBytes = models.filter((model) => model.installed).reduce((sum, model) => sum + model.size, 0);
  const totalBytes = models.reduce((sum, model) => sum + model.size, 0);
  const ratio = totalBytes > 0 ? (installedBytes / totalBytes) * 100 : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 0, flex: 1 }}>
      <aside
        style={{
          background: 'var(--bg-1)',
          borderRight: '1px solid var(--border-subtle)',
          padding: 'var(--space-6)',
          display: 'grid',
          alignContent: 'start',
          gap: 'var(--space-2)'
        }}
      >
        {sections.map(([id, label]) => (
          <button
            key={id}
            className={`btn ${section === id ? 'btn-secondary' : 'btn-ghost'}`}
            style={{
              justifyContent: 'flex-start',
              background: section === id ? 'var(--bg-3)' : undefined,
              color: section === id ? 'var(--violet-400)' : 'var(--text-secondary)'
            }}
            onClick={() => setSection(id)}
          >
            <span aria-hidden="true">◦</span>
            {label}
          </button>
        ))}
      </aside>

      <div style={{ padding: 'var(--space-8)', overflow: 'auto', display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-semibold)' }}>Réglages</div>
          <div style={{ color: 'var(--text-secondary)' }}>Choisissez vos modèles, vos exports et vos outils de diagnostic.</div>
        </div>

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 'var(--fw-semibold)' }}>Stockage des modèles</div>
            <span className="mono">{formatBytes(installedBytes)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 'var(--r-pill)', background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ width: `${ratio}%`, height: '100%', background: 'var(--violet-400)' }} />
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            {models.filter((model) => model.installed).length} modèles installés
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {models.map((model) => (
            <ModelCard key={model.id} model={model} />
          ))}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 90px 90px 110px 100px',
              gap: 'var(--space-3)',
              padding: 'var(--space-4)',
              color: 'var(--text-secondary)'
            }}
          >
            <span>Modèle</span>
            <span>Taille</span>
            <span>Langue</span>
            <span>Précision</span>
            <span style={{ textAlign: 'right' }}>Action</span>
          </div>
          {models.map((model) => (
            <ModelRow key={`row-${model.id}`} model={model} />
          ))}
        </div>

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ fontWeight: 'var(--fw-semibold)' }}>Journal du premier lancement</div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 'var(--space-4)',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-md)',
              maxHeight: 180,
              overflow: 'auto'
            }}
          >
            {bootstrapLogs.length > 0 ? bootstrapLogs.join('\n') : 'Aucun téléchargement initial en cours.'}
          </pre>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => void wespr.openLogs()}>
              Ouvrir les logs
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                void wespr.clearCache();
              }}
            >
              Vider le cache
            </button>
          </div>
          {version ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
              {version.whisperCpp} · {version.ffmpeg}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
