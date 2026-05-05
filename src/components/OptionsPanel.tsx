import { languageLabel } from '../lib/utils';
import { selectBestModel } from '../lib/modelSelection';
import { useModelsStore } from '../store/models';
import { useTranscriptionStore } from '../store/transcription';

const LANGUAGES = ['auto', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ja'];

export function OptionsPanel() {
  const { models } = useModelsStore();
  const { options, setOptions, autoSelectModel } = useTranscriptionStore();
  const installed = models.filter((model) => model.installed);
  const hasDiarize = installed.some((model) => model.id.includes('-tdrz'));

  return (
    <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Langue source</span>
          <select
            className="input"
            value={options.language}
            onChange={(event) => {
              const nextLanguage = event.target.value as typeof options.language;
              setOptions({ language: nextLanguage });
              const next = selectBestModel(nextLanguage, options.diarize, installed);
              if (next) {
                setOptions({ modelId: next.id });
              }
            }}
          >
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {languageLabel(code)}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Sortie</span>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <label className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
              <input
                type="radio"
                checked={!options.translateToEn}
                onChange={() => setOptions({ translateToEn: false })}
              />
              Langue d’origine
            </label>
            <label className="card" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
              <input
                type="radio"
                checked={options.translateToEn}
                onChange={() => setOptions({ translateToEn: true })}
              />
              Traduire en anglais
            </label>
          </div>
        </div>

        <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Modèle</span>
          <select
            className="input"
            value={options.modelId}
            onChange={(event) => setOptions({ modelId: event.target.value })}
          >
            {installed.length === 0 ? (
              <option value="">Aucun modèle installé — ouvrez Réglages pour en télécharger un.</option>
            ) : null}
            {installed.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasDiarize ? (
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
            <div style={{ fontWeight: 'var(--fw-medium)' }}>Reconnaître les locuteurs</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
              Affiche qui parle quand si un modèle compatible est installé.
            </div>
          </div>
          <input
            className="toggle"
            type="checkbox"
            checked={options.diarize}
            onChange={(event) => {
              const diarize = event.target.checked;
              setOptions({ diarize });
              autoSelectModel(models);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
