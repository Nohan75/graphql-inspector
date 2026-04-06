import React, { useState } from 'react';
import type { GQLRequest, TabId } from '../types';
import { HeadersTab } from './HeadersTab';
import { QueryTab } from './QueryTab';
import { ResponseTab } from './ResponseTab';
import { RawTab } from './RawTab';

interface DetailPanelProps {
  request: GQLRequest | null;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'headers', label: 'Headers' },
  { id: 'request', label: 'Request' },
  { id: 'response', label: 'Response' },
  { id: 'raw', label: 'Raw' },
];

export function DetailPanel({ request }: DetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('request');

  if (!request) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '12px',
        }}
      >
        Select a request to inspect
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        backgroundColor: 'var(--color-bg)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-toolbar)',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
              color: activeTab === tab.id
                ? 'var(--color-text)'
                : 'var(--color-text-muted)',
              padding: '7px 14px',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'color 0.1s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'headers' && <HeadersTab request={request} />}
        {activeTab === 'request' && <QueryTab request={request} />}
        {activeTab === 'response' && <ResponseTab request={request} />}
        {activeTab === 'raw' && <RawTab request={request} />}
      </div>
    </div>
  );
}
