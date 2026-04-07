import React, { useState } from 'react';
import type { GQLRequest } from '../types';
import { buildApolloSandboxUrl, buildGraphiQLUrl, openInSandbox, validateSandboxUrl } from '../utils/sandbox';
import { parse, print } from 'graphql';
import { stripCommonIndent } from '../utils/graphql';

interface RequestItemProps {
  request: GQLRequest;
  isSelected: boolean;
  onClick: () => void;
  sandboxUrl: string;
}

const BADGE_BG: Record<string, string> = {
  query: 'bg-badge-query',
  mutation: 'bg-badge-mutation',
  subscription: 'bg-badge-subscription',
};

function statusClass(status: number): string {
  if (status >= 400) return 'text-error';
  if (status >= 200 && status < 300) return 'text-success';
  return 'text-text-muted';
}

export function RequestItem({
  request,
  isSelected,
  onClick,
  sandboxUrl,
}: RequestItemProps) {
  const [sandboxError, setSandboxError] = useState(false);
  const badge = request.operationType === 'mutation' ? 'M'
    : request.operationType === 'subscription' ? 'S' : 'Q';
  const badgeBg = BADGE_BG[request.operationType] ?? 'bg-badge-query';

  const handleSandbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!validateSandboxUrl(sandboxUrl)) {
      setSandboxError(true);
      setTimeout(() => setSandboxError(false), 3000);
      return;
    }
    let normalizedQuery: string;
    try {
      normalizedQuery = print(parse(request.query));
    } catch {
      normalizedQuery = stripCommonIndent(request.query.trim());
    }
    const isApollo = sandboxUrl.includes('apollographql') || sandboxUrl.includes('apollo.dev');
    const url = isApollo
      ? buildApolloSandboxUrl(sandboxUrl, normalizedQuery, request.variables, request.url)
      : buildGraphiQLUrl(sandboxUrl, normalizedQuery, request.variables);
    openInSandbox(url);
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-[5px] cursor-pointer border-b border-border text-text select-none
        ${isSelected ? 'bg-selected' : 'bg-transparent hover:bg-hover'}`}
    >
      {/* Type badge */}
      <span
        className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-[3px] text-[10px] font-bold text-white shrink-0 ${badgeBg}`}
      >
        {badge}
      </span>

      {/* Name + URL */}
      <div className="flex-1 min-w-0">
        <div className="font-medium overflow-hidden text-ellipsis whitespace-nowrap">
          {request.operationName}
        </div>
        <div className="text-[10px] text-text-muted overflow-hidden text-ellipsis whitespace-nowrap">
          {request.url}
        </div>
      </div>

      {/* Status / pending indicator */}
      {request.pending ? (
        <span className="text-[11px] font-medium shrink-0 text-text-muted animate-pulse">
          ●●●
        </span>
      ) : (
        <span className={`text-[11px] font-medium shrink-0 ${statusClass(request.status)}`}>
          {request.status}
        </span>
      )}

      {/* Sandbox button or inline error */}
      {sandboxError ? (
        <span className="text-error text-[10px] shrink-0 whitespace-nowrap">
          Invalid URL
        </span>
      ) : (
        <button
          onClick={handleSandbox}
          title="Open in Sandbox"
          className="bg-transparent border border-border text-text-muted rounded-[3px] px-[5px] py-[1px] text-[10px] cursor-pointer shrink-0 leading-4 hover:text-text hover:border-accent"
        >
          ↗
        </button>
      )}
    </div>
  );
}
