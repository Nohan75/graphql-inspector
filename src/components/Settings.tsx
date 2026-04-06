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
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal */}
      <div
        style={{
          background: 'var(--color-sidebar)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '20px',
          width: '420px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onKeyDown={handleKeyDown}
      >
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          Settings
        </h2>

        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}
        >
          Sandbox URL
        </label>
        <input
          autoFocus
          type="text"
          value={sandboxUrl}
          onChange={(e) => { setSandboxUrl(e.target.value); setError(''); }}
          placeholder="https://studio.apollographql.com/sandbox/explorer"
          style={{
            width: '100%',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-border)'}`,
            borderRadius: '3px',
            padding: '6px 10px',
            fontSize: '12px',
            outline: 'none',
            fontFamily: "'Consolas', monospace",
          }}
        />
        {error && (
          <div
            style={{
              color: 'var(--color-error)',
              fontSize: '11px',
              marginTop: '4px',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: '8px',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
          }}
        >
          Used for "Open in Sandbox" button. Must be http:// or https://.
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '20px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              borderRadius: '3px',
              padding: '5px 14px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: 'var(--color-accent)',
              border: 'none',
              color: '#fff',
              borderRadius: '3px',
              padding: '5px 14px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
