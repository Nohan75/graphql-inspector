import React, { useEffect, useRef } from 'react';
import type { GQLRequest } from '../types';
import { RequestItem } from './RequestItem';

interface RequestListProps {
  requests: GQLRequest[];
  selectedId: number | null;
  filterText: string;
  sandboxUrl: string;
  onSelect: (id: number) => void;
}

export function RequestList({
  requests,
  selectedId,
  filterText,
  sandboxUrl,
  onSelect,
}: RequestListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(requests.length);

  // Auto-scroll to bottom when new requests arrive
  useEffect(() => {
    if (requests.length > prevLengthRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevLengthRef.current = requests.length;
  }, [requests.length]);

  const filtered = filterText
    ? requests.filter(
        (r) =>
          r.operationName.toLowerCase().includes(filterText.toLowerCase()) ||
          r.url.toLowerCase().includes(filterText.toLowerCase())
      )
    : requests;

  if (filtered.length === 0) {
    return (
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '12px',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {requests.length === 0 ? (
          <>
            <div>No GraphQL requests captured</div>
            <div style={{ fontSize: '11px' }}>Make a request to get started</div>
          </>
        ) : (
          <div>No requests match the filter</div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      style={{
        flex: 1,
        overflowY: 'auto',
      }}
    >
      {filtered.map((req) => (
        <RequestItem
          key={req.id}
          request={req}
          isSelected={req.id === selectedId}
          onClick={() => onSelect(req.id)}
          sandboxUrl={sandboxUrl}
        />
      ))}
    </div>
  );
}
