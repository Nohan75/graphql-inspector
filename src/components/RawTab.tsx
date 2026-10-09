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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-[10px] py-[5px] border-b border-border bg-toolbar shrink-0">
        <span className="text-[11px] uppercase tracking-wider text-text-muted">
          Raw Response
        </span>
        <button
          onClick={() => copyToClipboard(request.responseRaw || '', setCopied)}
          className={`bg-transparent rounded-[3px] text-[10px] px-2 py-[2px] cursor-pointer border
            ${copied
              ? 'border-success text-success'
              : 'border-border text-text-muted hover:text-text hover:border-accent'
            }`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <pre className="m-0 code-font whitespace-pre-wrap break-all select-text">
          {request.responseRaw || '(empty)'}
        </pre>
      </div>
    </div>
  );
}
