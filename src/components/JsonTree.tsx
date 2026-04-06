import React, { useState, useMemo, useRef, useEffect } from 'react';

interface JsonTreeProps {
  data: unknown;
  searchTerm?: string;
  currentMatchIndex?: number;
  onMatchesFound?: (count: number) => void;
}

interface FlatNode {
  key: number;
  depth: number;
  label: string | null;  // object key or array index
  valuePreview: string;
  isCollapsible: boolean;
  type: 'open' | 'close' | 'leaf';
  closingFor?: number;    // key of the opening node this closes
  childCount?: number;
  lineNumber: number;
  searchText: string;     // text content used for search
}

function buildFlatNodes(
  value: unknown,
  depth: number,
  label: string | null,
  nodes: FlatNode[],
  lineCounter: { n: number }
): void {
  const key = nodes.length;
  const line = lineCounter.n++;

  if (value === null) {
    nodes.push({
      key,
      depth,
      label,
      valuePreview: 'null',
      isCollapsible: false,
      type: 'leaf',
      lineNumber: line,
      searchText: label ? `${label}: null` : 'null',
    });
    return;
  }

  if (Array.isArray(value)) {
    const childCount = value.length;
    nodes.push({
      key,
      depth,
      label,
      valuePreview: childCount === 0 ? '[]' : `[${childCount}]`,
      isCollapsible: childCount > 0,
      type: 'open',
      childCount,
      lineNumber: line,
      searchText: label ? `${label}: [` : '[',
    });
    if (childCount > 0) {
      value.forEach((item, idx) => {
        buildFlatNodes(item, depth + 1, String(idx), nodes, lineCounter);
      });
      const closeLine = lineCounter.n++;
      nodes.push({
        key: nodes.length,
        depth,
        label: null,
        valuePreview: ']',
        isCollapsible: false,
        type: 'close',
        closingFor: key,
        lineNumber: closeLine,
        searchText: ']',
      });
    }
    return;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const childCount = entries.length;
    nodes.push({
      key,
      depth,
      label,
      valuePreview: childCount === 0 ? '{}' : `{${childCount}}`,
      isCollapsible: childCount > 0,
      type: 'open',
      childCount,
      lineNumber: line,
      searchText: label ? `${label}: {` : '{',
    });
    if (childCount > 0) {
      entries.forEach(([k, v]) => {
        buildFlatNodes(v, depth + 1, k, nodes, lineCounter);
      });
      const closeLine = lineCounter.n++;
      nodes.push({
        key: nodes.length,
        depth,
        label: null,
        valuePreview: '}',
        isCollapsible: false,
        type: 'close',
        closingFor: key,
        lineNumber: closeLine,
        searchText: '}',
      });
    }
    return;
  }

  // Primitive
  const displayValue =
    typeof value === 'string' ? `"${value}"` : String(value);
  nodes.push({
    key,
    depth,
    label,
    valuePreview: displayValue,
    isCollapsible: false,
    type: 'leaf',
    lineNumber: line,
    searchText: label ? `${label}: ${displayValue}` : displayValue,
  });
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
        style={{ background: 'none' }}
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
}: JsonTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const nodes = useMemo(() => {
    const list: FlatNode[] = [];
    buildFlatNodes(data, 0, null, list, { n: 1 });
    return list;
  }, [data]);

  // Compute which nodes are hidden (inside a collapsed parent)
  const hiddenNodes = useMemo(() => {
    const hidden = new Set<number>();
    // Track which open nodes are collapsing us
    const stack: number[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (node.type === 'close' && node.closingFor !== undefined) {
        const idx = stack.indexOf(node.closingFor);
        if (idx !== -1) {
          stack.splice(idx, 1);
        }
      }

      if (stack.length > 0) {
        hidden.add(node.key);
      }

      if (node.type === 'open' && collapsed.has(node.key)) {
        stack.push(node.key);
      }
    }

    return hidden;
  }, [nodes, collapsed]);

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

  // Scroll to current match when it changes
  useEffect(() => {
    if (currentMatchNodeKey === -1) return;
    const el = rowRefs.current.get(currentMatchNodeKey);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentMatchNodeKey]);

  return (
    <div
      style={{
        fontFamily: "'Consolas', 'Courier New', monospace",
        fontSize: '12px',
        lineHeight: '20px',
        color: 'var(--color-text)',
      }}
    >
      {nodes.map((node) => {
        if (hiddenNodes.has(node.key)) return null;

        const isCurrentMatch = node.key === currentMatchNodeKey;
        const hasMatch =
          searchTerm &&
          node.searchText.toLowerCase().includes(searchTerm.toLowerCase());

        const indent = node.depth * 16;

        // Build label part
        let labelEl: React.ReactNode = null;
        if (node.label !== null) {
          const labelText = `${node.label}: `;
          labelEl = (
            <span style={{ color: 'var(--color-syn-field)' }}>
              {searchTerm && hasMatch
                ? highlightText(labelText, searchTerm, isCurrentMatch, 0)
                : labelText}
            </span>
          );
        }

        // Build value part
        let valueColor = 'var(--color-text)';
        const vp = node.valuePreview;
        if (vp === 'null' || vp === 'true' || vp === 'false') {
          valueColor = 'var(--color-syn-keyword)';
        } else if (vp.startsWith('"')) {
          valueColor = 'var(--color-syn-string)';
        } else if (!isNaN(Number(vp)) && vp !== '') {
          valueColor = '#b5cea8';
        } else if (vp.startsWith('{') || vp.startsWith('[') || vp === '}' || vp === ']') {
          valueColor = 'var(--color-syn-brace)';
        }

        const valueEl = (
          <span style={{ color: valueColor }}>
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
            style={{
              display: 'flex',
              alignItems: 'baseline',
              backgroundColor:
                isCurrentMatch && searchTerm
                  ? 'rgba(255,140,0,0.15)'
                  : hasMatch && searchTerm
                  ? 'rgba(255,200,0,0.08)'
                  : 'transparent',
            }}
          >
            {/* Line number */}
            <span className="line-gutter">{node.lineNumber}</span>

            {/* Content with indentation */}
            <span style={{ paddingLeft: indent, display: 'flex', alignItems: 'baseline', flexShrink: 0 }}>
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
                <span style={{ display: 'inline-block', width: 12 }} />
              )}

              {labelEl}
              {valueEl}

              {/* Collapsed summary */}
              {node.isCollapsible && collapsed.has(node.key) && (
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
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
