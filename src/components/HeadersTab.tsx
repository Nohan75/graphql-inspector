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
      <div className="text-text-muted text-[11px] uppercase tracking-wider px-3 py-1.5 border-b border-border bg-toolbar">
        {title}
      </div>
      {headers.length === 0 ? (
        <div className="px-3 py-2 text-text-muted">No headers</div>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {headers.map((h, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-1 text-syn-field code-font w-[40%] align-top select-text">
                  {h.name}
                </td>
                <td className="px-3 py-1 text-text code-font break-all select-text">
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
    <div className="overflow-y-auto h-full">
      <HeaderTable title="Request Headers"  headers={request.requestHeaders} />
      <HeaderTable title="Response Headers" headers={request.responseHeaders} />
    </div>
  );
}
