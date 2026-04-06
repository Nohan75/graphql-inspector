import React from 'react';
import type { GQLRequest } from '../types';

interface RawTabProps {
  request: GQLRequest;
}

export function RawTab({ request }: RawTabProps) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 12px' }}>
      <pre
        style={{
          margin: 0,
          fontFamily: "'Consolas', 'Courier New', monospace",
          fontSize: '12px',
          color: 'var(--color-text)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          userSelect: 'text',
        }}
      >
        {request.responseRaw || '(empty)'}
      </pre>
    </div>
  );
}
