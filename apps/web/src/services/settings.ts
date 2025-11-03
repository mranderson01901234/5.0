import { handleApiError } from '@/utils/handleApiError';
import { log } from '@/utils/logger';

export type Settings = {
  theme: 'dark' | 'light';
  notifications: boolean;
  language: string;
};

const MOCK_DELAY = 300;

export async function getSettings(): Promise<Settings> {
  try {
    // Replace with actual API call once backend verified
    await new Promise((r) => setTimeout(r, MOCK_DELAY));
    return { theme: 'dark', notifications: true, language: 'en' };
  } catch (err) {
    handleApiError(err, { action: 'loading settings' });
  }
}

export async function saveSettings(data: Settings): Promise<Settings> {
  try {
    await new Promise((r) => setTimeout(r, MOCK_DELAY));
    log.info('Settings saved', data);
    return data;
  } catch (err) {
    handleApiError(err, { action: 'saving settings' });
  }
}

