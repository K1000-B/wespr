type Props = {
  pageLabel: string;
  onOpenSettings: () => void;
  onGoHome: () => void;
  showBack: boolean;
};

export function TitleBar({ pageLabel, onOpenSettings, onGoHome, showBack }: Props) {
  return (
    <header className="titlebar">
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
        {showBack ? (
          <button className="btn btn-ghost btn-sm" onClick={onGoHome}>
            Retour
          </button>
        ) : null}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenSettings}
          aria-label="Ouvrir les réglages"
        >
          Réglages
        </button>
      </div>
      <div className="titlebar-title">{pageLabel}</div>
    </header>
  );
}

