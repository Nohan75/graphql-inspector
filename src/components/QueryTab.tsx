import React, { useState } from 'react';
import type { GQLRequest } from '../types';
import { QueryEditor } from './QueryEditor';
import { JsonTree } from './JsonTree';

interface QueryTabProps {
  request: GQLRequest;
}

export function QueryTab({ request }: QueryTabProps) {
  const [showVariables, setShowVariables] = useState(true);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* Query section */}
      <div>
        <div
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '6px 12px',
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-toolbar)',
          }}
        >
          Query
        </div>
        <div style={{ padding: '8px 0' }}>
          <QueryEditor query={request.query} />
        </div>
      </div>

      {/* Variables section */}
      {request.variables !== null && (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '6px 12px',
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-toolbar)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setShowVariables((v) => !v)}
          >
            <span style={{ marginRight: 6 }}>
              {showVariables ? '▼' : '▶'}
            </span>
            Variables
          </div>
          {showVariables && (
            <div style={{ padding: '8px 0' }}>
              <JsonTree data={request.variables} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
