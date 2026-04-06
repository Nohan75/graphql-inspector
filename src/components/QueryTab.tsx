import React, { useState } from 'react';
import type { GQLRequest } from '../types';
import { QueryEditor } from './QueryEditor';
import { JsonTree } from './JsonTree';
import { useSettings } from '../hooks/useSettings';
import { stripCommonIndent } from '../utils/graphql';
import { validateSandboxUrl, buildApolloSandboxUrl, buildGraphiQLUrl, openInSandbox } from '../utils/sandbox';

interface QueryTabProps {
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => copyToClipboard(text, setCopied)}
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
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--color-text-muted)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  padding: '5px 10px',
  borderBottom: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-toolbar)',
};

export function QueryTab({ request }: QueryTabProps) {
  const [showVariables, setShowVariables] = useState(true);
  const { settings } = useSettings();

  const normalizedQuery = stripCommonIndent(request.query.trimEnd());
  const sandboxReady = !!settings.sandboxUrl && validateSandboxUrl(settings.sandboxUrl);

  const handleOpenSandbox = () => {
    if (!sandboxReady) return;
    const url = settings.sandboxUrl.includes('apollographql')
      ? buildApolloSandboxUrl(settings.sandboxUrl, normalizedQuery, request.variables, request.url)
      : buildGraphiQLUrl(settings.sandboxUrl, normalizedQuery, request.variables);
    openInSandbox(url);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* ── Query ── */}
      <div>
        <div style={sectionHeaderStyle}>
          <span>Query</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handleOpenSandbox}
              disabled={!sandboxReady}
              title={sandboxReady ? 'Open in sandbox' : 'Configure a sandbox URL in Settings ⚙'}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: '3px',
                color: 'var(--color-accent)',
                fontSize: '10px',
                padding: '2px 8px',
                cursor: sandboxReady ? 'pointer' : 'not-allowed',
                opacity: sandboxReady ? 1 : 0.4,
              }}
            >
              Open in Sandbox ↗
            </button>
            <CopyButton text={normalizedQuery} />
          </div>
        </div>
        <div style={{ padding: '8px 0' }}>
          <QueryEditor query={request.query} />
        </div>
      </div>

      {/* ── Variables ── */}
      {request.variables !== null && (
        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '8px' }}>
          <div style={{ ...sectionHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowVariables((v) => !v)}
            >
              {showVariables ? '▼' : '▶'}
              Variables
            </span>
            <CopyButton text={JSON.stringify(request.variables, null, 2)} />
          </div>
          {showVariables && (
            <div style={{ padding: '8px 0' }}>
              <JsonTree data={request.variables} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
