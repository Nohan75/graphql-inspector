import {
  Kind,
  parse,
  print,
  type DocumentNode,
  type FieldNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValueNode,
} from 'graphql';

/** A query document reduced to a single field of another one */
export interface Subquery {
  text: string;
  /** Names of the variables the sub-query declares, without the `$` */
  variableNames: string[];
}

/**
 * The GraphQL text carried by a captured request: one or more operations,
 * plus the fragments they use.
 */
export interface QueryDocument {
  /**
   * Normalised text. When the source does not parse, the trimmed source, so
   * that a broken query can still be displayed.
   */
  readonly text: string;
  /**
   * 1-based numbers of the lines of `text` that carry a field.
   * Empty when the source does not parse.
   */
  readonly fieldLines: ReadonlySet<number>;
  /**
   * The sub-query for the field on a line of `text`: that field with
   * everything beneath it, and the chain of parents leading to it.
   * Null when the line carries no field.
   */
  subqueryAt(line: number): Subquery | null;
}

export function parseQueryDocument(source: string): QueryDocument {
  const text = normalise(source);

  // Line numbers refer to `text`, so the tree is read from it rather than
  // from the source. Parsed on first use: displaying a query needs neither
  // of the two answers below.
  let ast: DocumentNode | null | undefined;
  const tree = (): DocumentNode | null => {
    if (ast === undefined) {
      try {
        ast = parse(text);
      } catch {
        ast = null;
      }
    }
    return ast;
  };

  let fieldLines: ReadonlySet<number> | undefined;

  return {
    text,
    get fieldLines() {
      if (!fieldLines) {
        const document = tree();
        fieldLines = document ? collectFieldLines(document) : new Set<number>();
      }
      return fieldLines;
    },
    subqueryAt(line) {
      const document = tree();
      return document ? extractSubquery(document, line) : null;
    },
  };
}

function normalise(source: string): string {
  try {
    return print(parse(source));
  } catch {
    // Fallback: strip common indentation when graphql parse fails
    return stripCommonIndent(source.trim());
  }
}

/**
 * Strip common leading whitespace indentation from a query string.
 */
function stripCommonIndent(query: string): string {
  const lines = query.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return query;

  const minIndent = Math.min(
    ...nonEmpty.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0)
  );
  if (minIndent === 0) return query;

  return lines.map((l) => l.slice(minIndent)).join('\n');
}

function collectFieldLines(document: DocumentNode): Set<number> {
  const lineNums = new Set<number>();
  const fragMap = new Map<string, SelectionSetNode>();
  for (const def of document.definitions) {
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
  for (const def of document.definitions) {
    if (def.kind === 'OperationDefinition') collectLines(def.selectionSet);
  }
  return lineNums;
}

/**
 * Returns a minimal query that contains only the field on the given line, all
 * its children (if any), and all its ancestor fields up to the operation root.
 *
 * Example — clicking "lat" in:
 *   query Q { assets { location { lat lng } } }
 * returns:
 *   query Q { assets { location { lat } } }
 */
function extractSubquery(document: DocumentNode, lineNumber: number): Subquery | null {
  const operations = document.definitions.filter(
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
  for (const def of document.definitions) {
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
      selectionSet: { kind: Kind.SELECTION_SET, selections: [inner] },
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

  const variableDefinitions = (operation.variableDefinitions ?? []).filter((vd) =>
    usedVars.has(vd.variable.name.value)
  );
  const newOp: OperationDefinitionNode = {
    ...operation,
    variableDefinitions,
    selectionSet: { kind: Kind.SELECTION_SET, selections: [inner] },
  };

  return {
    text: print(newOp),
    variableNames: variableDefinitions.map((vd) => vd.variable.name.value),
  };
}
