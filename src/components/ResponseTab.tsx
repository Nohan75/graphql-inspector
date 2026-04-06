import React, { useState, useCallback, useRef } from 'react';
import type { GQLRequest } from '../types';
import { JsonTree } from './JsonTree';

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
        flexShrink: 0,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface ResponseTabProps {
  request: GQLRequest;
}

export function ResponseTab({ request }: ResponseTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleMatchesFound = useCallback((count: number) => {
    setMatchCount(count);
    setCurrentMatch((prev) => (count === 0 ? 0 : Math.min(prev, count - 1)));
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchCount === 0) return;
      if (e.shiftKey) {
        setCurrentMatch((prev) => (prev - 1 + matchCount) % matchCount);
      } else {
        setCurrentMatch((prev) => (prev + 1) % matchCount);
      }
    } else if (e.key === 'Escape') {
      setSearchTerm('');
      setMatchCount(0);
      setCurrentMatch(0);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setMatchCount(0);
    setCurrentMatch(0);
    inputRef.current?.focus();
  };

  if (request.response === null) {
    return (
      <div
        style={{
          padding: '12px',
          color: 'var(--color-text-muted)',
        }}
      >
        No response data
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar + Copy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-toolbar)',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentMatch(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search response… (Enter / Shift+Enter)"
          style={{
            flex: 1,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '3px',
            padding: '3px 8px',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {searchTerm && (
          <>
            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>
              {matchCount > 0
                ? `${currentMatch + 1} / ${matchCount}`
                : 'No matches'}
            </span>
            <button
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: '14px',
                lineHeight: 1,
              }}
              title="Clear search"
            >
              ×
            </button>
          </>
        )}
        <CopyButton text={JSON.stringify(request.response, null, 2)} />
      </div>

      {/* JSON tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        <JsonTree
          data={request.response}
          searchTerm={searchTerm}
          currentMatchIndex={currentMatch}
          onMatchesFound={handleMatchesFound}
        />
      </div>
    </div>
  );
}
