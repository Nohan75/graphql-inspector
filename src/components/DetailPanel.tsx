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
      <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
        Select a request to inspect
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* Tab bar */}
      <div className="flex border-b border-border bg-toolbar shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`bg-transparent border-0 border-b-2 px-[14px] py-[7px] text-xs cursor-pointer transition-colors
              ${activeTab === tab.id
                ? 'border-b-accent text-text'
                : 'border-b-transparent text-text-muted hover:text-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'headers'  && <HeadersTab request={request} />}
        {activeTab === 'request'  && <QueryTab request={request} />}
        {activeTab === 'response' && <ResponseTab request={request} />}
        {activeTab === 'raw'      && <RawTab request={request} />}
      </div>
    </div>
  );
}
