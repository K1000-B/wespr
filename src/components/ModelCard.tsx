import type { Model } from '../../electron/preload';
import { formatBytes } from '../lib/utils';
import { useModelsStore } from '../store/models';

type Props = {
  model: Model;
};

export function ModelCard({ model }: Props) {
  const { progress, pausedIds, recentlyInstalledIds, download, deleteModel, pause, cancel } = useModelsStore();
  const current = progress[model.id];
  const isDownloading = Boolean(current);
  const isPaused = pausedIds.includes(model.id);
  const isInstalled = model.installed || recentlyInstalledIds.includes(model.id);
  const recommended = Boolean(model.default);

  return (
    <div
      className="card"
      style={{
        padding: 'var(--space-5)',
        display: 'grid',
        gap: 'var(--space-4)',
        position: 'relative',
        borderColor: recommended ? 'var(--violet-700)' : 'var(--border-subtle)',
        background: recommended
          ? 'linear-gradient(180deg, color-mix(in oklab, var(--violet-900) 60%, var(--bg-1)), var(--bg-1))'
          : 'var(--bg-1)'
      }}
    >
      {recommended ? (
        <span className="pill pill-violet" style={{ position: 'absolute', top: 12, right: 12 }}>
          Recommandé
        </span>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ fontWeight: 'var(--fw-semibold)' }}>{model.id}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            {model.lang === 'en' ? 'Anglais optimisé' : 'Multilingue'} · {formatBytes(model.size)}
          </div>
        </div>
        {isInstalled ? (
          <span className="pill pill-success">Installé</span>
        ) : isDownloading ? (
          <span className="pill pill-info">Téléchargement</span>
        ) : (
          <span className="pill pill-neutral">Disponible</span>
        )}
      </div>

      {isInstalled ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          {model.managed ? 'Installé par WeSpR' : 'Détecté dans un dossier existant'}
        </div>
      ) : model.note ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>{model.note}</div>
      ) : null}

      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>{model.summary}</div>

      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={`speed-${index}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: index < model.speedScore ? 'var(--success)' : 'var(--bg-3)'
            }}
          />
        ))}
        <span style={{ width: 18 }} />
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={`quality-${index}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: index < model.qualityScore ? 'var(--violet-400)' : 'var(--bg-3)'
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
        <span>Vert = vitesse</span>
        <span>Violet = précision</span>
      </div>

      {isDownloading ? (
        <>
          <div style={{ height: 8, background: 'var(--bg-3)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(current.bytesReceived / current.totalBytes) * 100}%`,
                background: 'var(--info)'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            <span>{formatBytes(current.speed)}/s</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {isPaused ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => download(model.id)}>
                    Reprendre
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => cancel(model.id)}>
                    Annuler
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => pause(model.id)}>
                  Pause
                </button>
              )}
            </div>
          </div>
        </>
      ) : isInstalled ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="pill pill-success">Prêt pour la transcription</span>
          {model.managed ? (
            <button className="btn btn-ghost btn-sm" onClick={() => deleteModel(model.id)}>
              Supprimer
            </button>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>Lecture seule</span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{formatBytes(model.size)}</span>
          {model.downloadable ? (
            <button className="btn btn-secondary btn-sm" onClick={() => download(model.id)}>
              Installer
            </button>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>Ajout manuel</span>
          )}
        </div>
      )}
    </div>
  );
}
