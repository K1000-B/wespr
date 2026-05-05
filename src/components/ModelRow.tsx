import type { Model } from '../../electron/preload';
import { formatBytes } from '../lib/utils';
import { useModelsStore } from '../store/models';

type Props = {
  model: Model;
};

export function ModelRow({ model }: Props) {
  const { progress, download, deleteModel } = useModelsStore();
  const current = progress[model.id];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 90px 110px 100px',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid var(--border-subtle)'
      }}
    >
      <div>
        <div style={{ fontWeight: 'var(--fw-medium)' }}>{model.id}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          {model.tags.join(', ') || 'standard'}
        </div>
      </div>
      <div>{formatBytes(model.size)}</div>
      <div>{model.lang}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            style={{
              width: 10,
              height: 4,
              borderRadius: 'var(--r-pill)',
              background: index < (model.id.includes('large') ? 4 : 3) ? 'var(--violet-400)' : 'var(--bg-3)'
            }}
          />
        ))}
      </div>
      <div style={{ justifySelf: 'end' }}>
        {current ? (
          <span className="pill pill-info">En cours</span>
        ) : model.installed ? (
          <button className="btn btn-ghost btn-sm" onClick={() => deleteModel(model.id)}>
            Supprimer
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => download(model.id)}>
            Installer
          </button>
        )}
      </div>
    </div>
  );
}

