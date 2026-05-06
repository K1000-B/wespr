import fs from 'fs-extra';
import path from 'node:path';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { ensureBundledBinaries } from './ffmpeg';

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

export function transcribeChunk(
  modelPath: string,
  chunkPath: string,
  outputPrefix: string,
  language: string,
  translateToEn: boolean,
  diarize: boolean,
  onProgressMessage: (message: string) => void
) {
  return new Promise<{ result: WhisperChunkResult; child: ChildProcessWithoutNullStreams }>(
    async (resolve, reject) => {
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

      const child = spawn(binaries.whisper, args);
      const stderr: string[] = [];

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

      child.on('error', reject);
      child.on('close', async (code) => {
        if (code !== 0) {
          reject(
            Object.assign(new Error('La transcription a échoué.'), {
              code,
              stderr: stderr.join('')
            })
          );
          return;
        }

        try {
          const jsonPath = `${outputPrefix}.json`;
          const payload = await fs.readJson(jsonPath);
          resolve({
            child,
            result: parseWhisperJson(payload)
          });
        } catch (error) {
          reject(error);
        }
      });
    }
  );
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
