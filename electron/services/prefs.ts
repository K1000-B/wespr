import os from 'node:os';
import path from 'node:path';
import type { AppPrefs } from '../preload';
import { JsonStore } from './jsonStore';

export const prefsStore = new JsonStore<AppPrefs>('preferences', {
  defaultModelId: '',
  timestampGranularity: 'segment',
  exportDirectory: path.join(os.homedir(), 'Downloads'),
  keepRemoteMedia: false,
  remoteMediaDirectory: path.join(os.homedir(), 'Downloads', 'WeSpR'),
  keepVoiceAudio: false,
  defaultMicrophoneId: '',
  defaultVoiceMode: 'memo'
});
