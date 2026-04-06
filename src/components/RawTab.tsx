import React, { useState } from 'react';
import type { GQLRequest } from '../types';

interface RawTabProps {
  request: GQLRequest;
}

function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}

export function RawTab({ request }: RawTabProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 10px',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-toolbar)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
          Raw Response
        </span>
        <button
          onClick={() => copyToClipboard(request.responseRaw || '', setCopied)}
          style={{
            background: 'none',
            border: `1px solid ${copied ? '#4caf50' : 'var(--color-border)'}`,
            borderRadius: '3px',
            color: copied ? '#4caf50' : 'var(--color-text-muted)',
            fontSize: '10px',
            padding: '2px 8px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        <pre style={{
          margin: 0,
          fontFamily: "'Consolas', 'Courier New', monospace",
          fontSize: '12px',
          color: 'var(--color-text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          userSelect: 'text',
        }}>
          {request.responseRaw || '(empty)'}
        </pre>
      </div>
    </div>
  );
}
