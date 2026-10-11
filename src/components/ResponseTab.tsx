import React, { useState, useCallback, useRef } from 'react';
import type { GQLRequest } from '../types';
import { JsonTree, type JsonTreeHandle } from './JsonTree';

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

const FOLD_BUTTON =
  'inline-flex items-center justify-center bg-transparent border border-border text-text-muted rounded-[3px] px-[5px] py-[3px] cursor-pointer shrink-0 hover:text-text hover:border-accent';

/** Two chevrons that meet, to collapse; two that part, to expand */
function FoldIcon({ collapse = false }: { collapse?: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {collapse ? (
        <>
          <path d="M4.5 2.5 8 6l3.5-3.5" />
          <path d="M4.5 13.5 8 10l3.5 3.5" />
        </>
      ) : (
        <>
          <path d="M4.5 6 8 2.5 11.5 6" />
          <path d="M4.5 10 8 13.5l3.5-3.5" />
        </>
      )}
    </svg>
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
  const treeRef = useRef<JsonTreeHandle>(null);

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
      {/* Wraps on a narrow panel: the buttons go under the search field */}
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-border bg-toolbar shrink-0">
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
          className="flex-1 min-w-[100px] bg-bg text-text border border-border rounded-[3px] px-2 py-[3px] text-xs outline-none"
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
        {/* One group: the buttons stay together when the toolbar wraps */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => treeRef.current?.collapseAll()}
            title="Collapse all"
            aria-label="Collapse all"
            className={FOLD_BUTTON}
          >
            <FoldIcon collapse />
          </button>
          <button
            onClick={() => treeRef.current?.expandAll()}
            title="Expand all"
            aria-label="Expand all"
            className={FOLD_BUTTON}
          >
            <FoldIcon />
          </button>
          <CopyButton text={JSON.stringify(request.response, null, 2)} />
        </div>
      </div>

      {/* JSON tree */}
      <div className="flex-1 overflow-y-auto py-2">
        <JsonTree
          ref={treeRef}
          data={request.response}
          searchTerm={searchTerm}
          currentMatchIndex={currentMatch}
          onMatchesFound={handleMatchesFound}
        />
      </div>
    </div>
  );
}
