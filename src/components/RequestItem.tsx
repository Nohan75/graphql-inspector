import React from 'react';
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

const BADGE_COLORS: Record<string, string> = {
  query: 'var(--color-badge-query)',
  mutation: 'var(--color-badge-mutation)',
  subscription: 'var(--color-badge-subscription)',
};

const BADGE_LABELS: Record<string, string> = {
  query: 'Q',
  mutation: 'M',
  subscription: 'S',
};

function statusColor(status: number): string {
  if (status >= 400) return 'var(--color-error)';
  if (status >= 200 && status < 300) return 'var(--color-success)';
  return 'var(--color-text-muted)';
}

export function RequestItem({
  request,
  isSelected,
  onClick,
  sandboxUrl,
}: RequestItemProps) {
  const badge = BADGE_LABELS[request.operationType] ?? 'Q';
  const badgeColor = BADGE_COLORS[request.operationType] ?? 'var(--color-badge-query)';

  const handleSandbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!validateSandboxUrl(sandboxUrl)) {
      alert('Invalid sandbox URL. Please check your settings.');
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 8px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: isSelected
          ? 'var(--color-selected)'
          : 'transparent',
        color: 'var(--color-text)',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            'var(--color-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            'transparent';
        }
      }}
    >
      {/* Type badge */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 3,
          fontSize: 10,
          fontWeight: 700,
          color: '#fff',
          backgroundColor: badgeColor,
          flexShrink: 0,
        }}
      >
        {badge}
      </span>

      {/* Name + URL */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {request.operationName}
        </div>
        <div
          style={{
            fontSize: '10px',
            color: 'var(--color-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {request.url}
        </div>
      </div>

      {/* Status */}
      <span
        style={{
          color: statusColor(request.status),
          fontSize: '11px',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {request.status}
      </span>

      {/* Sandbox button */}
      <button
        onClick={handleSandbox}
        title="Open in Sandbox"
        style={{
          background: 'none',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          borderRadius: '3px',
          padding: '1px 5px',
          fontSize: '10px',
          cursor: 'pointer',
          flexShrink: 0,
          lineHeight: '16px',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            'var(--color-text)';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            'var(--color-text-muted)';
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            'var(--color-border)';
        }}
      >
        ↗
      </button>
    </div>
  );
}
