import fs from 'fs-extra';
import path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { ensureBundledBinaries, writeLog } from './ffmpeg';

export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  confidence?: number;
  speaker?: string;
};

export type WhisperChunkResult = {
  text: string;
  language: string;
  segments: WhisperSegment[];
};

export async function transcribeChunk(
  modelPath: string,
  chunkPath: string,
  outputPrefix: string,
  language: string,
  translateToEn: boolean,
  diarize: boolean,
  onProgressMessage: (message: string) => void
): Promise<{ result: WhisperChunkResult; child: ChildProcessWithoutNullStreams }> {
  const binaries = await ensureBundledBinaries();
  const args = [
    '-m',
    modelPath,
    '-f',
    chunkPath,
    '-l',
    language,
    '-oj',
    '-of',
    outputPrefix
  ];

  if (translateToEn) {
    args.push('-tr');
  }
  if (diarize) {
    args.push('-tdrz');
  }

  void writeLog(`whisper: spawn ${path.basename(binaries.whisper)} -m ${path.basename(modelPath)} -f ${path.basename(chunkPath)}`);

  return new Promise((resolve, reject) => {
    const child = spawn(binaries.whisper, args);
    const stderr: string[] = [];

    // Timeout de sécurité : 10 min par chunk de 55 s est largement suffisant.
    // Si whisper-cli ne répond pas, on le tue plutôt que de bloquer indéfiniment.
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      const err = Object.assign(
        new Error('La transcription a pris trop de temps — le processus a été interrompu.'),
        { code: -1, stderr: stderr.join('') }
      );
      void writeLog(`whisper: timeout killed after 10 min for ${path.basename(chunkPath)}`);
      reject(err);
    }, 10 * 60_000);

    child.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      stderr.push(line);
      onProgressMessage(line.trim());
    });

    child.stdout.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.trim()) {
        onProgressMessage(line.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(watchdog);
      void writeLog(`whisper: spawn error: ${err.message}`);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(watchdog);
      void writeLog(`whisper: close code=${code} for ${path.basename(chunkPath)}`);

      if (code !== 0) {
        reject(
          Object.assign(new Error('La transcription a échoué.'), {
            code,
            stderr: stderr.join('')
          })
        );
        return;
      }

      const jsonPath = `${outputPrefix}.json`;
      fs.readJson(jsonPath).then((payload) => {
        resolve({ child, result: parseWhisperJson(payload as Record<string, unknown>) });
      }).catch((err: unknown) => {
        void writeLog(`whisper: readJson failed for ${jsonPath}: ${String(err)}`);
        reject(err);
      });
    });
  });
}

function parseWhisperJson(payload: Record<string, unknown>): WhisperChunkResult {
  const segments = Array.isArray(payload.transcription)
    ? payload.transcription
    : Array.isArray(payload.segments)
      ? payload.segments
      : [];

  let currentSpeakerIndex = 1;
  const normalized = segments.map((segment) => {
    const current = segment as Record<string, unknown>;
    const offsets =
      typeof current.offsets === 'object' && current.offsets !== null
        ? (current.offsets as Record<string, unknown>)
        : {};
    const explicitSpeaker = typeof current.speaker === 'string' ? current.speaker.trim() : '';
    const hasTurnChange = typeof current.speaker_turn_next === 'boolean' && current.speaker_turn_next;
    const speaker = explicitSpeaker || `LOCUTEUR ${currentSpeakerIndex}`;

    const normalizedSegment = {
      start: Number(offsets.from ?? current.t0 ?? current.start ?? 0) / 1000,
      end: Number(offsets.to ?? current.t1 ?? current.end ?? 0) / 1000,
      text: String(current.text ?? '').trim(),
      speaker,
      confidence: typeof current.confidence === 'number'
        ? current.confidence
        : typeof current.avg_logprob === 'number'
          ? Math.max(0, Math.min(1, Number(current.avg_logprob) + 1))
          : undefined
    };

    if (!explicitSpeaker && hasTurnChange) {
      currentSpeakerIndex = currentSpeakerIndex === 1 ? 2 : 1;
    }

    return normalizedSegment;
  });

  return {
    text: normalized.map((segment) => segment.text).join(' ').trim(),
    language: typeof payload.result_language === 'string'
      ? payload.result_language
      : typeof payload.language === 'string'
        ? payload.language
        : 'auto',
    segments: normalized
  };
}

export function readChunkOutputPath(tempDir: string, chunkIndex: number) {
  return path.join(tempDir, `chunk_${String(chunkIndex).padStart(3, '0')}`);
}
