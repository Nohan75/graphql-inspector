import React, { useState, useMemo } from 'react';
import type { GQLRequest } from '../types';
import { QueryEditor } from './QueryEditor';
import { JsonTree } from './JsonTree';
import { useSettings } from '../hooks/useSettings';
import { parseQueryDocument, type Subquery } from '../utils/queryDocument';
import { validateSandboxUrl, buildApolloSandboxUrl, buildApolloPlaygroundUrl, buildGraphiQLUrl, openInSandbox } from '../utils/sandbox';

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
      className={`bg-transparent rounded-[3px] text-[10px] px-2 py-[2px] cursor-pointer border
        ${copied
          ? 'border-success text-success'
          : 'border-border text-text-muted hover:text-text hover:border-accent'
        }`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function QueryTab({ request }: QueryTabProps) {
  const [showVariables, setShowVariables] = useState(true);
  const { settings } = useSettings();

  const normalizedQuery = useMemo(
    () => parseQueryDocument(request.query).text,
    [request.query]
  );

  const sandboxReady = !!settings.sandboxUrl && validateSandboxUrl(settings.sandboxUrl);

  function buildSandboxUrl(query: string, variables: Record<string, unknown> | null): string {
    const fmt = settings.sandboxFormat ?? 'auto';
    const isAutoApollo = settings.sandboxUrl.includes('apollographql') || settings.sandboxUrl.includes('apollo.dev');
    if (fmt === 'apollo' || (fmt === 'auto' && isAutoApollo)) {
      return buildApolloSandboxUrl(settings.sandboxUrl, query, variables, request.url);
    } else if (fmt === 'apollo-no-endpoint') {
      return buildApolloPlaygroundUrl(settings.sandboxUrl, query, variables);
    } else {
      return buildGraphiQLUrl(settings.sandboxUrl, query, variables);
    }
  }

  const handleOpenSandbox = () => {
    if (!sandboxReady) return;
    openInSandbox(buildSandboxUrl(normalizedQuery, request.variables));
  };

  const handleOpenLine = (subquery: Subquery) => {
    if (!sandboxReady) return;
    // Only the values the sub-query declares: the others would be noise in the
    // sandbox, and have no reason to travel in its URL.
    const used = Object.entries(request.variables ?? {}).filter(([name]) =>
      subquery.variableNames.includes(name)
    );
    const variables = used.length > 0 ? Object.fromEntries(used) : null;
    openInSandbox(buildSandboxUrl(subquery.text, variables));
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">

      {/* ── Query ── */}
      <div>
        <div className="flex items-center justify-between text-text-muted text-[11px] uppercase tracking-wider px-[10px] py-[5px] border-b border-border bg-toolbar">
          <span>Query</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleOpenSandbox}
              disabled={!sandboxReady}
              title={sandboxReady ? 'Open in sandbox' : 'Configure a sandbox URL in Settings ⚙'}
              className={`bg-transparent border border-border rounded-[3px] text-accent text-[10px] px-2 py-[2px]
                ${sandboxReady ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
            >
              Open in Sandbox ↗
            </button>
            <CopyButton text={normalizedQuery} />
          </div>
        </div>
        <div className="py-2">
          <QueryEditor query={request.query} onOpenLine={sandboxReady ? handleOpenLine : undefined} />
        </div>
      </div>

      {/* ── Variables ── */}
      {request.variables !== null && (
        <div className="border-t border-border mt-2">
          <div className="flex items-center justify-between text-text-muted text-[11px] uppercase tracking-wider px-[10px] py-[5px] border-b border-border bg-toolbar cursor-pointer select-none">
            <span
              className="flex items-center gap-1.5"
              onClick={() => setShowVariables((v) => !v)}
            >
              {showVariables ? '▼' : '▶'}
              Variables
            </span>
            <CopyButton text={JSON.stringify(request.variables, null, 2)} />
          </div>
          {showVariables && (
            <div className="py-2">
              <JsonTree data={request.variables} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
