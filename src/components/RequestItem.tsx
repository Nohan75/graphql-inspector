import React, { useState } from 'react';
import type { GQLRequest, Settings } from '../types';
import { openInSandbox } from '../utils/sandbox';
import { graphqlErrors } from '../utils/graphql';

interface RequestItemProps {
  request: GQLRequest;
  isSelected: boolean;
  onClick: () => void;
  settings: Settings;
  /** 'A' = first in compare pair (red), 'B' = second (green), undefined = not selected */
  comparePosition?: 'A' | 'B';
  onCompareToggle: (e: React.MouseEvent) => void;
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

/** How many messages the tooltip of a row spells out */
const MAX_MESSAGES = 5;

/** What the tooltip says of the GraphQL errors of a response */
function errorsTitle(errors: string[]): string {
  const more = errors.length - MAX_MESSAGES;
  return [
    `${errors.length} GraphQL error${errors.length > 1 ? 's' : ''}`,
    ...errors.slice(0, MAX_MESSAGES).map((message) => `• ${message}`),
    ...(more > 0 ? [`… and ${more} more`] : []),
  ].join('\n');
}

export function RequestItem({
  request,
  isSelected,
  onClick,
  settings,
  comparePosition,
  onCompareToggle,
}: RequestItemProps) {
  const [sandboxError, setSandboxError] = useState(false);
  // A server usually answers 200 when an operation fails: the status alone
  // would show a failed request as a success.
  const errors = graphqlErrors(request.response);
  const badge = request.operationType === 'mutation' ? 'M'
    : request.operationType === 'subscription' ? 'S' : 'Q';
  const badgeBg = BADGE_BG[request.operationType] ?? 'bg-badge-query';

  const handleSandbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!openInSandbox(settings, request)) {
      setSandboxError(true);
      setTimeout(() => setSandboxError(false), 3000);
    }
  };

  return (
    <div
      onClick={onClick}
      aria-current={isSelected ? 'true' : undefined}
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
      ) : request.timedOut ? (
        <span
          title="No response was captured for this request"
          className="text-[11px] font-medium shrink-0 text-text-muted"
        >
          —
        </span>
      ) : errors.length > 0 ? (
        <>
          <span
            title={errorsTitle(errors)}
            aria-label={`${errors.length} GraphQL error${errors.length > 1 ? 's' : ''}`}
            className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full bg-error text-white text-[9px] font-bold leading-none shrink-0"
          >
            {errors.length}
          </span>
          <span title={errorsTitle(errors)} className="text-[11px] font-medium shrink-0 text-error">
            {request.status}
          </span>
        </>
      ) : (
        <span className={`text-[11px] font-medium shrink-0 ${statusClass(request.status)}`}>
          {request.status}
        </span>
      )}

      {/* Compare toggle button */}
      <button
        onClick={onCompareToggle}
        title={comparePosition ? `In compare (${comparePosition}) — click to remove` : 'Add to compare'}
        className={`bg-transparent border rounded-[3px] px-[5px] py-[1px] text-[10px] cursor-pointer shrink-0 leading-4 font-bold
          ${comparePosition === 'A'
            ? 'border-error text-error'
            : comparePosition === 'B'
              ? 'border-success text-success'
              : 'border-border text-text-muted hover:text-text hover:border-accent'
          }`}
      >
        {comparePosition ?? '⊕'}
      </button>

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
