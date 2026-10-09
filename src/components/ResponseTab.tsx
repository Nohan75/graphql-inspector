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
      className={`bg-transparent rounded-[3px] text-[10px] px-2 py-[2px] cursor-pointer border shrink-0
        ${copied
          ? 'border-success text-success'
          : 'border-border text-text-muted hover:text-text hover:border-accent'
        }`}
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
      <div className="p-3 text-text-muted">
        No response data
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search bar + Copy */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-toolbar shrink-0">
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
          className="flex-1 bg-bg text-text border border-border rounded-[3px] px-2 py-[3px] text-xs outline-none"
        />
        {searchTerm && (
          <>
            <span className="text-text-muted text-[11px] whitespace-nowrap">
              {matchCount > 0
                ? `${currentMatch + 1} / ${matchCount}`
                : 'No matches'}
            </span>
            <button
              onClick={handleClear}
              className="bg-transparent border-0 text-text-muted cursor-pointer px-1 text-sm leading-none"
              title="Clear search"
            >
              ×
            </button>
          </>
        )}
        <CopyButton text={JSON.stringify(request.response, null, 2)} />
      </div>

      {/* JSON tree */}
      <div className="flex-1 overflow-y-auto py-2">
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
