import React, { useState, useMemo } from 'react';
import { tokenizeLine, tokenClassMap } from '../utils/highlight';
import { parseQueryDocument, type Subquery } from '../utils/queryDocument';

interface QueryEditorProps {
  query: string;
  /** Called with the sub-query of a line when the user clicks that line's ↗ button */
  onOpenLine?: (subquery: Subquery) => void;
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

export function QueryEditor({ query, onOpenLine }: QueryEditorProps) {
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(new Set());

  const doc = useMemo(() => parseQueryDocument(query), [query]);
  const rawLines = useMemo(() => doc.text.split('\n'), [doc]);
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
    <div className="code-font">
      {lineInfos.map((info) => {
        if (hiddenLines.has(info.lineNumber)) return null;

        const isCollapsed = collapsedLines.has(info.lineNumber);
        const tokens = tokenizeLine(info.text);

        // Field lines are only asked for when a sandbox is configured: they are
        // computed on first use, so a plain display never pays for them.
        const isField = onOpenLine && doc.fieldLines.has(info.lineNumber);

        return (
          <div
            key={info.lineNumber}
            className="flex items-baseline group"
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
              <span className="inline-block w-3" />
            )}

            {/* Code tokens */}
            <span className="whitespace-pre-wrap break-words">
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
              <span className="text-text-muted ml-1">
                {' … }'}
              </span>
            )}

            {/* Per-line sandbox button */}
            {isField && (
              <button
                type="button"
                className="ml-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 cursor-pointer text-accent text-[10px] leading-none bg-transparent border-none p-0"
                onClick={() => {
                  const sub = doc.subqueryAt(info.lineNumber);
                  if (sub) onOpenLine(sub);
                }}
                aria-label="Open this field in sandbox"
                title="Open this field in sandbox"
              >
                ↗
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
