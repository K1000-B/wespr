import { useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileInfo } from '../../electron/preload';
import { formatBytes, formatDuration } from '../lib/utils';
import { hasNativeBridge, wespr } from '../lib/wespr';

type Props = {
  file: FileInfo | null;
  onFileInfo: (file: FileInfo) => void;
};

function CloudIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 18a4 4 0 1 1 1.1-7.85A5.5 5.5 0 0 1 18.5 12H19a3 3 0 1 1 0 6H7Zm5-8v7m0-7 2.8 2.8M12 10 9.2 12.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3.5h6l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7 20V5A1.5 1.5 0 0 1 8.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14 3.5V8h4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function DropZone({ file, onFileInfo }: Props) {
  const onBrowse = async () => {
    const selected = await wespr.openFile();
    if (!selected) {
      return;
    }
    const fileInfo = await wespr.getFileInfo(selected);
    onFileInfo(fileInfo);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: async (acceptedFiles) => {
      const picked = acceptedFiles[0];
      if (!picked?.path) {
        return;
      }
      const fileInfo = await wespr.getFileInfo(picked.path);
      onFileInfo(fileInfo);
    }
  });

  const waveform = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          style={{
            width: 4,
            height: 10 + (index % 6) * 3,
            borderRadius: 'var(--r-pill)',
            background: index % 2 === 0 ? 'var(--violet-400)' : 'var(--violet-700)',
            animation: `wave 700ms var(--ease-out) ${index * 40}ms infinite alternate`
          }}
        />
      )),
    []
  );

  if (file) {
    return (
      <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--r-lg)',
            background: 'var(--violet-900)',
            border: '1px solid var(--violet-700)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--violet-200)'
          }}
        >
          <FileIcon />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--fs-lg)',
              fontWeight: 'var(--fw-semibold)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {file.name}
          </div>
          <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            {formatDuration(file.duration)} · {formatBytes(file.size)} · {file.format}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }}>
          {waveform}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBrowse}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      style={{
        padding: isDragActive ? 2 : 0,
        borderRadius: 'var(--r-xl)',
        background: isDragActive
          ? 'linear-gradient(135deg, var(--violet-500), var(--violet-700))'
          : 'transparent',
        position: 'relative'
      }}
    >
      {isDragActive ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--r-xl)',
            background: 'radial-gradient(60% 80% at 50% 50%, var(--violet-glow), transparent 70%)'
          }}
        />
      ) : null}
      <div
        className="card"
        style={{
          position: 'relative',
          padding: '40px',
          borderStyle: 'dashed',
          borderWidth: '1.5px',
          borderColor: isDragActive ? 'transparent' : 'var(--border-default)',
          borderRadius: 'var(--r-xl)',
          background: isDragActive ? 'var(--bg-1)' : 'var(--bg-1)',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          minHeight: 270
        }}
      >
        <input {...getInputProps()} />
        <div
          style={{
            width: isDragActive ? 80 : 64,
            height: isDragActive ? 80 : 64,
            borderRadius: '50%',
            background: 'var(--bg-2)',
            display: 'grid',
            placeItems: 'center',
            color: isDragActive ? 'var(--violet-200)' : 'var(--text-primary)',
            animation: isDragActive ? 'pulse 1.6s ease-in-out infinite' : undefined
          }}
        >
          <CloudIcon />
        </div>
        <div style={{ marginTop: 'var(--space-5)', fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)', color: isDragActive ? 'var(--violet-50)' : 'var(--text-primary)' }}>
          {isDragActive ? 'Déposez pour transcrire' : 'Glissez votre fichier ici'}
        </div>
        <div style={{ marginTop: 'var(--space-2)', color: isDragActive ? 'var(--violet-200)' : 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
          {isDragActive
            ? 'Audio ou vidéo, tout reste sur votre Mac.'
            : hasNativeBridge
              ? 'Audio ou vidéo, sans limite de format côté interface.'
              : 'Aperçu navigateur uniquement. Ouvrez l’app Electron pour choisir un fichier.'}
        </div>
        <button
          className="btn btn-secondary"
          onClick={onBrowse}
          disabled={!hasNativeBridge}
          style={{ marginTop: 'var(--space-6)' }}
        >
          Parcourir…
        </button>
      </div>
    </div>
  );
}
