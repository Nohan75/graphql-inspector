import { useState, useEffect } from 'react';
import type { Settings } from '../types';

const STORAGE_KEY = 'gql_inspector_settings';

const defaultSettings: Settings = {
  sandboxUrl: 'https://studio.apollographql.com/sandbox/explorer',
  sandboxFormat: 'auto',
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (result[STORAGE_KEY]) {
        setSettings({ ...defaultSettings, ...result[STORAGE_KEY] });
      }
      setLoaded(true);
    });
  }, []);

  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    chrome.storage.local.set({ [STORAGE_KEY]: newSettings });
  };

  return { settings, saveSettings, loaded };
}
