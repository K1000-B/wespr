import fs from 'fs-extra';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  convertToMonoWav,
  ensureTempDir,
  getFileInfo,
  writeLog
} from '../services/ffmpeg';
import { segmentAudio } from '../services/segmenter';
import { transcribeChunk, readChunkOutputPath } from '../services/whisper';
import { mergeChunks } from '../services/merger';
import { cleanupJob } from '../services/cleanup';
import { resolveModelPath } from '../services/modelManager';

type TranscribeOptions = {
  filePath: string;
  modelId: string;
  language: string | 'auto';
  translateToEn: boolean;
  diarize: boolean;
};

type SaveOptions = {
  defaultName: string;
  formats: Array<'txt' | 'txt-timestamps' | 'srt' | 'vtt' | 'md' | 'json' | 'docx'>;
  includeTimestamps: boolean;
  includeSpeakers: boolean;
  timestampGranularity: 'segment' | '10s' | '30s' | '1min';
  destination?: string;
};

type TranscriptResult = {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
    confidence?: number;
  }>;
  language: string;
  duration: number;
  modelUsed: string;
  processingTime: number;
  sourceFilePath: string;
};

let cancelled = false;

function sendToRenderer(channel: string, payload: unknown) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function formatTimestamp(value: number) {
  const total = Math.max(0, Math.floor(value));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function toSrtTimestamp(value: number) {
  return `${formatTimestamp(value).replace(/:/g, ':')},000`;
}

async function exportTranscript(result: TranscriptResult, opts: SaveOptions) {
  const writtenPaths: string[] = [];
  const baseName = opts.defaultName || 'transcription';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = opts.destination ?? path.join(process.env.HOME ?? '', 'Downloads');
  await fs.ensureDir(destination);

  const timestampedText = result.segments
    .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.text}`)
    .join('\n');

  for (const format of opts.formats) {
    const filePath = path.join(destination, `${baseName}_${stamp}.${format === 'txt-timestamps' ? 'txt' : format}`);
    let content = result.text;

    if (format === 'txt-timestamps') {
      content = timestampedText;
    } else if (format === 'srt') {
      content = result.segments
        .map(
          (segment, index) =>
            `${index + 1}\n${toSrtTimestamp(segment.start)} --> ${toSrtTimestamp(segment.end)}\n${segment.text}\n`
        )
        .join('\n');
    } else if (format === 'vtt') {
      content = `WEBVTT\n\n${result.segments
        .map(
          (segment) =>
            `${formatTimestamp(segment.start)}.000 --> ${formatTimestamp(segment.end)}.000\n${segment.text}`
        )
        .join('\n\n')}`;
    } else if (format === 'md') {
      content = result.segments
        .map((segment) => `- **${formatTimestamp(segment.start)}** ${segment.text}`)
        .join('\n');
    } else if (format === 'json') {
      content = JSON.stringify(result, null, 2);
    } else if (format === 'docx') {
      content = `WeSpR\n\n${timestampedText}`;
    }

    await fs.writeFile(filePath, content, 'utf8');
    writtenPaths.push(filePath);
  }

  return writtenPaths;
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

  ipcMain.handle('wespr:transcribe', async (_event, opts: TranscribeOptions) => {
    cancelled = false;
    const startedAt = Date.now();
    const jobId = `${Date.now()}`;
    const tempDir = await ensureTempDir(jobId);
    const fileInfo = await getFileInfo(opts.filePath);
    const wavPath = path.join(tempDir, 'audio.wav');

    try {
      sendToRenderer('wespr:progress', {
        step: 'converting',
        pct: 0,
        message: 'Préparation du fichier'
      });

      await convertToMonoWav(opts.filePath, wavPath, fileInfo.duration, (pct, message) => {
        sendToRenderer('wespr:progress', {
          step: 'converting',
          pct,
          message
        });
      });

      if (cancelled) {
        throw new Error('Transcription annulée. Le fichier n’a pas été modifié.');
      }

      sendToRenderer('wespr:progress', {
        step: 'segmenting',
        pct: 15,
        message: 'Découpage du fichier'
      });

      const chunkPaths = await segmentAudio(wavPath, tempDir, (total) => {
        sendToRenderer('wespr:progress', {
          step: 'segmenting',
          pct: 22,
          totalChunks: total,
          message: `${total} segment${total > 1 ? 's' : ''} prêt${total > 1 ? 's' : ''}`
        });
      });

      const modelPath = await resolveModelPath(opts.modelId);

      const chunks = [];
      for (let index = 0; index < chunkPaths.length; index += 1) {
        if (cancelled) {
          throw new Error('Transcription annulée. Le fichier n’a pas été modifié.');
        }

        sendToRenderer('wespr:progress', {
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
          opts.language,
          opts.translateToEn,
          opts.diarize,
          (line) => {
            sendToRenderer('wespr:progress', {
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

      sendToRenderer('wespr:progress', {
        step: 'merging',
        pct: 88,
        message: 'Assemblage final'
      });

      const merged = mergeChunks(
        chunks,
        fileInfo.duration,
        opts.modelId,
        Math.round((Date.now() - startedAt) / 1000)
      );
      const result = {
        ...merged,
        sourceFilePath: opts.filePath
      };

      sendToRenderer('wespr:progress', {
        step: 'cleanup',
        pct: 98,
        message: 'Finalisation'
      });

      await cleanupJob(jobId);
      sendToRenderer('wespr:progress', {
        step: 'cleanup',
        pct: 100,
        message: 'Transcript prêt'
      });
      sendToRenderer('wespr:result', result);
      return;
    } catch (error) {
      const payload = {
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
      await writeLog(JSON.stringify(payload, null, 2));
      await cleanupJob(jobId, true);
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
  ipcMain.handle(
    'wespr:get-media-source-url',
    async (_event, filePath: string) => `wespr-media://local?path=${encodeURIComponent(filePath)}`
  );
}
