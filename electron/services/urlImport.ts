import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import axios from 'axios';
import { ensureBundledBinaries, getFileInfo, runCommand, runStreamingCommand, writeLog } from './ffmpeg';

export type UrlSourceKind = 'youtube' | 'm3u8';

export type UrlSourceInput = {
  url: string;
  sourceType: UrlSourceKind;
  referer?: string;
};

export type UrlPreview = {
  sourceType: UrlSourceKind;
  url: string;
  title: string;
  creator?: string;
  duration?: number;
  thumbnailUrl?: string;
  description?: string;
};

const SAFARI_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const YT_DLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';

export function getRemoteMediaDir() {
  return path.join(app.getPath('userData'), 'remote-media');
}

export async function resolveUrlPreview(input: UrlSourceInput): Promise<UrlPreview> {
  if (input.sourceType === 'youtube') {
    return resolveYoutubePreview(input.url);
  }

  return resolveM3u8Preview(input);
}

export async function downloadUrlAudio(
  input: UrlSourceInput,
  destinationDir: string,
  onProgress: (pct: number, message: string) => void
) {
  await fs.ensureDir(destinationDir);

  if (input.sourceType === 'youtube') {
    const preview = await resolveYoutubePreview(input.url);
    const outputTemplate = path.join(destinationDir, `${sanitizeFileName(preview.title || 'youtube-media')}.%(ext)s`);
    await runYtDlpDownload(input.url, outputTemplate, onProgress);
    const files = await fs.readdir(destinationDir);
    const latest = files
      .map((name) => path.join(destinationDir, name))
      .sort((left, right) => right.localeCompare(left))[0];

    if (!latest) {
      throw new Error('Aucun média audio n’a été produit à partir de cette URL.');
    }

    return {
      filePath: latest,
      label: preview.title,
      preview
    };
  }

  const preview = await resolveM3u8Preview(input);
    const targetPath = path.join(destinationDir, `${sanitizeFileName(preview.title)}.mp4`);
    await downloadM3u8Audio(input, targetPath, preview.duration ?? 0, onProgress);
  return {
    filePath: targetPath,
    label: preview.title,
    preview
  };
}

export async function getPathSize(targetPath: string): Promise<number> {
  if (!(await fs.pathExists(targetPath))) {
    return 0;
  }

  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    return stat.size;
  }

  const entries = await fs.readdir(targetPath);
  let total = 0;
  for (const entry of entries) {
    total += await getPathSize(path.join(targetPath, entry));
  }
  return total;
}

export async function clearDirectory(targetPath: string) {
  if (!(await fs.pathExists(targetPath))) {
    return { freed: 0 };
  }

  const freed = await getPathSize(targetPath);
  await fs.emptyDir(targetPath);
  return { freed };
}

async function resolveYoutubePreview(url: string): Promise<UrlPreview> {
  const ytDlp = await resolveYtDlpPath();
  const { stdout } = await runCommand(ytDlp, ['--dump-single-json', '--skip-download', '--no-warnings', url]);
  const payload = JSON.parse(stdout) as Record<string, unknown>;

  return {
    sourceType: 'youtube',
    url,
    title: String(payload.title ?? 'Vidéo YouTube'),
    creator: typeof payload.uploader === 'string' ? payload.uploader : undefined,
    duration: typeof payload.duration === 'number' ? payload.duration : Number(payload.duration ?? 0) || undefined,
    thumbnailUrl: typeof payload.thumbnail === 'string' ? payload.thumbnail : undefined,
    description: typeof payload.description === 'string' ? payload.description : undefined
  };
}

async function resolveM3u8Preview(input: UrlSourceInput): Promise<UrlPreview> {
  const binaries = await ensureBundledBinaries();
  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams'
  ];
  if (input.referer) {
    args.push('-headers', `Referer: ${input.referer}\r\nUser-Agent: ${SAFARI_USER_AGENT}\r\n`);
  } else {
    args.push('-user_agent', SAFARI_USER_AGENT);
  }
  args.push(input.url);

  const { stdout } = await runCommand(binaries.ffprobe, args);
  const payload = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string; tags?: Record<string, string> } };
  const title =
    payload.format?.tags?.title ||
    path.basename(new URL(input.url).pathname).replace(/\.m3u8$/i, '') ||
    'Flux distant';

  return {
    sourceType: 'm3u8',
    url: input.url,
    title,
    creator: payload.format?.format_name,
    duration: payload.format?.duration ? Number(payload.format.duration) : undefined
  };
}

async function runYtDlpDownload(
  url: string,
  outputTemplate: string,
  onProgress: (pct: number, message: string) => void
) {
  const ytDlp = await resolveYtDlpPath();
  await runStreamingCommand(
    ytDlp,
    [
      '-f',
      'bestaudio[acodec!=none]/bestaudio/best',
      '--newline',
      '--progress',
      '--no-warnings',
      '--no-playlist',
      '--output',
      outputTemplate,
      url
    ],
    (chunk) => {
      const line = chunk.trim();
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) {
        onProgress(Number(match[1]), 'Téléchargement de l’audio');
        return;
      }
      if (line) {
        onProgress(0, 'Téléchargement de l’audio');
      }
    }
  );
}

async function downloadM3u8Audio(
  input: UrlSourceInput,
  outputPath: string,
  duration: number,
  onProgress: (pct: number, message: string) => void
) {
  const binaries = await ensureBundledBinaries();
  const args = ['-y'];

  if (input.referer) {
    args.push('-headers', `Referer: ${input.referer}\r\nUser-Agent: ${SAFARI_USER_AGENT}\r\n`);
  } else {
    args.push('-user_agent', SAFARI_USER_AGENT);
  }

  args.push(
    '-i',
    input.url,
    '-map',
    '0:a:0',
    '-c:a',
    'copy',
    outputPath
  );

  await runStreamingCommand(binaries.ffmpeg, args, (stderr) => {
    const match = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
    if (!match || duration <= 0) {
      return;
    }
    const [, hh, mm, ss] = match;
    const seconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
    onProgress(Math.min((seconds / duration) * 100, 100), 'Téléchargement de l’audio');
  });

  const info = await getFileInfo(outputPath);
  onProgress(100, info.duration > 0 ? 'Téléchargement terminé' : 'Audio récupéré');
}

async function resolveYtDlpPath() {
  const binaries = await ensureBundledBinaries();
  const bundledPath = 'ytDlp' in binaries && typeof binaries.ytDlp === 'string'
    ? binaries.ytDlp
    : path.join(getRemoteMediaDir(), '..', 'bin', 'yt-dlp');

  try {
    await runCommand(bundledPath, ['--version']);
    return bundledPath;
  } catch {
    await downloadYtDlp(bundledPath);
    return bundledPath;
  }
}

async function downloadYtDlp(destinationPath: string) {
  await fs.ensureDir(path.dirname(destinationPath));
  await writeLog(`Téléchargement automatique de yt-dlp vers ${destinationPath}`);
  const response = await axios.get(YT_DLP_URL, {
    responseType: 'stream',
    validateStatus: (status) => status >= 200 && status < 400
  });

  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destinationPath, { mode: 0o755 });
    response.data.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', resolve);
    response.data.pipe(writer);
  });
  await fs.chmod(destinationPath, 0o755);
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || `wespr-${Date.now()}-${os.userInfo().username}`;
}
