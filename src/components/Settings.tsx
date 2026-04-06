import React, { useState } from 'react';
import type { Settings } from '../types';
import { validateSandboxUrl } from '../utils/sandbox';

interface SettingsProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsProps) {
  const [sandboxUrl, setSandboxUrl] = useState(settings.sandboxUrl);
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = sandboxUrl.trim();
    if (!validateSandboxUrl(trimmed)) {
      setError('URL must start with http:// or https://');
      return;
    }
    setError('');
    onSave({ sandboxUrl: trimmed });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter') handleSave();
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div
        className="bg-sidebar border border-border rounded-[6px] p-5 w-[420px] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <h2 className="m-0 mb-4 text-sm font-semibold text-text">
          Settings
        </h2>

        <label className="block mb-1.5 text-xs text-text-muted">
          Sandbox URL
        </label>
        <input
          autoFocus
          type="text"
          value={sandboxUrl}
          onChange={(e) => { setSandboxUrl(e.target.value); setError(''); }}
          placeholder="https://studio.apollographql.com/sandbox/explorer"
          className={`w-full bg-bg text-text rounded-[3px] px-[10px] py-1.5 text-xs outline-none font-mono border
            ${error ? 'border-error' : 'border-border'}`}
        />
        {error && (
          <div className="text-error text-[11px] mt-1">{error}</div>
        )}

        <div className="mt-2 text-[11px] text-text-muted">
          Used for "Open in Sandbox" button. Must be http:// or https://.
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="bg-transparent border border-border text-text rounded-[3px] px-[14px] py-[5px] text-xs cursor-pointer hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-accent border-0 text-white rounded-[3px] px-[14px] py-[5px] text-xs cursor-pointer hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
