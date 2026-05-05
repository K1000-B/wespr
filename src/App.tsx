import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TitleBar } from './components/TitleBar';
import { Home } from './pages/Home';
import { Result } from './pages/Result';
import { Settings } from './pages/Settings';
import { hasNativeBridge } from './lib/wespr';
import { useModelsStore } from './store/models';
import { useTranscriptionStore } from './store/transcription';

function PageSwitcher() {
  const { page } = useTranscriptionStore();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={page}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22 }}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {page === 'home' ? <Home /> : null}
        {page === 'result' ? <Result /> : null}
        {page === 'settings' ? <Settings /> : null}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  const { page, setPage, bindIpc, reset } = useTranscriptionStore();
  const { refresh, bindProgress } = useModelsStore();

  useEffect(() => {
    if (!hasNativeBridge) {
      console.warn('Bridge preload indisponible: mode navigateur détecté.');
      return;
    }

    void refresh().catch((error) => {
      console.error('Chargement des modèles impossible', error);
    });

    let offIpc = () => {};
    let offProgress = () => {};

    try {
      offIpc = bindIpc();
      offProgress = bindProgress();
    } catch (error) {
      console.error('Initialisation renderer impossible', error);
    }

    return () => {
      offIpc();
      offProgress();
    };
  }, [bindIpc, bindProgress, refresh]);

  const pageLabel = page === 'home' ? 'Nouvelle transcription' : page === 'result' ? 'Résultat' : 'Réglages';

  return (
    <div className="app-window">
      {!hasNativeBridge ? (
        <div
          className="card"
          style={{
            margin: 'var(--space-4)',
            padding: 'var(--space-4)',
            color: 'var(--warning)',
            background: 'var(--warning-bg)'
          }}
        >
          Aperçu navigateur actif — pour tester l’ouverture de fichiers, les modèles et la transcription, lancez WeSpR dans Electron.
        </div>
      ) : null}
      <TitleBar
        pageLabel={pageLabel}
        onOpenSettings={() => setPage('settings')}
        onGoHome={() => {
          reset();
          setPage('home');
        }}
        showBack={page !== 'home'}
      />
      <PageSwitcher />
    </div>
  );
}
