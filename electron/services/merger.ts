import type { WhisperChunkResult, WhisperSegment } from './whisper';

export type TranscriptResult = {
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
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function dedupeSegments(previous: WhisperSegment[], current: WhisperSegment[]) {
  if (!previous.length || !current.length) {
    return current;
  }

  const previousTokens = tokenize(previous[previous.length - 1].text).slice(-3);
  const currentTokens = tokenize(current[0].text).slice(0, 3);

  if (
    previousTokens.length > 0 &&
    previousTokens.join(' ') === currentTokens.join(' ')
  ) {
    return current.slice(1);
  }

  return current;
}

export function mergeChunks(
  chunks: WhisperChunkResult[],
  duration: number,
  modelUsed: string,
  processingTime: number
): TranscriptResult {
  const merged: WhisperSegment[] = [];
  let language = 'auto';

  chunks.forEach((chunk, index) => {
    language = chunk.language || language;
    const offset = index * 53;
    const normalized = chunk.segments.map((segment) => ({
      ...segment,
      start: segment.start + offset,
      end: segment.end + offset
    }));

    const deduped = dedupeSegments(merged, normalized);
    merged.push(...deduped);
  });

  return {
    text: merged.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim(),
    segments: merged,
    language,
    duration,
    modelUsed,
    processingTime
  };
}

