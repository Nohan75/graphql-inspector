import { useSyncExternalStore } from 'react';
import { createSettingsStore, type SettingsStore } from '../utils/settingsStore';

let store: SettingsStore | undefined;

/**
 * One store for the whole panel, so that every component reads the same
 * settings. Created on first use: `chrome` is not there yet when the panel
 * preview loads this file.
 */
const panelSettings = () => (store ??= createSettingsStore(chrome.storage.local));

export function useSettings() {
  const { get, save, subscribe } = panelSettings();
  const settings = useSyncExternalStore(subscribe, get);
  return { settings, saveSettings: save };
}
