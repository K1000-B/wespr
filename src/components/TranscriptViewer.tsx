import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranscriptionStore } from '../store/transcription';
import { formatDuration } from '../lib/utils';
import { wespr } from '../lib/wespr';

type Props = {
  onExport: () => void;
};

export function TranscriptViewer({ onExport }: Props) {
  const { result, search, setSearch, viewMode, setViewMode } = useTranscriptionStore();
  const [copied, setCopied] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const segments = useMemo(() => {
    if (!result) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return result.segments.filter((segment) =>
      query.length === 0 ? true : segment.text.toLowerCase().includes(query)
    );
  }, [result, search]);

  useEffect(() => {
    if (!result?.sourceFilePath) {
      setMediaUrl('');
      return;
    }

    let active = true;
    void wespr.getMediaSourceUrl(result.sourceFilePath).then((url) => {
      if (active) {
        setMediaUrl(url);
      }
    });

    return () => {
      active = false;
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [result?.sourceFilePath]);

  if (!result) {
    return null;
  }

  const activeSegmentIndex = segments.findIndex((segment) => currentTime >= segment.start && currentTime < segment.end);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      await audio.play();
      return;
    }

    audio.pause();
  };

  const seekTo = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 280 }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 12,
              top: 8,
              color: 'var(--text-tertiary)'
            }}
          >
            ⌕
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Rechercher dans le transcript"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="card" style={{ display: 'flex', padding: 4 }}>
          <button
            className={`btn ${viewMode === 'texte' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
            onClick={() => setViewMode('texte')}
          >
            Texte
          </button>
          <button
            className={`btn ${viewMode === 'locuteurs' ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
            onClick={() => setViewMode('locuteurs')}
          >
            Locuteurs
          </button>
        </div>
        <button className="btn btn-secondary" onClick={handleCopy}>
          {copied ? 'Copié' : 'Copier'}
        </button>
        <button className="btn btn-primary" onClick={onExport}>
          Exporter
        </button>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}>
        <audio
          ref={audioRef}
          src={mediaUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || result.duration)}
          onEnded={() => setIsPlaying(false)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-primary"
            style={{
              width: 36,
              minWidth: 36,
              padding: 0,
              borderRadius: '50%'
            }}
            onClick={() => void togglePlayback()}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <div className="mono" style={{ minWidth: 72 }}>
            {formatDuration(currentTime)}
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(duration || result.duration, 1)}
            step={0.1}
            value={Math.min(currentTime, duration || result.duration)}
            onChange={(event) => seekTo(Number(event.target.value))}
            style={{ flex: 1 }}
          />
          <div className="mono" style={{ minWidth: 72, textAlign: 'right' }}>
            {formatDuration(duration || result.duration)}
          </div>
        </div>
      </div>

      <div
        style={{
          minHeight: 0,
          overflow: 'auto',
          display: 'grid',
          gap: 'var(--space-2)'
        }}
      >
        {segments.map((segment, index) => {
          const highlighted = index === activeSegmentIndex;
          return (
            <div
              key={`${segment.start}-${segment.end}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1fr',
                gap: 'var(--space-4)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-lg)',
                background: highlighted ? 'var(--violet-900)' : 'transparent',
                color: highlighted ? 'var(--violet-50)' : 'var(--text-primary)'
              }}
            >
              <button
                className="btn btn-ghost btn-sm mono"
                style={{ justifyContent: 'flex-start', padding: 0 }}
                onClick={() => seekTo(segment.start)}
              >
                {formatDuration(segment.start)}
              </button>
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                {viewMode === 'locuteurs' && segment.speaker ? (
                  <span className="pill pill-neutral" style={{ width: 'fit-content' }}>
                    <span className="dot" style={{ color: 'var(--violet-400)' }} />
                    {segment.speaker.toUpperCase()}
                  </span>
                ) : null}
                <div
                  style={{
                    fontSize: 'var(--fs-md)',
                    lineHeight: 'var(--lh-normal)'
                  }}
                >
                  {segment.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
