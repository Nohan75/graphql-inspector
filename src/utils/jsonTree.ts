/**
 * A JSON value laid out as a tree of lines: what the Response tab and the
 * variables of the Request tab display, collapse and search.
 */

/** One line of the tree */
export interface JsonNode {
  key: number;
  depth: number;
  /** Object key or array index. Null for the root and for a closing line. */
  label: string | null;
  valuePreview: string;
  isCollapsible: boolean;
  type: 'open' | 'close' | 'leaf';
  /** On a closing line: key of the node it closes */
  closingFor?: number;
  childCount?: number;
  lineNumber: number;
  /** The text of the line, as search matches it */
  searchText: string;
}

/** The lines of a JSON value, in the order they are displayed */
export function flattenJson(value: unknown): JsonNode[] {
  const nodes: JsonNode[] = [];
  buildJsonNodes(value, 0, null, nodes, { n: 1 });
  return nodes;
}

/**
 * The lines to collapse so that only the top level is left in sight: every
 * line that can be collapsed, the first one excepted. Each level is
 * collapsed, so expanding a line shows the next level still collapsed.
 */
export function collapseAll(nodes: JsonNode[]): Set<number> {
  return new Set(
    nodes.filter((node) => node.isCollapsible && node.depth > 0).map((node) => node.key)
  );
}

/**
 * Keys of the lines that collapsed lines hide: everything they hold, and
 * their closing line, which the collapsed line stands for.
 */
export function hiddenNodes(nodes: JsonNode[], collapsed: ReadonlySet<number>): Set<number> {
  const hidden = new Set<number>();
  // The collapsed lines we are inside of
  const inside: number[] = [];

  for (const node of nodes) {
    if (inside.length > 0) hidden.add(node.key);

    if (node.type === 'open' && node.isCollapsible && collapsed.has(node.key)) {
      inside.push(node.key);
    } else if (node.type === 'close' && inside[inside.length - 1] === node.closingFor) {
      inside.pop();
    }
  }

  return hidden;
}

function buildJsonNodes(
  value: unknown,
  depth: number,
  label: string | null,
  nodes: JsonNode[],
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
        buildJsonNodes(item, depth + 1, String(idx), nodes, lineCounter);
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
        buildJsonNodes(v, depth + 1, k, nodes, lineCounter);
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
