import {
  Kind,
  parse,
  print,
  visit,
  type ASTNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type InlineFragmentNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
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

/** One selection on the way from an operation down to a field */
type Step = FieldNode | InlineFragmentNode;

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
  // A fragment is walked once: its lines are the same wherever it is spread,
  // and fragments that spread each other would otherwise never end.
  const walked = new Set<string>();
  function collectLines(selectionSet: SelectionSetNode) {
    for (const sel of selectionSet.selections) {
      if (sel.kind === 'Field') {
        if (sel.loc?.startToken.line) lineNums.add(sel.loc.startToken.line);
        if (sel.selectionSet) collectLines(sel.selectionSet);
      } else if (sel.kind === 'InlineFragment') {
        collectLines(sel.selectionSet);
      } else if (sel.kind === 'FragmentSpread') {
        const name = sel.name.value;
        const fragSet = fragMap.get(name);
        if (fragSet && !walked.has(name)) {
          walked.add(name);
          collectLines(fragSet);
        }
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
  // Build a map of fragment name → definition for resolving FragmentSpreads
  const fragmentMap = new Map<string, FragmentDefinitionNode>();
  for (const def of document.definitions) {
    if (def.kind === 'FragmentDefinition') {
      fragmentMap.set(def.name.value, def);
    }
  }

  // Depth-first search: return the path leading to the field on the target line.
  // A fragment crossed on the way is part of the path: it carries the type
  // condition without which the field may not exist on its parent. A named
  // fragment joins the path as an inline fragment with the same condition,
  // since the spread itself would bring every field of the fragment along.
  // A fragment that did not hold the line once will not hold it later either,
  // and fragments that spread each other would otherwise never end.
  const searched = new Set<string>();
  function findPath(
    selectionSet: SelectionSetNode,
    path: Step[]
  ): Step[] | null {
    for (const sel of selectionSet.selections) {
      if (sel.kind === 'Field') {
        const next = [...path, sel];
        if (sel.loc?.startToken.line === lineNumber) return next;
        if (sel.selectionSet) {
          const found = findPath(sel.selectionSet, next);
          if (found) return found;
        }
      } else if (sel.kind === 'InlineFragment') {
        const found = findPath(sel.selectionSet, [...path, sel]);
        if (found) return found;
      } else if (sel.kind === 'FragmentSpread') {
        const name = sel.name.value;
        const fragment = fragmentMap.get(name);
        if (fragment && !searched.has(name)) {
          searched.add(name);
          const inline: InlineFragmentNode = {
            kind: Kind.INLINE_FRAGMENT,
            typeCondition: fragment.typeCondition,
            // the spread's own directives, e.g. @include, still apply
            directives: sel.directives,
            selectionSet: fragment.selectionSet,
          };
          const found = findPath(fragment.selectionSet, [...path, inline]);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // The field belongs to the first operation that reaches it. For a field in
  // the body of an operation that is the operation itself; for a field inside
  // a fragment it is the first operation, in document order, to spread it.
  let operation: OperationDefinitionNode | undefined;
  let path: Step[] | null = null;
  for (const candidate of operations) {
    path = findPath(candidate.selectionSet, []);
    if (path) {
      operation = candidate;
      break;
    }
  }
  if (!operation || !path || path.length === 0) return null;

  // Rebuild from leaf → root.
  // The leaf keeps its full selection set; each parent wraps only the child below it.
  let inner: Step = path[path.length - 1];
  for (let i = path.length - 2; i >= 0; i--) {
    inner = {
      ...path[i],
      selectionSet: { kind: Kind.SELECTION_SET, selections: [inner] },
    };
  }

  const reduced: OperationDefinitionNode = {
    ...operation,
    selectionSet: { kind: Kind.SELECTION_SET, selections: [inner] },
  };

  // The fragments spread beneath the field come along, in document order,
  // or the sub-query would refer to fragments it does not define.
  const usedFragments = fragmentsUsedBy(inner, fragmentMap);
  const fragmentDefinitions = document.definitions.filter(
    (def): def is FragmentDefinitionNode =>
      def.kind === 'FragmentDefinition' && usedFragments.has(def.name.value)
  );

  // Keep only the definitions of the variables the sub-query uses, wherever
  // that is: an argument, a directive, an inline fragment or a fragment.
  // Keeping them all would fail validation with "Variable '$x' is never used".
  const usedVars = variablesUsedBy([reduced, ...fragmentDefinitions]);
  const variableDefinitions = (operation.variableDefinitions ?? []).filter((vd) =>
    usedVars.has(vd.variable.name.value)
  );
  const newOp: OperationDefinitionNode = { ...reduced, variableDefinitions };

  const subquery: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [newOp, ...fragmentDefinitions],
  };

  return {
    text: print(subquery),
    variableNames: variableDefinitions.map((vd) => vd.variable.name.value),
  };
}

/** Names of the variables used anywhere in the given definitions */
function variablesUsedBy(definitions: readonly ASTNode[]): Set<string> {
  const used = new Set<string>();
  for (const definition of definitions) {
    visit(definition, {
      // A definition declares a variable, it does not use it
      VariableDefinition: () => false,
      Variable(variable) {
        used.add(variable.name.value);
      },
    });
  }
  return used;
}

/**
 * Names of the fragments spread beneath a node, including the ones those
 * fragments spread themselves.
 */
function fragmentsUsedBy(
  root: ASTNode,
  fragments: Map<string, FragmentDefinitionNode>
): Set<string> {
  const used = new Set<string>();
  const scan = (node: ASTNode) => {
    visit(node, {
      FragmentSpread(spread) {
        const name = spread.name.value;
        const definition = fragments.get(name);
        // `used` also stops fragments that spread each other from looping
        if (!definition || used.has(name)) return;
        used.add(name);
        scan(definition);
      },
    });
  };
  scan(root);
  return used;
}
