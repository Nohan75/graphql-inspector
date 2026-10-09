import {
  Kind,
  parse,
  print,
  visit,
  type ASTNode,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type FragmentSpreadNode,
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

  // Line numbers refer to `text`, so the fields are read from it rather than
  // from the source. Read on first use: displaying a query needs neither of
  // the two answers below.
  let fields: FieldIndex | null | undefined;
  const index = (): FieldIndex | null => {
    if (fields === undefined) {
      try {
        fields = indexFields(parse(text));
      } catch {
        fields = null;
      }
    }
    return fields;
  };

  let fieldLines: ReadonlySet<number> | undefined;

  return {
    text,
    get fieldLines() {
      fieldLines ??= new Set(index()?.byLine.keys());
      return fieldLines;
    },
    subqueryAt(line) {
      const found = index();
      const location = found?.byLine.get(line);
      return found && location ? buildSubquery(location, found) : null;
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

/** One selection on the way from an operation down to a field */
type Step = FieldNode | InlineFragmentNode;

/** Where a field sits in a query document */
interface FieldLocation {
  operation: OperationDefinitionNode;
  /** From the root of the operation down to the field itself, which comes last */
  path: Step[];
}

interface FieldIndex {
  document: DocumentNode;
  fragments: Map<string, FragmentDefinitionNode>;
  /** Line of the document → the field that starts on it */
  byLine: Map<number, FieldLocation>;
}

/**
 * Walks the selections of every operation once and records where each field
 * sits. This is the only walk of the selection tree: field lines and
 * sub-queries are both read from its result.
 */
function indexFields(document: DocumentNode): FieldIndex {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  }

  const byLine = new Map<number, FieldLocation>();
  // A fragment is walked once, where it is first reached. A field inside a
  // fragment therefore belongs to the first operation, in document order,
  // that spreads it, and fragments that spread each other cannot loop.
  const walked = new Set<string>();

  function walk(
    selectionSet: SelectionSetNode,
    operation: OperationDefinitionNode,
    path: Step[]
  ) {
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const next = [...path, sel];
        const line = sel.loc?.startToken.line;
        if (line !== undefined && !byLine.has(line)) {
          byLine.set(line, { operation, path: next });
        }
        if (sel.selectionSet) walk(sel.selectionSet, operation, next);
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        walk(sel.selectionSet, operation, [...path, sel]);
      } else {
        const name = sel.name.value;
        const fragment = fragments.get(name);
        if (!fragment || walked.has(name)) continue;
        walked.add(name);
        walk(fragment.selectionSet, operation, [...path, asInlineFragment(sel, fragment)]);
      }
    }
  }

  for (const def of document.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) walk(def.selectionSet, def, []);
  }

  return { document, fragments, byLine };
}

/**
 * A fragment crossed on the way to a field is part of its path: it carries
 * the type condition without which the field may not exist on its parent.
 * A named fragment joins the path as an inline fragment with the same
 * condition, since the spread itself would bring every field of the
 * fragment along.
 */
function asInlineFragment(
  spread: FragmentSpreadNode,
  fragment: FragmentDefinitionNode
): InlineFragmentNode {
  return {
    kind: Kind.INLINE_FRAGMENT,
    typeCondition: fragment.typeCondition,
    // the spread's own directives, e.g. @include, still apply
    directives: spread.directives,
    selectionSet: fragment.selectionSet,
  };
}

/**
 * Builds a minimal query that contains only the given field, all its children
 * (if any), and all its ancestors up to the operation root.
 *
 * Example — the field "lat" in:
 *   query Q { assets { location { lat lng } } }
 * gives:
 *   query Q { assets { location { lat } } }
 */
function buildSubquery(
  { operation, path }: FieldLocation,
  { document, fragments }: FieldIndex
): Subquery {
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
  const usedFragments = fragmentsUsedBy(inner, fragments);
  const fragmentDefinitions = document.definitions.filter(
    (def): def is FragmentDefinitionNode =>
      def.kind === Kind.FRAGMENT_DEFINITION && usedFragments.has(def.name.value)
  );

  // Keep only the definitions of the variables the sub-query uses, wherever
  // that is: an argument, a directive, an inline fragment or a fragment.
  // Keeping them all would fail validation with "Variable '$x' is never used".
  const usedVars = variablesUsedBy([reduced, ...fragmentDefinitions]);
  const variableDefinitions = (operation.variableDefinitions ?? []).filter((vd) =>
    usedVars.has(vd.variable.name.value)
  );

  const subquery: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [{ ...reduced, variableDefinitions }, ...fragmentDefinitions],
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
