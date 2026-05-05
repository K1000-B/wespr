import fs from 'fs-extra';
import path from 'node:path';
import { ensureBundledBinaries, runStreamingCommand } from './ffmpeg';

export async function segmentAudio(
  wavPath: string,
  tempDir: string,
  onSegmented: (total: number) => void
) {
  const binaries = await ensureBundledBinaries();
  const pattern = path.join(tempDir, 'chunk_%03d.wav');

  await runStreamingCommand(binaries.ffmpeg, [
    '-i',
    wavPath,
    '-f',
    'segment',
    '-segment_time',
    '55',
    '-segment_time_delta',
    '0.05',
    '-c',
    'copy',
    pattern
  ]);

  const chunks = (await fs.readdir(tempDir))
    .filter((file) => file.startsWith('chunk_') && file.endsWith('.wav'))
    .sort()
    .map((file) => path.join(tempDir, file));

  onSegmented(chunks.length);
  return chunks;
}

