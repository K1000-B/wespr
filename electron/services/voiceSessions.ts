import fs from 'fs-extra';
import path from 'node:path';
import { app } from 'electron';
import type { TranscriptResult } from '../preload';
import { JsonStore } from './jsonStore';
import { getPathSize, clearDirectory } from './urlImport';

export type VoiceMode = 'memo' | 'live';

export type VoiceSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  duration: number;
  wordCount: number;
  mode: VoiceMode;
  transcriptPath: string;
  audioPath?: string;
  previewText: string;
};

export type VoiceSessionDetail = {
  session: VoiceSessionSummary;
  transcript: TranscriptResult;
};

const voiceStore = new JsonStore<{ sessions: VoiceSessionSummary[] }>('voice-sessions', {
  sessions: []
});

export function getVoiceSessionsDir() {
  return path.join(app.getPath('userData'), 'voice-sessions');
}

export function getVoiceAudioDir() {
  return path.join(getVoiceSessionsDir(), 'audio');
}

export function getVoiceTranscriptDir() {
  return path.join(getVoiceSessionsDir(), 'transcripts');
}

export async function listVoiceSessions() {
  const payload = await voiceStore.getAll();
  return [...payload.sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getVoiceSession(sessionId: string): Promise<VoiceSessionDetail> {
  const sessions = await listVoiceSessions();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new Error('Session vocale introuvable.');
  }

  const transcript = await fs.readJson(session.transcriptPath) as TranscriptResult;
  return { session, transcript };
}

export async function saveVoiceSession(input: {
  id: string;
  title: string;
  mode: VoiceMode;
  audioPath?: string;
  transcript: TranscriptResult;
}) {
  await fs.ensureDir(getVoiceTranscriptDir());

  const transcriptPath = path.join(getVoiceTranscriptDir(), `${input.id}.json`);
  await fs.writeJson(transcriptPath, input.transcript, { spaces: 2 });

  const text = input.transcript.text.trim();
  const session: VoiceSessionSummary = {
    id: input.id,
    title: input.title,
    createdAt: new Date().toISOString(),
    duration: input.transcript.duration,
    wordCount: text.length > 0 ? text.split(/\s+/).length : 0,
    mode: input.mode,
    transcriptPath,
    audioPath: input.audioPath,
    previewText: text.slice(0, 200)
  };

  const current = await voiceStore.getAll();
  const nextSessions = [session, ...current.sessions.filter((entry) => entry.id !== input.id)];
  await voiceStore.set({ sessions: nextSessions });

  return {
    session,
    transcript: input.transcript
  };
}

export async function deleteVoiceSession(sessionId: string) {
  const current = await voiceStore.getAll();
  const session = current.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  if (session.audioPath) {
    await fs.remove(session.audioPath);
  }
  await fs.remove(session.transcriptPath);
  await voiceStore.set({
    sessions: current.sessions.filter((entry) => entry.id !== sessionId)
  });
}

export async function purgeVoiceAudio() {
  return clearDirectory(getVoiceAudioDir());
}

export async function getVoiceAudioSize() {
  return getPathSize(getVoiceAudioDir());
}
