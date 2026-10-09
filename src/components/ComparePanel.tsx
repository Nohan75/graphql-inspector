import React, { useState, useMemo } from 'react';
import { parse, print } from 'graphql';
import type { GQLRequest } from '../types';
import { diffLines, type DiffLine } from '../utils/diff';
import { stripCommonIndent } from '../utils/graphql';

interface ComparePanelProps {
  requestA: GQLRequest; // first selected → "−" side (red)
  requestB: GQLRequest; // second selected → "+" side (green)
  onClose: () => void;
}

type CompareTab = 'query' | 'variables' | 'response';

function normalizeQuery(q: string): string {
  try {
    return print(parse(q));
  } catch {
    return stripCommonIndent(q.trim());
  }
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-text-muted text-[11px]">
        No differences
      </div>
    );
  }

  return (
    <div className="font-mono text-[11px] leading-5 overflow-x-auto">
      {lines.map((line, i) => {
        const isRemoved = line.type === 'removed';
        const isAdded = line.type === 'added';
        return (
          <div
            key={i}
            style={{
              backgroundColor: isRemoved
                ? 'rgba(239,68,68,0.12)'
                : isAdded
                  ? 'rgba(34,197,94,0.12)'
                  : 'transparent',
            }}
            className={`flex px-2 whitespace-pre ${
              isRemoved ? 'text-error' : isAdded ? 'text-success' : 'text-text'
            }`}
          >
            <span className="w-4 shrink-0 select-none opacity-70">
              {isRemoved ? '−' : isAdded ? '+' : ' '}
            </span>
            <span>{line.value}</span>
          </div>
        );
      })}
    </div>
  );
}

const TAB_LABELS: { key: CompareTab; label: string }[] = [
  { key: 'query', label: 'Query' },
  { key: 'variables', label: 'Variables' },
  { key: 'response', label: 'Response' },
];

export function ComparePanel({ requestA, requestB, onClose }: ComparePanelProps) {
  const [tab, setTab] = useState<CompareTab>('query');

  const queryDiff = useMemo(
    () => diffLines(normalizeQuery(requestA.query), normalizeQuery(requestB.query)),
    [requestA.query, requestB.query]
  );

  const variablesDiff = useMemo(
    () => diffLines(normalizeValue(requestA.variables), normalizeValue(requestB.variables)),
    [requestA.variables, requestB.variables]
  );

  const responseDiff = useMemo(
    () => diffLines(normalizeValue(requestA.response), normalizeValue(requestB.response)),
    [requestA.response, requestB.response]
  );

  const currentDiff =
    tab === 'query' ? queryDiff : tab === 'variables' ? variablesDiff : responseDiff;

  // Count differences per tab for badges
  const counts = useMemo(() => {
    function countDiffs(d: DiffLine[]) {
      return d.filter((l) => l.type !== 'equal').length;
    }
    return {
      query: countDiffs(queryDiff),
      variables: countDiffs(variablesDiff),
      response: countDiffs(responseDiff),
    };
  }, [queryDiff, variablesDiff, responseDiff]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-toolbar shrink-0 text-[11px]">
        <span className="text-text-muted uppercase tracking-wider shrink-0">Compare</span>
        <span
          className="font-medium truncate text-error"
          title={requestA.operationName}
        >
          {requestA.operationName}
        </span>
        <span className="text-text-muted shrink-0">↔</span>
        <span
          className="font-medium truncate text-success"
          title={requestB.operationName}
        >
          {requestB.operationName}
        </span>
        <button
          onClick={onClose}
          title="Close compare"
          className="ml-auto shrink-0 bg-transparent border border-border rounded-[3px] text-text-muted hover:text-text hover:border-accent text-[10px] px-2 py-[2px] cursor-pointer"
        >
          ✕ Close
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-toolbar shrink-0">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-wider bg-transparent border-none cursor-pointer border-b-2 transition-colors
              ${tab === key
                ? 'text-accent border-accent'
                : 'text-text-muted hover:text-text border-transparent'
              }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className="text-[9px] bg-accent text-white rounded-full px-1 leading-4">
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1 border-b border-border text-[10px] shrink-0 bg-toolbar">
        <span className="text-error">− {requestA.operationName}</span>
        <span className="text-success">+ {requestB.operationName}</span>
      </div>

      {/* Diff output */}
      <div className="flex-1 overflow-auto">
        <DiffView lines={currentDiff} />
      </div>
    </div>
  );
}
