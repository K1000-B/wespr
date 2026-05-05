import { useEffect, useMemo, useState } from 'react';
import { ModelCard } from '../components/ModelCard';
import { ModelRow } from '../components/ModelRow';
import { formatBytes } from '../lib/utils';
import { wespr } from '../lib/wespr';
import { useModelsStore } from '../store/models';

type AppVersion = Awaited<ReturnType<typeof wespr.getVersion>>;
type AppPrefs = Awaited<ReturnType<typeof wespr.getPrefs>>;
type StorageInfo = Awaited<ReturnType<typeof wespr.getStorageInfo>>;

const defaultPrefs: AppPrefs = {
  defaultModelId: '',
  timestampGranularity: 'segment',
  exportDirectory: ''
};

const defaultStorage: StorageInfo = {
  modelsDir: '',
  logsPath: '',
  tempDir: '',
  exportDirectory: '',
  managedModelsBytes: 0,
  logBytes: 0,
  tempCacheBytes: 0
};

const sections = [
  ['models', 'Modèles'],
  ['storage', 'Stockage'],
  ['app', 'Application']
] as const;

export function Settings() {
  const { models, refresh } = useModelsStore();
  const [section, setSection] = useState<(typeof sections)[number][0]>('models');
  const [version, setVersion] = useState<AppVersion | null>(null);
  const [prefs, setPrefs] = useState<AppPrefs>(defaultPrefs);
  const [storage, setStorage] = useState<StorageInfo>(defaultStorage);
  const [feedback, setFeedback] = useState<string>('');

  useEffect(() => {
    void refresh();
    void wespr.getVersion().then(setVersion);
    void wespr.getPrefs().then((value) => setPrefs({ ...defaultPrefs, ...value }));
    void wespr.getStorageInfo().then((value) => setStorage({ ...defaultStorage, ...value }));
  }, [refresh]);

  const installedModels = useMemo(() => models.filter((model) => model.installed), [models]);
  const installedBytes = installedModels.reduce((sum, model) => sum + model.size, 0);
  const totalBytes = models.reduce((sum, model) => sum + model.size, 0);
  const ratio = totalBytes > 0 ? (installedBytes / totalBytes) * 100 : 0;
  const externalModels = installedModels.filter((model) => !model.managed);

  const refreshStorage = async () => {
    const value = await wespr.getStorageInfo();
    setStorage({ ...defaultStorage, ...value });
  };

  const updatePrefs = async (patch: Partial<AppPrefs>) => {
    const next = await wespr.setPrefs(patch);
    setPrefs({ ...defaultPrefs, ...next });
    setFeedback('Préférences enregistrées.');
    window.setTimeout(() => setFeedback(''), 1800);
    await refreshStorage();
  };

  const pickExportDirectory = async () => {
    const directory = await wespr.pickDirectory();
    if (!directory) {
      return;
    }
    await updatePrefs({ exportDirectory: directory });
  };

  const clearCache = async () => {
    const result = await wespr.clearCache();
    await refreshStorage();
    setFeedback(`Cache vidé: ${formatBytes(result.freed)} libérés.`);
    window.setTimeout(() => setFeedback(''), 2200);
  };

  const openInFinder = async (targetPath: string) => {
    const error = await wespr.openPath(targetPath);
    if (error) {
      setFeedback(`Impossible d’ouvrir ce dossier: ${error}`);
    }
  };

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

        {feedback ? (
          <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>
            {feedback}
          </div>
        ) : null}

        {section === 'models' ? (
          <>
            <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 'var(--fw-semibold)' }}>Stockage des modèles</div>
                <span className="mono">{formatBytes(installedBytes)}</span>
              </div>
              <div style={{ height: 10, borderRadius: 'var(--r-pill)', background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ width: `${ratio}%`, height: '100%', background: 'var(--violet-400)' }} />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                {installedModels.length} modèles disponibles
                {externalModels.length > 0 ? ` · ${externalModels.length} détectés dans un dossier externe` : ''}
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
          </>
        ) : null}

        {section === 'storage' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Modèles WeSpR</div>
                <div className="mono" style={{ fontSize: 'var(--fs-xl)' }}>{formatBytes(storage.managedModelsBytes)}</div>
              </div>
              <div className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Cache temporaire</div>
                <div className="mono" style={{ fontSize: 'var(--fs-xl)' }}>{formatBytes(storage.tempCacheBytes)}</div>
              </div>
              <div className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ color: 'var(--text-secondary)' }}>Logs</div>
                <div className="mono" style={{ fontSize: 'var(--fs-xl)' }}>{formatBytes(storage.logBytes)}</div>
              </div>
            </div>

            <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
              {[
                ['Dossier des modèles', storage.modelsDir],
                ['Journal WeSpR', storage.logsPath],
                ['Cache temporaire', storage.tempDir],
                ['Dossier d’export', storage.exportDirectory]
              ].map(([label, targetPath]) => (
                <div key={label} style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>{label}</div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="mono" style={{ flex: 1, minWidth: 320 }}>{targetPath}</div>
                    <button className="btn btn-ghost btn-sm" onClick={() => void openInFinder(targetPath)}>
                      Ouvrir
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => void wespr.openLogs()}>
                Ouvrir les logs
              </button>
              <button className="btn btn-ghost" onClick={() => void clearCache()}>
                Vider le cache
              </button>
            </div>
          </>
        ) : null}

        {section === 'app' ? (
          <>
            <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
              <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Modèle par défaut</span>
                <select
                  className="input"
                  value={prefs.defaultModelId}
                  onChange={(event) => {
                    void updatePrefs({ defaultModelId: event.target.value });
                  }}
                >
                  <option value="">Sélection automatique</option>
                  {installedModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Granularité des horodatages</span>
                <select
                  className="input"
                  value={prefs.timestampGranularity}
                  onChange={(event) => {
                    void updatePrefs({
                      timestampGranularity: event.target.value as AppPrefs['timestampGranularity']
                    });
                  }}
                >
                  <option value="segment">Segment</option>
                  <option value="10s">Toutes les 10 s</option>
                  <option value="30s">Toutes les 30 s</option>
                  <option value="1min">Toutes les 1 min</option>
                </select>
              </label>

              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Dossier d’export</span>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <input className="input mono" value={prefs.exportDirectory} readOnly style={{ flex: 1, minWidth: 320 }} />
                  <button className="btn btn-secondary" onClick={() => void pickExportDirectory()}>
                    Choisir
                  </button>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-3)' }}>
              <div style={{ fontWeight: 'var(--fw-semibold)' }}>Versions</div>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Application</span>
                  <span className="mono">{version?.app ?? 'indisponible'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>whisper.cpp</span>
                  <span className="mono">{version?.whisperCpp ?? 'indisponible'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>ffmpeg</span>
                  <span className="mono">{version?.ffmpeg ?? 'indisponible'}</span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
