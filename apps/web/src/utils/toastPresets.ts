import { notify } from './toast';

export const ToastPresets = {
  settingsSaved: () => notify.success('Settings saved'),
  settingsError: (m?: string) => notify.error('Settings failed', m),
  deleted: (what = 'Item') => notify.success(`${what} deleted`),
  apiError: (m?: string) => notify.error('Request failed', m),
} as const;

