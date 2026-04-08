import React, { useState, useMemo } from 'react';
import {
  parse,
  print,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type FieldNode,
  type ValueNode,
} from 'graphql';
import { tokenizeLine, tokenClassMap } from '../utils/highlight';
import { stripCommonIndent } from '../utils/graphql';

interface QueryEditorProps {
  query: string;
  /** Called with a minimal sub-query string when the user clicks a line's ↗ button */
  onOpenLine?: (subquery: string) => void;
}

/**
 * Given the normalized query and a 1-based line number, returns a minimal
 * query that contains only the field on that line, all its children (if any),
 * and all its ancestor fields up to the operation root.
 *
 * Example — clicking "lat" in:
 *   query Q { assets { location { lat lng } } }
 * returns:
 *   query Q { assets { location { lat } } }
 */
function extractFieldSubquery(
  normalizedQuery: string,
  lineNumber: number
): string | null {
  let ast;
  try {
    ast = parse(normalizedQuery);
  } catch {
    return null;
  }

  const operations = ast.definitions.filter(
    (d): d is OperationDefinitionNode => d.kind === 'OperationDefinition'
  );
  const operation =
    operations.find((op) => {
      const startLine = op.loc?.startToken.line;
      const endLine = op.loc?.endToken.line;
      return (
        startLine !== undefined &&
        endLine !== undefined &&
        startLine <= lineNumber &&
        lineNumber <= endLine
      );
    }) ?? operations[0];
  if (!operation) return null;

  // Build a map of fragment name → selectionSet for resolving FragmentSpreads
  const fragmentMap = new Map<string, SelectionSetNode>();
  for (const def of ast.definitions) {
    if (def.kind === 'FragmentDefinition') {
      fragmentMap.set(def.name.value, def.selectionSet);
    }
  }

  // Depth-first search: return the path of FieldNodes leading to the target line.
  // Recurses into InlineFragment and FragmentSpread transparently (they don't add
  // to the path since they are not fields themselves).
  function findPath(
    selectionSet: SelectionSetNode,
    path: FieldNode[]
  ): FieldNode[] | null {
    for (const sel of selectionSet.selections) {
      if (sel.kind === 'Field') {
        const next = [...path, sel];
        if (sel.loc?.startToken.line === lineNumber) return next;
        if (sel.selectionSet) {
          const found = findPath(sel.selectionSet, next);
          if (found) return found;
        }
      } else if (sel.kind === 'InlineFragment') {
        const found = findPath(sel.selectionSet, path);
        if (found) return found;
      } else if (sel.kind === 'FragmentSpread') {
        const fragSet = fragmentMap.get(sel.name.value);
        if (fragSet) {
          const found = findPath(fragSet, path);
          if (found) return found;
        }
      }
    }
    return null;
  }

  const path = findPath(operation.selectionSet, []);
  if (!path || path.length === 0) return null;

  // Rebuild from leaf → root.
  // The leaf keeps its full selection set; each parent wraps only the child below it.
  let inner: FieldNode = path[path.length - 1];
  for (let i = path.length - 2; i >= 0; i--) {
    inner = {
      ...path[i],
      selectionSet: { kind: 'SelectionSet', selections: [inner] },
    };
  }

  // Collect variable names referenced in the extracted subtree so we only
  // keep the variableDefinitions that are actually used. Spreading ...operation
  // would carry over all original variables, causing GraphQL validation errors
  // like "Variable '$x' is never used" for variables not in this sub-query.
  const usedVars = new Set<string>();
  function collectVars(field: FieldNode) {
    function visitValue(v: ValueNode) {
      if (v.kind === 'Variable') {
        usedVars.add(v.name.value);
      } else if (v.kind === 'ListValue') {
        v.values.forEach(visitValue);
      } else if (v.kind === 'ObjectValue') {
        v.fields.forEach((f) => visitValue(f.value));
      }
    }
    field.arguments?.forEach((arg) => visitValue(arg.value));
    field.selectionSet?.selections.forEach((sel) => {
      if (sel.kind === 'Field') collectVars(sel);
    });
  }
  collectVars(inner);

  const newOp: OperationDefinitionNode = {
    ...operation,
    variableDefinitions: (operation.variableDefinitions ?? []).filter((vd) =>
      usedVars.has(vd.variable.name.value)
    ),
    selectionSet: { kind: 'SelectionSet', selections: [inner] },
  };

  return print(newOp);
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

  const normalizedQuery = useMemo(() => {
    try {
      return print(parse(query));
    } catch {
      // Fallback: strip common indentation when graphql parse fails
      return stripCommonIndent(query.trim());
    }
  }, [query]);
  const rawLines = useMemo(() => normalizedQuery.split('\n'), [normalizedQuery]);
  const lineInfos = useMemo(() => buildLineInfos(rawLines), [rawLines]);

  // Collect line numbers that correspond to a GraphQL field
  const fieldLineNumbers = useMemo(() => {
    const lineNums = new Set<number>();
    let ast;
    try {
      ast = parse(normalizedQuery);
    } catch {
      return lineNums;
    }
    const fragMap = new Map<string, SelectionSetNode>();
    for (const def of ast.definitions) {
      if (def.kind === 'FragmentDefinition') fragMap.set(def.name.value, def.selectionSet);
    }
    function collectLines(selectionSet: SelectionSetNode) {
      for (const sel of selectionSet.selections) {
        if (sel.kind === 'Field') {
          if (sel.loc?.startToken.line) lineNums.add(sel.loc.startToken.line);
          if (sel.selectionSet) collectLines(sel.selectionSet);
        } else if (sel.kind === 'InlineFragment') {
          collectLines(sel.selectionSet);
        } else if (sel.kind === 'FragmentSpread') {
          const fragSet = fragMap.get(sel.name.value);
          if (fragSet) collectLines(fragSet);
        }
      }
    }
    for (const def of ast.definitions) {
      if (def.kind === 'OperationDefinition') collectLines(def.selectionSet);
    }
    return lineNums;
  }, [normalizedQuery]);

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

        const isField = onOpenLine && fieldLineNumbers.has(info.lineNumber);

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
              <span
                className="ml-1.5 opacity-0 group-hover:opacity-100 cursor-pointer text-accent text-[10px] leading-none select-none"
                onClick={() => {
                  const sub = extractFieldSubquery(normalizedQuery, info.lineNumber);
                  if (sub) onOpenLine(sub);
                }}
                title="Open this field in sandbox"
              >
                ↗
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
