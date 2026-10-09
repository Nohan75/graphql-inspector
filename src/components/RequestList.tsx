import React, { useEffect, useRef } from 'react';
import type { GQLRequest, SandboxFormat } from '../types';
import { RequestItem } from './RequestItem';

interface RequestListProps {
  requests: GQLRequest[];
  selectedId: number | null;
  filterText: string;
  sandboxUrl: string;
  sandboxFormat: SandboxFormat;
  compareIds: number[];
  onSelect: (id: number) => void;
  onCompareToggle: (id: number) => void;
}

export function RequestList({
  requests,
  selectedId,
  filterText,
  sandboxUrl,
  sandboxFormat,
  compareIds,
  onSelect,
  onCompareToggle,
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
        className="flex-1 overflow-y-auto flex flex-col items-center justify-center text-text-muted text-xs gap-1.5"
      >
        {requests.length === 0 ? (
          <>
            <div>No GraphQL requests captured</div>
            <div className="text-[11px]">Make a request to get started</div>
          </>
        ) : (
          <div>No requests match the filter</div>
        )}
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      {filtered.map((req) => {
        const comparePosition =
          req.id === compareIds[0] ? 'A' as const :
          req.id === compareIds[1] ? 'B' as const :
          undefined;
        return (
          <RequestItem
            key={req.id}
            request={req}
            isSelected={req.id === selectedId}
            onClick={() => onSelect(req.id)}
            sandboxUrl={sandboxUrl}
            sandboxFormat={sandboxFormat}
            comparePosition={comparePosition}
            onCompareToggle={(e) => { e.stopPropagation(); onCompareToggle(req.id); }}
          />
        );
      })}
    </div>
  );
}
