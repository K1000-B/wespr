import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

export type FileInfo = {
  name: string;
  path: string;
  size: number;
  duration: number;
  format: string;
  sampleRate?: number;
};

export type ProgressCallback = (pct: number, message?: string) => void;

export function getLogDir() {
  return path.join(app.getPath('home'), 'Library', 'Logs', 'WeSpR');
}

export function getLogPath() {
  return path.join(getLogDir(), 'wespr.log');
}

export async function writeLog(message: string) {
  await fs.ensureDir(getLogDir());
  await rotateLogIfNeeded();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(getLogPath(), line, 'utf8');
}

async function rotateLogIfNeeded() {
  const logPath = getLogPath();
  if (!(await fs.pathExists(logPath))) {
    return;
  }
  const stat = await fs.stat(logPath);
  if (stat.size < 10 * 1024 * 1024) {
    return;
  }
  await fs.move(logPath, `${logPath}.1`, { overwrite: true });
}

export async function ensureBundledBinaries() {
  const binDir = path.join(app.getPath('userData'), 'bin');
  const sourceDir = app.isPackaged
    ? path.join(process.resourcesPath, 'binaries')
    : path.join(app.getAppPath(), 'resources', 'binaries');

  await fs.ensureDir(binDir);

  const whisperBinaryName = resolveWhisperBinaryName();
  const candidates = ['ffmpeg', 'ffprobe', whisperBinaryName, 'whisper-cli', whisperBinaryName === 'whisper-cli-arm64' ? 'whisper-cli-x64' : 'whisper-cli-arm64', 'yt-dlp'];
  for (const file of candidates) {
    const from = path.join(sourceDir, file);
    if (await fs.pathExists(from)) {
      const to = path.join(binDir, file);
      if (!(await fs.pathExists(to))) {
        await fs.copy(from, to);
        await fs.chmod(to, 0o755);
      }
    }
  }

  const devOverrides = !app.isPackaged
    ? await resolveDevBinaries({
        ffmpeg: process.env.WESPR_FFMPEG_PATH,
        ffprobe: process.env.WESPR_FFPROBE_PATH,
        whisper: process.env.WESPR_WHISPER_PATH
      })
    : null;

  return {
    ffmpeg: devOverrides?.ffmpeg || path.join(binDir, 'ffmpeg'),
    ffprobe: devOverrides?.ffprobe || path.join(binDir, 'ffprobe'),
    whisper: devOverrides?.whisper || path.join(binDir, whisperBinaryName),
    ytDlp: path.join(binDir, 'yt-dlp')
  };
}

export function getTempDir(jobId: string) {
  return path.join(os.tmpdir(), `wespr-${jobId}`);
}

export async function ensureTempDir(jobId: string) {
  const dir = getTempDir(jobId);
  await fs.ensureDir(dir);
  return dir;
}

export async function getFileInfo(filePath: string): Promise<FileInfo> {
  const binaries = await ensureBundledBinaries();
  const stat = await fs.stat(filePath);

  const probe = await runCommand(binaries.ffprobe, [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    filePath
  ]);

  const parsed = JSON.parse(probe.stdout) as {
    format?: { format_name?: string; duration?: string };
    streams?: Array<{ codec_type?: string; sample_rate?: string }>;
  };

  const audioStream = parsed.streams?.find((stream) => stream.codec_type === 'audio');

  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    duration: Number(parsed.format?.duration ?? 0),
    format: parsed.format?.format_name ?? path.extname(filePath).slice(1),
    sampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : undefined
  };
}

export async function convertToMonoWav(
  inputPath: string,
  outputPath: string,
  duration: number,
  onProgress: ProgressCallback
) {
  const binaries = await ensureBundledBinaries();
  await runStreamingCommand(
    binaries.ffmpeg,
    ['-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
    (stderr) => {
      const match = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
      if (!match || duration <= 0) {
        return;
      }
      const [, hh, mm, ss] = match;
      const seconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
      onProgress(Math.min((seconds / duration) * 100, 100), 'Audio extrait');
    }
  );
}

export async function runCommand(command: string, args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(new Error(`Commande en échec: ${command}`), {
          code,
          stderr: stderr.join('')
        })
      );
    });
  });

  return {
    stdout: stdout.join(''),
    stderr: stderr.join('')
  };
}

export async function runStreamingCommand(
  command: string,
  args: string[],
  onStderr?: (chunk: string) => void
) {
  const stderr: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    child.stderr.on('data', (chunk) => {
      const value = chunk.toString();
      stderr.push(value);
      onStderr?.(value);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        Object.assign(new Error(`Commande en échec: ${command}`), {
          code,
          stderr: stderr.join('')
        })
      );
    });
  });
}

async function resolveDevBinaries(explicit: {
  ffmpeg?: string;
  ffprobe?: string;
  whisper?: string;
}) {
  const ffmpeg = await resolveExecutable(
    explicit.ffmpeg,
    'ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg'
  );
  const ffprobe = await resolveExecutable(
    explicit.ffprobe,
    ...(ffmpeg ? [path.join(path.dirname(ffmpeg), 'ffprobe')] : []),
    'ffprobe',
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe'
  );
  const whisper = await resolveWhisperExecutable(explicit.whisper);

  return {
    ffmpeg: ffmpeg ?? undefined,
    ffprobe: ffprobe ?? undefined,
    whisper: whisper ?? undefined
  };
}

async function resolveExecutable(
  explicitPath: string | undefined,
  ...candidates: string[]
) {
  const explicitCandidate = explicitPath
    ? await resolvePathOrDirectory(explicitPath, [])
    : null;
  if (explicitCandidate) {
    return explicitCandidate;
  }

  for (const candidate of candidates) {
    const resolved = await resolvePathOrDirectory(candidate, []);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function resolveWhisperExecutable(explicitPath: string | undefined) {
  const commonDirs = [
    '/Users/camile/Dev/ai/whisper-cpp',
    path.join(os.homedir(), 'Dev', 'ai', 'whisper-cpp')
  ];

  const explicitCandidate = explicitPath
    ? await resolvePathOrDirectory(explicitPath, whisperRelativeCandidates())
    : null;
  if (explicitCandidate) {
    return explicitCandidate;
  }

  for (const directory of commonDirs) {
    const resolved = await resolvePathOrDirectory(directory, whisperRelativeCandidates());
    if (resolved) {
      return resolved;
    }
  }

  return resolveExecutable(
    undefined,
    resolveWhisperBinaryName(),
    'whisper-cli',
    'main',
    'whisper',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli'
  );
}

function whisperRelativeCandidates() {
  const archName = resolveWhisperBinaryName();
  return [
    `build/bin/${archName}`,
    'build/bin/whisper-cli',
    'build/bin/main',
    archName,
    'whisper-cli',
    'main'
  ];
}

function resolveWhisperBinaryName() {
  return process.arch === 'arm64' ? 'whisper-cli-arm64' : 'whisper-cli-x64';
}

async function resolvePathOrDirectory(
  candidate: string,
  relativeExecutables: string[]
) {
  if (!candidate) {
    return null;
  }

  if (!candidate.includes('/')) {
    return (await isUsablePath(candidate)) ? candidate : null;
  }

  if (await isDirectory(candidate)) {
    for (const relative of relativeExecutables) {
      const nested = path.join(candidate, relative);
      if (await isUsablePath(nested)) {
        return nested;
      }
    }

    return null;
  }

  if (await isUsablePath(candidate)) {
    return candidate;
  }

  return null;
}

async function isUsablePath(filePath: string) {
  if (!filePath.includes('/')) {
    try {
      await runCommand('which', [filePath]);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
