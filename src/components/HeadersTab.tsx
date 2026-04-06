import React from 'react';
import type { GQLRequest } from '../types';

interface HeadersTabProps {
  request: GQLRequest;
}

interface HeaderTableProps {
  title: string;
  headers: Array<{ name: string; value: string }>;
}

function HeaderTable({ title, headers }: HeaderTableProps) {
  return (
    <div className="mb-4">
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
        {title}
      </div>
      {headers.length === 0 ? (
        <div style={{ padding: '8px 12px', color: 'var(--color-text-muted)' }}>
          No headers
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {headers.map((h, i) => (
              <tr
                key={i}
                style={{
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <td
                  style={{
                    padding: '4px 12px',
                    color: 'var(--color-syn-field)',
                    fontFamily: "'Consolas', monospace",
                    fontSize: '12px',
                    width: '40%',
                    verticalAlign: 'top',
                    userSelect: 'text',
                  }}
                >
                  {h.name}
                </td>
                <td
                  style={{
                    padding: '4px 12px',
                    color: 'var(--color-text)',
                    fontFamily: "'Consolas', monospace",
                    fontSize: '12px',
                    wordBreak: 'break-all',
                    userSelect: 'text',
                  }}
                >
                  {h.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function HeadersTab({ request }: HeadersTabProps) {
  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <HeaderTable title="Request Headers" headers={request.requestHeaders} />
      <HeaderTable title="Response Headers" headers={request.responseHeaders} />
    </div>
  );
}
