import { useEffect, useMemo, useState } from 'react';
import type { AppPrefs } from '../../electron/preload';
import { wespr } from '../lib/wespr';
import { formatDuration } from '../lib/utils';
import { useModelsStore } from '../store/models';
import { useTranscriptionStore } from '../store/transcription';
import { OptionsPanel } from './OptionsPanel';
import { ProgressPanel } from './ProgressPanel';

export function UrlPanel() {
  const { models } = useModelsStore();
  const {
    url,
    setUrlInput,
    resolveUrl,
    startFromUrl,
    error,
    isTranscribing,
    progress
  } = useTranscriptionStore();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const isValidUrl = useMemo(() => /^https?:\/\//i.test(url.value.trim()), [url.value]);
  const installedModels = useMemo(() => models.filter((model) => model.installed), [models]);

  useEffect(() => {
    void wespr.getPrefs().then(setPrefs);
  }, []);

  async function pickRemoteMediaDirectory() {
    const directory = await wespr.pickDirectory();
    if (!directory) {
      return;
    }
    setUrlInput({ destinationDirectory: directory });
    const nextPrefs = await wespr.setPrefs({ remoteMediaDirectory: directory });
    setPrefs(nextPrefs);
  }

  async function toggleKeepMedia(value: boolean) {
    setUrlInput({ keepMedia: value });
    const nextPrefs = await wespr.setPrefs({ keepRemoteMedia: value });
    setPrefs(nextPrefs);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(340px, 0.9fr)', gap: 'var(--space-6)', minHeight: 0 }}>
      <div style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--lh-tight)' }}>
            Depuis une URL
          </div>
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)', maxWidth: 720 }}>
            Collez un lien YouTube ou un flux M3U8. WeSpR récupère le meilleur média disponible, le conserve si vous le souhaitez, puis le transcrit localement.
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
          <div style={{ display: 'inline-flex', gap: 'var(--space-1)', padding: 4, background: 'var(--bg-0)', borderRadius: 'var(--r-lg)' }}>
            {[
              ['youtube', 'YouTube'],
              ['m3u8', 'Flux M3U8']
            ].map(([id, label]) => (
              <button
                key={id}
                className={`btn ${url.sourceType === id ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setUrlInput({ sourceType: id as typeof url.sourceType })}
              >
                {label}
              </button>
            ))}
          </div>

          <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {url.sourceType === 'youtube' ? 'Lien YouTube' : 'URL du flux M3U8'}
            </span>
            <input
              className="input"
              style={{ height: 40 }}
              value={url.value}
              placeholder={url.sourceType === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://exemple.com/playlist.m3u8'}
              onChange={(event) => setUrlInput({ value: event.target.value })}
            />
          </label>

          {url.sourceType === 'm3u8' ? (
            <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Referer optionnel</span>
              <input
                className="input"
                value={url.referer}
                placeholder="https://exemple.com/page-video"
                onChange={(event) => setUrlInput({ referer: event.target.value })}
              />
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>
                Le User-Agent est géré automatiquement par l’app.
              </span>
            </label>
          ) : null}

          <label
            className="card"
            style={{
              padding: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)'
            }}
          >
            <div>
              <div style={{ fontWeight: 'var(--fw-medium)' }}>Garder le média téléchargé</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                Le dossier choisi est mémorisé et réutilisé au prochain import.
              </div>
            </div>
            <input
              className="toggle"
              type="checkbox"
              checked={url.keepMedia}
              onChange={(event) => {
                void toggleKeepMedia(event.target.checked);
              }}
            />
          </label>

          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Dossier de conservation</span>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <input className="input mono" value={url.destinationDirectory} readOnly style={{ flex: 1, minWidth: 320 }} />
              <button className="btn btn-secondary" onClick={() => void pickRemoteMediaDirectory()}>
                Parcourir
              </button>
            </div>
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>
              {url.keepMedia
                ? 'Le média téléchargé sera conservé ici.'
                : 'Si la conservation est désactivée, ce dossier est tout de même mémorisé pour votre prochain choix.'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => void resolveUrl()}
              disabled={!isValidUrl || url.isResolving || isTranscribing}
            >
              {url.isResolving ? 'Analyse…' : 'Préparer le lien'}
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void startFromUrl()}
              disabled={!isValidUrl || isTranscribing || installedModels.length === 0}
            >
              {isTranscribing ? 'Transcription en cours…' : 'Télécharger puis transcrire'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--danger)', background: 'var(--danger-bg)' }}>
            {error.message}
          </div>
        ) : null}

        {progress ? <ProgressPanel /> : null}
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
        <OptionsPanel />

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{ fontWeight: 'var(--fw-semibold)' }}>Aperçu / confirmation</div>
            <span className={`pill ${url.preview ? 'pill-success' : 'pill-neutral'}`}>
              {url.preview ? 'Prêt' : 'En attente'}
            </span>
          </div>
          {url.preview ? (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {url.preview.thumbnailUrl ? (
                <div
                  style={{
                    aspectRatio: '16 / 9',
                    borderRadius: 'var(--r-lg)',
                    overflow: 'hidden',
                    background: 'var(--bg-3)'
                  }}
                >
                  <img
                    src={url.preview.thumbnailUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <span className="pill pill-violet" style={{ width: 'fit-content' }}>
                  {url.preview.sourceType === 'youtube' ? 'YouTube' : 'Flux distant'}
                </span>
                <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}>
                  {url.preview.title}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {url.preview.creator ?? 'Source distante'}
                  {url.preview.duration ? ` · ${formatDuration(url.preview.duration)}` : ''}
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs-sm)' }}>
                  Le média source est récupéré dans sa meilleure qualité disponible, puis la conversion pour Whisper se fait séparément.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
              Analysez le lien pour afficher son résumé ici avant la transcription.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-4)' }}>
          <div style={{ fontWeight: 'var(--fw-semibold)' }}>Rappel</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            Langue d’entrée, langue de sortie et modèle sont identiques au flux fichier, mais appliqués ici au média téléchargé.
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            {prefs?.keepRemoteMedia
              ? 'La conservation des médias distants est actuellement activée par défaut.'
              : 'La conservation des médias distants est actuellement désactivée par défaut.'}
          </div>
        </div>
      </div>
    </div>
  );
}
