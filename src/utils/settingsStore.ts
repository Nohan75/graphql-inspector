import type { Settings } from '../types';

/** Earlier versions stored the settings under this key: changing it loses them */
const STORAGE_KEY = 'gql_inspector_settings';

const defaultSettings: Settings = {
  sandboxUrl: 'https://studio.apollographql.com/sandbox/explorer',
  sandboxFormat: 'auto',
};

/** The part of chrome.storage.local the settings are kept in */
export interface SettingsStorage {
  get(keys: string[], callback: (items: Record<string, unknown>) => void): void;
  set(items: Record<string, unknown>): void;
}

/**
 * The settings of the panel, in one place for everything that reads them:
 * what one part of the panel saves, every other part gets.
 */
export interface SettingsStore {
  /**
   * The settings: the defaults until the stored ones have been read, then
   * what was last read or saved. The same object as long as they do not change.
   */
  get(): Settings;
  /** Saves the settings to storage and tells every listener */
  save(settings: Settings): void;
  /** Calls `listener` each time the settings change. Returns how to stop. */
  subscribe(listener: () => void): () => void;
}

export function createSettingsStore(storage: SettingsStorage): SettingsStore {
  let settings = defaultSettings;
  let saved = false;
  const listeners = new Set<() => void>();

  function publish(next: Settings) {
    settings = next;
    listeners.forEach((listener) => listener());
  }

  storage.get([STORAGE_KEY], (items) => {
    const stored = items[STORAGE_KEY];
    // A save made while storage was being read is newer than what it holds
    if (saved || typeof stored !== 'object' || stored === null) return;
    // Over the defaults: an earlier version stored fewer settings
    publish({ ...defaultSettings, ...stored });
  });

  return {
    get: () => settings,

    save(next) {
      saved = true;
      storage.set({ [STORAGE_KEY]: next });
      publish(next);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
