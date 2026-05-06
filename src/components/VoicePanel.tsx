import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppPrefs, TranscriptResult, VoiceLiveState, VoiceMode, VoiceSessionSummary } from '../../electron/preload';
import { wespr } from '../lib/wespr';
import { formatDuration } from '../lib/utils';
import { useModelsStore } from '../store/models';
import { useTranscriptionStore } from '../store/transcription';

type MicDevice = {
  deviceId: string;
  label: string;
};

type CaptureStatus = 'idle' | 'recording' | 'paused' | 'finalizing';

function floatToPcm16(input: Float32Array) {
  const pcm16 = new Array<number>(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
    pcm16[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return pcm16;
}

function pickLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `Micro ${index + 1}`;
}

export function VoicePanel() {
  const { options, setOptions, showResult } = useTranscriptionStore();
  const { models } = useModelsStore();
  const [prefs, setPrefs] = useState<AppPrefs | null>(null);
  const [mode, setMode] = useState<VoiceMode>('memo');
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 40 }, () => 0));
  const [voiceError, setVoiceError] = useState('');
  const [liveState, setLiveState] = useState<VoiceLiveState | null>(null);
  const [sessions, setSessions] = useState<VoiceSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const pcmBufferRef = useRef<number[]>([]);
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    void wespr.getPrefs().then((value) => {
      setPrefs(value);
      setMode(value.defaultVoiceMode);
      setSelectedMicId(value.defaultMicrophoneId);
    });
    void refreshSessions();
    void refreshDevices();

    return () => {
      cleanupCapture();
    };
  }, []);

  useEffect(() => {
    if (status !== 'recording') {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const isRecording = status === 'recording' || status === 'paused';
  const modeDescription = mode === 'memo'
    ? 'Enregistrez d’abord, transcription complète à la fin.'
    : 'Le texte apparaît progressivement pendant que vous parlez.';
  const installedModels = useMemo(() => models.filter((model) => model.installed), [models]);

  const committedWords = useMemo(() => liveState?.committedText ?? '', [liveState]);
  const partialWords = useMemo(() => liveState?.partialText ?? '', [liveState]);

  async function refreshDevices() {
    const listed = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const microphones = listed
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: pickLabel(device, index)
      }));
    setDevices(microphones);
    if (!selectedMicId && microphones[0]) {
      setSelectedMicId(microphones[0].deviceId);
    }
  }

  async function refreshSessions() {
    const entries = await wespr.listVoiceSessions();
    setSessions(entries);
  }

  async function startCapture() {
    setVoiceError('');
    setLiveState(null);
    setElapsed(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId
          ? {
              deviceId: { exact: selectedMicId },
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true
            }
          : true
      });
      streamRef.current = stream;
      await refreshDevices();

      const { sessionId } = await wespr.startVoiceSession({
        mode,
        keepAudio: prefs?.keepVoiceAudio ?? false
      });
      sessionIdRef.current = sessionId;

      const context = new AudioContext({ sampleRate: 16000 });
      contextRef.current = context;
      const processorUrl = URL.createObjectURL(
        new Blob(
          [
            `
            class WesprMicProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0];
                if (input && input[0]) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('wespr-mic-processor', WesprMicProcessor);
          `
          ],
          { type: 'application/javascript' }
        )
      );
      await context.audioWorklet.addModule(processorUrl);
      URL.revokeObjectURL(processorUrl);

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'wespr-mic-processor');
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(context.destination);
      sourceRef.current = source;
      workletNodeRef.current = worklet;

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const frame = new Float32Array(event.data);
        const levelValue = Math.min(
          1,
          Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(frame.length, 1)) * 3
        );
        setLevel(levelValue);
        setWaveform((current) => [...current.slice(1), levelValue]);
        pcmBufferRef.current.push(...floatToPcm16(frame));
      };

      flushTimerRef.current = window.setInterval(() => {
        void flushPcmBuffer();
      }, 250);

      setStatus('recording');
      await wespr.setPrefs({ defaultMicrophoneId: selectedMicId, defaultVoiceMode: mode });
    } catch (error) {
      setVoiceError(
        error instanceof Error
          ? `${error.message} — autorisez le micro dans macOS puis réessayez.`
          : 'Accès micro impossible — autorisez le micro dans macOS puis réessayez.'
      );
      cleanupCapture();
    }
  }

  async function flushPcmBuffer() {
    const chunk = pcmBufferRef.current.splice(0, pcmBufferRef.current.length);
    if (chunk.length === 0 || !sessionIdRef.current) {
      return;
    }

    const nextState = await wespr.appendVoiceChunk({
      sessionId: sessionIdRef.current,
      pcm16: chunk
    });

    if (nextState) {
      setLiveState(nextState);
    }
  }

  async function togglePause() {
    const context = contextRef.current;
    if (!context) {
      return;
    }

    if (status === 'recording') {
      await flushPcmBuffer();
      await context.suspend();
      setStatus('paused');
      return;
    }

    if (status === 'paused') {
      await context.resume();
      setStatus('recording');
    }
  }

  async function stopCapture() {
    if (!sessionIdRef.current) {
      cleanupCapture();
      return;
    }

    setStatus('finalizing');
    try {
      await flushPcmBuffer();
      const detail = await wespr.finalizeVoiceSession(sessionIdRef.current, {
        modelId: options.modelId,
        language: options.language,
        translateToEn: options.translateToEn,
        diarize: options.diarize
      });
      showResult(detail.transcript as TranscriptResult);
      await refreshSessions();
      cleanupCapture();
    } catch (error) {
      setVoiceError(
        error instanceof Error
          ? `${error.message} — réessayez avec un autre micro ou un autre modèle.`
          : 'La dictée a échoué — réessayez.'
      );
      cleanupCapture();
    }
  }

  function cleanupCapture() {
    if (flushTimerRef.current) {
      window.clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pcmBufferRef.current = [];
    sessionIdRef.current = '';
    setStatus('idle');
    setLevel(0);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  }

  async function openSession(sessionId: string) {
    setActiveSessionId(sessionId);
    const detail = await wespr.getVoiceSession(sessionId);
    showResult(detail.transcript);
  }

  async function removeSession(sessionId: string) {
    await wespr.deleteVoiceSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId('');
    }
    await refreshSessions();
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 'var(--space-6)', minHeight: 0 }}>
      <aside className="card" style={{ padding: 'var(--space-4)', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <div style={{ padding: 'var(--space-2) var(--space-2) var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 'var(--fw-semibold)' }}>
            Mes dictées
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
            Historique local enregistré sur votre Mac.
          </div>
        </div>
        <div style={{ minHeight: 0, overflow: 'auto', display: 'grid', gap: 'var(--space-2)' }}>
          {sessions.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', padding: 'var(--space-2)' }}>
              Aucune session enregistrée pour le moment.
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2)',
                  background: activeSessionId === session.id ? 'var(--violet-900)' : 'var(--bg-1)'
                }}
              >
                <button
                  className="btn btn-ghost"
                  style={{
                    height: 'auto',
                    padding: 'var(--space-3)',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    display: 'grid',
                    gap: 'var(--space-1)',
                    textAlign: 'left'
                  }}
                  onClick={() => void openSession(session.id)}
                >
                  <span style={{ fontWeight: 'var(--fw-semibold)', whiteSpace: 'normal' }}>{session.title}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', whiteSpace: 'normal' }}>
                    {new Date(session.createdAt).toLocaleString('fr-FR')} · {formatDuration(session.duration)}
                  </span>
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: 'start', marginTop: 'var(--space-2)' }}
                  onClick={() => void removeSession(session.id)}
                >
                  Supprimer
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <div style={{ display: 'grid', gap: 'var(--space-6)', alignContent: 'start', minHeight: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--lh-tight)' }}>
            Dictée vocale
          </div>
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)', maxWidth: 720 }}>
            Tout reste sur votre Mac. Choisissez un micro, enregistrez un mémo ou laissez le texte apparaître en temps réel.
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-5)' }}>
          <div style={{ display: 'inline-flex', gap: 'var(--space-1)', padding: 4, background: 'var(--bg-0)', borderRadius: 'var(--r-lg)' }}>
            {[
              ['memo', 'Mémo vocal'],
              ['live', 'Temps réel']
            ].map(([id, label]) => (
              <button
                key={id}
                className={`btn ${mode === id ? 'btn-secondary' : 'btn-ghost'}`}
                disabled={isRecording}
                onClick={() => setMode(id as VoiceMode)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>{modeDescription}</div>

          <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Modèle de transcription</span>
            <select
              className="input"
              value={options.modelId}
              onChange={(event) => setOptions({ modelId: event.target.value })}
              disabled={isRecording}
            >
              {installedModels.length === 0 ? (
                <option value="">Aucun modèle installé — ouvrez Réglages pour en télécharger un.</option>
              ) : null}
              {installedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 'var(--space-4)' }}>
            <label style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Micro</span>
              <select
                className="input"
                value={selectedMicId}
                onChange={(event) => setSelectedMicId(event.target.value)}
                disabled={isRecording}
              >
                <option value="">Micro par défaut</option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Niveau</span>
              <div className="card" style={{ padding: 'var(--space-3)', display: 'grid', alignItems: 'center' }}>
                <div style={{ height: 10, borderRadius: 'var(--r-pill)', background: 'var(--bg-3)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--violet-600), var(--violet-400))' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--space-6)', display: 'grid', gap: 'var(--space-6)', background: 'var(--bg-inset)' }}>
            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div>
                <div className="mono" style={{ fontSize: 'var(--fs-3xl)', fontWeight: 'var(--fw-semibold)' }}>
                  {formatDuration(elapsed)}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                  {status === 'idle' ? 'Prêt à enregistrer' : status === 'paused' ? 'En pause' : status === 'finalizing' ? 'Transcription en cours…' : 'Capture en cours'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                {!isRecording ? (
                  <button className="btn btn-primary btn-lg" onClick={() => void startCapture()} disabled={!options.modelId}>
                    Démarrer
                  </button>
                ) : (
                    <>
                    <button className="btn btn-secondary" onClick={() => void togglePause()}>
                      {status === 'paused' ? 'Reprendre' : 'Pause'}
                    </button>
                    <button className="btn btn-primary btn-lg" onClick={() => void stopCapture()}>
                      Terminer
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', alignItems: 'end', gap: 'var(--space-1)', height: 96 }}>
              {waveform.map((value, index) => (
                <div
                  key={`${index}-${value}`}
                  style={{
                    borderRadius: 'var(--r-pill)',
                    height: `${Math.max(8, Math.round(value * 100))}%`,
                    background: status === 'paused' ? 'var(--text-tertiary)' : 'var(--violet-400)'
                  }}
                />
              ))}
            </div>
          </div>

          {mode === 'live' ? (
            <div className="card" style={{ padding: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)', minHeight: 220 }}>
              <div style={{ fontWeight: 'var(--fw-semibold)' }}>Texte en direct</div>
              <div style={{ color: 'var(--text-primary)', lineHeight: 'var(--lh-normal)', fontSize: 'var(--fs-md)' }}>
                {committedWords || partialWords ? (
                  <>
                    <span>{committedWords} </span>
                    <span style={{ color: 'var(--violet-200)' }}>{partialWords}</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    Le texte apparaîtra ici à mesure que vous parlez.
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {voiceError ? (
            <div className="card" style={{ padding: 'var(--space-4)', color: 'var(--danger)', background: 'var(--danger-bg)' }}>
              {voiceError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
