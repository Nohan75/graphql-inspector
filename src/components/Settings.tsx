import React, { useState } from 'react';
import type { Settings } from '../types';
import { SANDBOX_FORMATS, validateSandboxUrl, type SandboxFormat } from '../utils/sandbox';

interface SettingsProps {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: SettingsProps) {
  const [sandboxUrl, setSandboxUrl] = useState(settings.sandboxUrl);
  const [sandboxFormat, setSandboxFormat] = useState<SandboxFormat>(settings.sandboxFormat ?? 'auto');
  const [recordTrace, setRecordTrace] = useState(settings.recordTrace);
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = sandboxUrl.trim();
    if (!validateSandboxUrl(trimmed)) {
      setError('URL must start with http:// or https://');
      return;
    }
    setError('');
    onSave({ sandboxUrl: trimmed, sandboxFormat, recordTrace });
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

        <label className="block mt-3 mb-1.5 text-xs text-text-muted">
          URL Format
        </label>
        <select
          value={sandboxFormat}
          onChange={(e) => setSandboxFormat(e.target.value as SandboxFormat)}
          className="w-full bg-bg text-text border border-border rounded-[3px] px-[10px] py-1.5 text-xs outline-none font-mono cursor-pointer focus:border-accent"
        >
          {SANDBOX_FORMATS.map(({ id, label }) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <div className="mt-1 text-[11px] text-text-muted">
          Use <strong className="text-text">Apollo Playground</strong> if your sandbox is hosted on your own GraphQL endpoint
        </div>

        {/* A debugging aid, apart from the settings of the sandbox */}
        <div className="mt-4 pt-3 border-t border-border">
          <label className="flex items-center gap-1.5 text-xs text-text cursor-pointer select-none">
            <input
              type="checkbox"
              checked={recordTrace}
              onChange={(e) => setRecordTrace(e.target.checked)}
              className="cursor-pointer"
            />
            Record a trace
          </label>
          <div className="mt-1 text-[11px] text-text-muted">
            Keeps what the panel receives, to replay a defect. A trace holds queries, variables and
            responses: keep the file on this machine unless it was recorded on public APIs.
          </div>
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
