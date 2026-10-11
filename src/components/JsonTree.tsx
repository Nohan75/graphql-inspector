import React, { useState, useMemo, useRef, useEffect, useImperativeHandle } from 'react';
import { collapseAll, expandTo, flattenJson, hiddenNodes } from '../utils/jsonTree';

interface JsonTreeProps {
  data: unknown;
  searchTerm?: string;
  currentMatchIndex?: number;
  onMatchesFound?: (count: number) => void;
  /** To collapse or expand the whole tree from outside it */
  ref?: React.Ref<JsonTreeHandle>;
}

export interface JsonTreeHandle {
  /** Collapses everything below the top level */
  collapseAll(): void;
  expandAll(): void;
}

function highlightText(
  text: string,
  searchTerm: string,
  isCurrentMatch: boolean,
  matchIndexInNode: number
): React.ReactNode {
  if (!searchTerm) return text;

  const lowerText = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx = lowerText.indexOf(lowerSearch, 0);
  let localMatchIdx = matchIndexInNode;

  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx));
    const isCurrent = isCurrentMatch && localMatchIdx === 0;
    parts.push(
      <mark
        key={idx}
        className={isCurrent ? 'jt-search-current' : 'jt-search-match'}
      >
        {text.slice(idx, idx + searchTerm.length)}
      </mark>
    );
    last = idx + searchTerm.length;
    idx = lowerText.indexOf(lowerSearch, last);
    localMatchIdx--;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function JsonTree({
  data,
  searchTerm = '',
  currentMatchIndex = 0,
  onMatchesFound,
  ref,
}: JsonTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const nodes = useMemo(() => flattenJson(data), [data]);

  useImperativeHandle(
    ref,
    () => ({
      collapseAll: () => setCollapsed(collapseAll(nodes)),
      expandAll: () => setCollapsed(new Set()),
    }),
    [nodes]
  );

  const hidden = useMemo(() => hiddenNodes(nodes, collapsed), [nodes, collapsed]);

  // Compute search matches
  const { matchNodeKeys, matchTotal } = useMemo(() => {
    if (!searchTerm) {
      onMatchesFound?.(0);
      return { matchNodeKeys: [], matchTotal: 0 };
    }
    const lowerSearch = searchTerm.toLowerCase();
    const matches: number[] = [];
    for (const node of nodes) {
      if (node.searchText.toLowerCase().includes(lowerSearch)) {
        matches.push(node.key);
      }
    }
    onMatchesFound?.(matches.length);
    return { matchNodeKeys: matches, matchTotal: matches.length };
  }, [nodes, searchTerm, onMatchesFound]);

  const toggleCollapse = (key: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const currentMatchNodeKey =
    matchTotal > 0 ? matchNodeKeys[currentMatchIndex % matchTotal] : -1;

  // Show the current match when it changes: expand what hides it, then
  // scroll to it. Only then: a line the user collapses afterwards stays so.
  const toScrollTo = useRef(-1);
  useEffect(() => {
    if (currentMatchNodeKey === -1) return;
    toScrollTo.current = currentMatchNodeKey;
    setCollapsed((prev) => expandTo(nodes, prev, currentMatchNodeKey));
  }, [currentMatchNodeKey, nodes]);

  // After every render: the row of a match that was hidden only exists once
  // the lines that held it are expanded.
  useEffect(() => {
    const el = rowRefs.current.get(toScrollTo.current);
    if (!el) return;
    toScrollTo.current = -1;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  return (
    <div className="code-font">
      {nodes.map((node) => {
        if (hidden.has(node.key)) return null;

        const isCurrentMatch = node.key === currentMatchNodeKey;
        const hasMatch =
          searchTerm &&
          node.searchText.toLowerCase().includes(searchTerm.toLowerCase());

        // Value color class
        let valueClass = 'text-text';
        const vp = node.valuePreview;
        if (vp === 'null' || vp === 'true' || vp === 'false') {
          valueClass = 'text-syn-keyword';
        } else if (vp.startsWith('"')) {
          valueClass = 'text-syn-string';
        } else if (!isNaN(Number(vp)) && vp !== '') {
          valueClass = 'text-syn-number';
        } else if (vp.startsWith('{') || vp.startsWith('[') || vp === '}' || vp === ']') {
          valueClass = 'text-syn-brace';
        }

        // Build label part
        let labelEl: React.ReactNode = null;
        if (node.label !== null) {
          const labelText = `${node.label}: `;
          labelEl = (
            <span className="text-syn-field shrink-0">
              {searchTerm && hasMatch
                ? highlightText(labelText, searchTerm, isCurrentMatch, 0)
                : labelText}
            </span>
          );
        }

        // Build value part
        const valueEl = (
          <span className={`${valueClass} break-words`}>
            {searchTerm && hasMatch
              ? highlightText(vp, searchTerm, isCurrentMatch, 0)
              : vp}
          </span>
        );

        return (
          <div
            key={node.key}
            ref={(el) => {
              if (el) rowRefs.current.set(node.key, el);
              else rowRefs.current.delete(node.key);
            }}
            aria-current={isCurrentMatch && searchTerm ? 'true' : undefined}
            className={`flex items-baseline ${
              isCurrentMatch && searchTerm
                ? 'row-match-current'
                : hasMatch && searchTerm
                ? 'row-match'
                : ''
            }`}
          >
            {/* Line number */}
            <span className="line-gutter">{node.lineNumber}</span>

            {/* Content with indentation */}
            <span className={`indent-${Math.min(node.depth, 25)} flex items-baseline min-w-0 flex-1`}>
              {/* Collapse arrow */}
              {node.isCollapsible ? (
                <span
                  className="fold-arrow"
                  onClick={() => toggleCollapse(node.key)}
                  title={collapsed.has(node.key) ? 'Expand' : 'Collapse'}
                >
                  {collapsed.has(node.key) ? '▶' : '▼'}
                </span>
              ) : (
                <span className="inline-block w-3" />
              )}

              {labelEl}
              {valueEl}

              {/* Collapsed summary */}
              {node.isCollapsible && collapsed.has(node.key) && (
                <span className="text-text-muted ml-1">
                  {node.type === 'open' && node.valuePreview.startsWith('[')
                    ? ` … ${node.childCount} item${node.childCount !== 1 ? 's' : ''}]`
                    : ` … ${node.childCount} key${node.childCount !== 1 ? 's' : ''}}`}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
