import fs from 'fs-extra';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type {
  ProgressEvent,
  TranscriptResult,
  TranscribeOptions,
  VoiceLiveState
} from '../preload';
import {
  convertToMonoWav,
  ensureTempDir,
  getFileInfo,
  getTempDir,
  writeLog
} from '../services/ffmpeg';
import { segmentAudio } from '../services/segmenter';
import { transcribeChunk, readChunkOutputPath } from '../services/whisper';
import { mergeChunks } from '../services/merger';
import { cleanupJob } from '../services/cleanup';
import { listModels, resolveModelPath } from '../services/modelManager';
import { prefsStore } from '../services/prefs';
import { downloadUrlAudio, getRemoteMediaDir, resolveUrlPreview } from '../services/urlImport';
import { deleteVoiceSession, getVoiceAudioDir, getVoiceSession, listVoiceSessions, saveVoiceSession } from '../services/voiceSessions';

type SaveOptions = {
  defaultName: string;
  formats: Array<'txt' | 'txt-timestamps' | 'srt' | 'vtt' | 'md' | 'json' | 'docx'>;
  includeTimestamps: boolean;
  includeSpeakers: boolean;
  timestampGranularity: 'segment' | '10s' | '30s' | '1min';
  destination?: string;
};

type RuntimeVoiceSession = {
  id: string;
  mode: 'memo' | 'live';
  keepAudio: boolean;
  pcm16: number[];
  lastLiveSampleCount: number;
  liveState: VoiceLiveState;
};

const liveSessions = new Map<string, RuntimeVoiceSession>();

let cancelled = false;

function sendToRenderer(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function sendProgress(progress: ProgressEvent) {
  sendToRenderer('wespr:progress', progress);
}

function formatTimestamp(value: number) {
  const total = Math.max(0, Math.floor(value));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function toSrtTimestamp(value: number) {
  return `${formatTimestamp(value)},000`;
}

function speakerLabel(segment: TranscriptResult['segments'][number], includeSpeakers: boolean) {
  return includeSpeakers && segment.speaker ? `${segment.speaker.toUpperCase()} · ` : '';
}

function mergeSpeakerBlocks(
  segments: TranscriptResult['segments'],
  includeSpeakers: boolean
) {
  const blocks: Array<{
    start: number;
    end: number;
    speaker?: string;
    text: string;
  }> = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) {
      continue;
    }

    const previous = blocks[blocks.length - 1];
    const canMerge =
      previous &&
      (includeSpeakers ? previous.speaker === segment.speaker : true);

    if (canMerge) {
      previous.end = segment.end;
      previous.text = `${previous.text} ${text}`.trim();
      continue;
    }

    blocks.push({
      start: segment.start,
      end: segment.end,
      speaker: segment.speaker,
      text
    });
  }

  return blocks;
}

async function exportTranscript(result: TranscriptResult, opts: SaveOptions) {
  const writtenPaths: string[] = [];
  const baseName = opts.defaultName || 'transcription';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = opts.destination ?? path.join(process.env.HOME ?? '', 'Downloads');
  await fs.ensureDir(destination);

  const blocks = mergeSpeakerBlocks(result.segments, opts.includeSpeakers);
  const paragraphText = blocks
    .map((block) => `${speakerLabel(block, opts.includeSpeakers)}${block.text}`.trim())
    .join('\n\n');
  const timestampedText = blocks
    .map((block) => `[${formatTimestamp(block.start)}] ${speakerLabel(block, opts.includeSpeakers)}${block.text}`.trim())
    .join('\n');

  for (const format of opts.formats) {
    const filePath = path.join(destination, `${baseName}_${stamp}.${format === 'txt-timestamps' ? 'txt' : format}`);
    let content = paragraphText || result.text;

    if (format === 'txt-timestamps') {
      content = timestampedText;
    } else if (format === 'srt') {
      content = blocks
        .map(
          (block, index) =>
            `${index + 1}\n${toSrtTimestamp(block.start)} --> ${toSrtTimestamp(block.end)}\n${speakerLabel(block, opts.includeSpeakers)}${block.text}\n`
        )
        .join('\n');
    } else if (format === 'vtt') {
      content = `WEBVTT\n\n${blocks
        .map(
          (block) =>
            `${formatTimestamp(block.start)}.000 --> ${formatTimestamp(block.end)}.000\n${speakerLabel(block, opts.includeSpeakers)}${block.text}`
        )
        .join('\n\n')}`;
    } else if (format === 'md') {
      content = blocks
        .map((block) => `- **${formatTimestamp(block.start)}** ${speakerLabel(block, opts.includeSpeakers)}${block.text}`)
        .join('\n');
    } else if (format === 'json') {
      content = JSON.stringify(
        opts.includeSpeakers
          ? result
          : {
              ...result,
              segments: result.segments.map(({ speaker, ...segment }) => segment)
            },
        null,
        2
      );
    } else if (format === 'docx') {
      content = `WeSpR\n\n${timestampedText}`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    writtenPaths.push(filePath);
  }

  return writtenPaths;
}

async function runPipeline(
  filePath: string,
  options: Omit<TranscribeOptions, 'source'>,
  meta: {
    sourceKind: TranscriptResult['sourceKind'];
    sourceLabel?: string;
    mediaFilePath?: string;
  }
) {
  cancelled = false;
  const startedAt = Date.now();
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempDir = await ensureTempDir(jobId);
  const fileInfo = await getFileInfo(filePath);
  const wavPath = path.join(tempDir, 'audio.wav');

  try {
    sendProgress({
      step: 'converting',
      pct: 0,
      message: 'Préparation du fichier'
    });

    await convertToMonoWav(filePath, wavPath, fileInfo.duration, (pct, message) => {
      sendProgress({
        step: 'converting',
        pct,
        message
      });
    });

    if (cancelled) {
      throw new Error('Transcription annulée. Le fichier n’a pas été modifié.');
    }

    sendProgress({
      step: 'segmenting',
      pct: 15,
      message: 'Découpage du fichier'
    });

    const chunkPaths = await segmentAudio(wavPath, tempDir, (total) => {
      sendProgress({
        step: 'segmenting',
        pct: 22,
        totalChunks: total,
        message: `${total} segment${total > 1 ? 's' : ''} prêt${total > 1 ? 's' : ''}`
      });
    });

    const modelPath = await resolveModelPath(options.modelId);

    const chunks = [];
    for (let index = 0; index < chunkPaths.length; index += 1) {
      if (cancelled) {
        throw new Error('Transcription annulée. Le fichier n’a pas été modifié.');
      }

      sendProgress({
        step: 'transcribing',
        pct: 22 + ((index + 1) / chunkPaths.length) * 58,
        chunk: index + 1,
        totalChunks: chunkPaths.length,
        message: `Segment ${index + 1}/${chunkPaths.length}`
      });

      const outputPrefix = readChunkOutputPath(tempDir, index);
      const { result } = await transcribeChunk(
        modelPath,
        chunkPaths[index],
        outputPrefix,
        options.language,
        options.translateToEn,
        options.diarize,
        (line) => {
          sendProgress({
            step: 'transcribing',
            pct: 22 + ((index + 1) / chunkPaths.length) * 58,
            chunk: index + 1,
            totalChunks: chunkPaths.length,
            message: line
          });
        }
      );
      chunks.push(result);
    }

    sendProgress({
      step: 'merging',
      pct: 88,
      message: 'Assemblage final'
    });

    const merged = mergeChunks(
      chunks,
      fileInfo.duration,
      options.modelId,
      Math.round((Date.now() - startedAt) / 1000)
    );

    const result: TranscriptResult = {
      ...merged,
      sourceFilePath: meta.mediaFilePath ?? filePath,
      sourceKind: meta.sourceKind,
      sourceLabel: meta.sourceLabel,
      mediaFilePath: meta.mediaFilePath
    };

    sendProgress({
      step: 'cleanup',
      pct: 98,
      message: 'Finalisation'
    });

    await cleanupJob(jobId);
    sendProgress({
      step: 'cleanup',
      pct: 100,
      message: 'Transcript prêt'
    });

    return result;
  } catch (error) {
    const payload = normalizeError(error);
    await writeLog(JSON.stringify(payload, null, 2));
    await cleanupJob(jobId, true);
    throw Object.assign(error instanceof Error ? error : new Error(payload.message), payload);
  }
}

function normalizeError(error: unknown) {
  return {
    step: 'transcription',
    message:
      error instanceof Error
        ? `${error.message} — Réessayez avec un autre fichier ou un autre modèle.`
        : 'La transcription a échoué — réessayez avec un autre fichier.',
    code: typeof error === 'object' && error && 'code' in error ? Number((error as { code: number }).code) : undefined,
    stderr:
      typeof error === 'object' && error && 'stderr' in error
        ? String((error as { stderr: string }).stderr)
        : undefined
  };
}

async function runTranscriptionFromOptions(opts: TranscribeOptions): Promise<TranscriptResult> {
  if (opts.source.kind === 'file') {
    return runPipeline(opts.source.filePath, stripSource(opts), {
      sourceKind: 'file',
      mediaFilePath: opts.source.filePath
    });
  }

  if (opts.source.kind === 'voice') {
    return runPipeline(opts.source.filePath, stripSource(opts), {
      sourceKind: 'voice',
      sourceLabel: 'Dictée vocale',
      mediaFilePath: opts.source.filePath
    });
  }

  const prefs = await prefsStore.getAll();
  const shouldKeepMedia = opts.source.keepMedia ?? prefs.keepRemoteMedia;
  const targetDir = shouldKeepMedia
    ? (opts.source.destinationDirectory || prefs.remoteMediaDirectory)
    : path.join(getRemoteMediaDir(), 'cache');
  sendProgress({
    step: 'downloading',
    pct: 0,
    message: 'Téléchargement de l’audio'
  });
  const downloaded = await downloadUrlAudio(
    {
      url: opts.source.url,
      sourceType: opts.source.sourceType,
      referer: opts.source.referer
    },
    targetDir,
    (pct, message) => {
      sendProgress({
        step: 'downloading',
        pct: Math.max(0, Math.min(pct, 100)),
        message
      });
    }
  );

  return runPipeline(downloaded.filePath, stripSource(opts), {
    sourceKind: 'url',
    sourceLabel: downloaded.label,
    mediaFilePath: downloaded.filePath
  });
}

function stripSource(opts: TranscribeOptions): Omit<TranscribeOptions, 'source'> {
  return {
    modelId: opts.modelId,
    language: opts.language,
    translateToEn: opts.translateToEn,
    diarize: opts.diarize
  };
}

function mergeLiveText(committed: string, partial: string, nextWindowText: string) {
  const previous = `${committed} ${partial}`.trim();
  if (!previous) {
    return {
      committedText: '',
      partialText: nextWindowText.trim()
    };
  }

  const previousWords = previous.split(/\s+/).filter(Boolean);
  const nextWords = nextWindowText.trim().split(/\s+/).filter(Boolean);
  let overlap = 0;
  const maxOverlap = Math.min(previousWords.length, nextWords.length, 8);

  for (let size = maxOverlap; size >= 1; size -= 1) {
    const left = previousWords.slice(-size).join(' ').toLowerCase();
    const right = nextWords.slice(0, size).join(' ').toLowerCase();
    if (left === right) {
      overlap = size;
      break;
    }
  }

  const appended = nextWords.slice(overlap).join(' ').trim();
  return {
    committedText: previous,
    partialText: appended
  };
}

function serializeWavFromPcm16(pcm16: Int16Array) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = 16000 * blockAlign;
  const dataSize = pcm16.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < pcm16.length; index += 1) {
    buffer.writeInt16LE(pcm16[index] ?? 0, 44 + index * 2);
  }

  return buffer;
}

async function resolveLiveModelId() {
  const models = await listModels();
  const installed = models.filter((model) => model.installed);
  const preferred = installed.find((model) => model.id === 'small.en')
    ?? installed.find((model) => model.id === 'small')
    ?? installed.find((model) => model.id.includes('small'))
    ?? installed[0];

  if (!preferred) {
    throw new Error('Aucun modèle installé — ouvrez Réglages pour en télécharger un.');
  }

  return preferred.id;
}

async function updateLiveTranscript(session: RuntimeVoiceSession) {
  const newSamplesSinceLastRun = session.pcm16.length - session.lastLiveSampleCount;
  if (newSamplesSinceLastRun < 32000) {
    return session.liveState;
  }

  session.lastLiveSampleCount = session.pcm16.length;
  const windowSamples = session.pcm16.slice(Math.max(0, session.pcm16.length - 96000));
  const tempDir = await ensureTempDir(`voice-live-${session.id}`);
  const wavPath = path.join(tempDir, 'live.wav');
  const outputPrefix = path.join(tempDir, 'live');
  const modelId = await resolveLiveModelId();
  const modelPath = await resolveModelPath(modelId);

  await fs.writeFile(wavPath, serializeWavFromPcm16(Int16Array.from(windowSamples)));
  const { result } = await transcribeChunk(
    modelPath,
    wavPath,
    outputPrefix,
    modelId.includes('.en') ? 'en' : 'auto',
    false,
    false,
    () => {}
  );

  const merged = mergeLiveText(
    session.liveState.committedText,
    session.liveState.partialText,
    result.text
  );
  session.liveState = {
    ...merged,
    updatedAt: new Date().toISOString()
  };
  return session.liveState;
}

async function finalizeVoiceSession(
  sessionId: string,
  options: Omit<TranscribeOptions, 'source'>
) {
  const session = liveSessions.get(sessionId);
  if (!session) {
    throw new Error('Session vocale introuvable.');
  }

  const tempDir = getTempDir(`voice-final-${session.id}`);
  await fs.ensureDir(tempDir);
  const tempAudioPath = path.join(tempDir, `${session.id}.wav`);
  await fs.writeFile(tempAudioPath, serializeWavFromPcm16(Int16Array.from(session.pcm16)));

  let mediaFilePath = tempAudioPath;
  let storedAudioPath: string | undefined;
  if (session.keepAudio) {
    await fs.ensureDir(getVoiceAudioDir());
    storedAudioPath = path.join(getVoiceAudioDir(), `${session.id}.wav`);
    await fs.copy(tempAudioPath, storedAudioPath, { overwrite: true });
    mediaFilePath = storedAudioPath;
  }

  const transcript = await runPipeline(mediaFilePath, options, {
    sourceKind: 'voice',
    sourceLabel: 'Dictée vocale',
    mediaFilePath
  });

  const title = pickVoiceSessionTitle(transcript.text);
  const detail = await saveVoiceSession({
    id: session.id,
    title,
    mode: session.mode,
    audioPath: storedAudioPath,
    transcript
  });

  liveSessions.delete(sessionId);
  return detail;
}

function pickVoiceSessionTitle(text: string) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return 'Dictée sans titre';
  }
  return cleaned.slice(0, 48);
}

export function registerTranscribeIpc() {
  ipcMain.handle('wespr:open-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Choisir un fichier à transcrire'
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('wespr:file-info', async (_event, filePath: string) => getFileInfo(filePath));
  ipcMain.handle('wespr:resolve-url-source', async (_event, input) => resolveUrlPreview(input));
  ipcMain.handle('wespr:get-media-source-url', async (_event, filePath: string) => `wespr-media://local?path=${encodeURIComponent(filePath)}`);

  ipcMain.handle('wespr:transcribe', async (_event, opts: TranscribeOptions) => {
    try {
      const result = await runTranscriptionFromOptions(opts);
      sendToRenderer('wespr:result', result);
      return result;
    } catch (error) {
      const payload = normalizeError(error);
      sendToRenderer('wespr:error', payload);
      throw error;
    }
  });

  ipcMain.handle('wespr:cancel-transcribe', () => {
    cancelled = true;
  });

  ipcMain.handle('wespr:save-transcript', async (_event, result: TranscriptResult, opts: SaveOptions) =>
    exportTranscript(result, opts)
  );

  ipcMain.handle('wespr:start-voice-session', async (_event, input: { mode: 'memo' | 'live'; keepAudio: boolean }) => {
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    liveSessions.set(sessionId, {
      id: sessionId,
      mode: input.mode,
      keepAudio: input.keepAudio,
      pcm16: [],
      lastLiveSampleCount: 0,
      liveState: {
        committedText: '',
        partialText: '',
        updatedAt: new Date().toISOString()
      }
    });
    return { sessionId };
  });

  ipcMain.handle('wespr:append-voice-chunk', async (_event, input: { sessionId: string; pcm16: number[] }) => {
    const session = liveSessions.get(input.sessionId);
    if (!session) {
      throw new Error('Session vocale introuvable.');
    }

    session.pcm16.push(...input.pcm16);
    if (session.mode !== 'live') {
      return null;
    }

    return updateLiveTranscript(session);
  });

  ipcMain.handle('wespr:finalize-voice-session', async (_event, sessionId: string, options: Omit<TranscribeOptions, 'source'>) => {
    const detail = await finalizeVoiceSession(sessionId, options);
    sendToRenderer('wespr:result', detail.transcript);
    return detail;
  });

  ipcMain.handle('wespr:discard-voice-session', async (_event, sessionId: string) => {
    liveSessions.delete(sessionId);
  });

  ipcMain.handle('wespr:list-voice-sessions', async () => listVoiceSessions());
  ipcMain.handle('wespr:get-voice-session', async (_event, sessionId: string) => getVoiceSession(sessionId));
  ipcMain.handle('wespr:delete-voice-session', async (_event, sessionId: string) => {
    await deleteVoiceSession(sessionId);
  });
}
