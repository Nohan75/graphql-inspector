import React, { useState, useMemo } from 'react';
import { parse, print } from 'graphql';
import { tokenizeLine, tokenClassMap } from '../utils/highlight';

interface QueryEditorProps {
  query: string;
}

interface LineInfo {
  lineNumber: number;
  text: string;
  depth: number;
  isFoldable: boolean;
  foldEnd?: number;  // line number of matching close brace
}

function buildLineInfos(lines: string[]): LineInfo[] {
  const infos: LineInfo[] = lines.map((text, i) => ({
    lineNumber: i + 1,
    text,
    depth: 0,
    isFoldable: false,
    foldEnd: undefined,
  }));

  // Compute brace depth and foldable lines
  let depth = 0;
  const stack: number[] = [];  // stack of line indices with open brace

  for (let i = 0; i < infos.length; i++) {
    const trimmed = infos[i].text.trim();
    infos[i].depth = depth;

    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;

    if (opens > closes) {
      stack.push(i);
      depth += opens - closes;
    } else if (closes > opens) {
      depth -= closes - opens;
      if (depth < 0) depth = 0;
      // Pop as many as needed
      for (let c = 0; c < closes - opens; c++) {
        const opener = stack.pop();
        if (opener !== undefined) {
          infos[opener].isFoldable = true;
          infos[opener].foldEnd = i + 1;
        }
      }
    }
  }

  return infos;
}

export function QueryEditor({ query }: QueryEditorProps) {
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(new Set());

  const normalizedQuery = useMemo(() => {
    try {
      return print(parse(query));
    } catch {
      // Fallback to raw query if parsing fails (e.g. incomplete queries)
      return query.trim();
    }
  }, [query]);
  const rawLines = useMemo(() => normalizedQuery.split('\n'), [normalizedQuery]);
  const lineInfos = useMemo(() => buildLineInfos(rawLines), [rawLines]);

  // Determine hidden lines
  const hiddenLines = useMemo(() => {
    const hidden = new Set<number>();
    for (const lineNum of collapsedLines) {
      const info = lineInfos.find((l) => l.lineNumber === lineNum);
      if (info?.foldEnd !== undefined) {
        for (let i = lineNum; i < info.foldEnd; i++) {
          hidden.add(i + 1); // lines are 1-indexed
        }
      }
    }
    return hidden;
  }, [lineInfos, collapsedLines]);

  const toggleFold = (lineNumber: number) => {
    setCollapsedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  };

  return (
    <div
      style={{
        fontFamily: "'Consolas', 'Courier New', monospace",
        fontSize: '12px',
        lineHeight: '20px',
        color: 'var(--color-text)',
      }}
    >
      {lineInfos.map((info) => {
        if (hiddenLines.has(info.lineNumber)) return null;

        const isCollapsed = collapsedLines.has(info.lineNumber);
        const tokens = tokenizeLine(info.text);

        return (
          <div
            key={info.lineNumber}
            style={{ display: 'flex', alignItems: 'baseline' }}
          >
            {/* Line number */}
            <span className="line-gutter">{info.lineNumber}</span>

            {/* Fold arrow */}
            {info.isFoldable ? (
              <span
                className="fold-arrow"
                onClick={() => toggleFold(info.lineNumber)}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? '▶' : '▼'}
              </span>
            ) : (
              <span style={{ display: 'inline-block', width: 12 }} />
            )}

            {/* Code tokens */}
            <span style={{ whiteSpace: 'pre' }}>
              {tokens.map((token, ti) => {
                const cls = tokenClassMap[token.type];
                return cls ? (
                  <span key={ti} className={cls}>
                    {token.text}
                  </span>
                ) : (
                  <React.Fragment key={ti}>{token.text}</React.Fragment>
                );
              })}
            </span>

            {/* Collapse hint */}
            {isCollapsed && (
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 4 }}>
                {' … }'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
