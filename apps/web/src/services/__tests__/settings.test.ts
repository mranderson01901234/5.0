import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import * as settingsSvc from '@/services/settings';

// Mock the service functions
vi.mock('@/services/settings', async () => {
  const actual = await vi.importActual<typeof import('@/services/settings')>('@/services/settings');
  return {
    ...actual,
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
  };
});

const mockGetSettings = vi.mocked(settingsSvc.getSettings);
const mockSaveSettings = vi.mocked(settingsSvc.saveSettings);

describe('Settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('load settings', async () => {
    const mockSettings = {
      theme: 'dark' as const,
      notifications: true,
      language: 'en',
    };

    mockGetSettings.mockResolvedValue(mockSettings);

    let result;
    await act(async () => {
      result = await settingsSvc.getSettings();
    });

    expect(result).toEqual(mockSettings);
    expect(mockGetSettings).toHaveBeenCalledOnce();
  });

  test('save settings', async () => {
    const settingsToSave = {
      theme: 'light' as const,
      notifications: false,
      language: 'fr',
    };

    mockSaveSettings.mockImplementation(async (d) => d);

    let result;
    await act(async () => {
      result = await settingsSvc.saveSettings(settingsToSave);
    });

    expect(result).toEqual(settingsToSave);
    expect(mockSaveSettings).toHaveBeenCalledWith(settingsToSave);
  });
});

