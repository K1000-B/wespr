import fs from 'fs-extra';
import { getTempDir, writeLog } from './ffmpeg';

export async function cleanupJob(jobId: string, keepOnError = false) {
  const tempDir = getTempDir(jobId);
  if (keepOnError) {
    await writeLog(`Fichiers temporaires conservés pour diagnostic: ${tempDir}`);
    return;
  }
  await fs.remove(tempDir);
}

export async function clearTempCache() {
  const tmp = '/tmp';
  const entries = await fs.readdir(tmp);
  let freed = 0;
  for (const entry of entries) {
    if (!entry.startsWith('wespr-')) {
      continue;
    }
    const fullPath = `${tmp}/${entry}`;
    if (await fs.pathExists(fullPath)) {
      const stat = await fs.stat(fullPath);
      freed += stat.size;
      await fs.remove(fullPath);
    }
  }
  return { freed };
}

