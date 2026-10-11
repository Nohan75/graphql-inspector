import { describe, expect, it } from 'vitest';
import { collapseAll, expandTo, flattenJson, hiddenNodes, type JsonNode } from './jsonTree';

/** A line the way the tree displays it, indented by its depth */
const shown = (node: JsonNode) =>
  `${'  '.repeat(node.depth)}${node.label !== null ? `${node.label}: ` : ''}${node.valuePreview}`;

const document = {
  data: {
    name: 'Rick',
    tags: [true, null],
    origin: { name: 'Earth' },
    episodes: [],
  },
};

describe('the lines of a JSON value', () => {
  it('are one per value, plus a closing line for an object or an array that holds something', () => {
    expect(flattenJson(document).map(shown)).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '      0: true',
      '      1: null',
      '    ]',
      '    origin: {1}',
      '      name: "Earth"',
      '    }',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('are numbered from 1, and keyed by their position', () => {
    const nodes = flattenJson(document);

    expect(nodes.map((node) => node.lineNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(nodes.map((node) => node.key)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('can be collapsed where an object or an array holds something', () => {
    const collapsible = flattenJson(document)
      .filter((node) => node.isCollapsible)
      .map(shown);

    expect(collapsible).toEqual(['{1}', '  data: {4}', '    tags: [2]', '    origin: {1}']);
  });

  it('say, on a closing line, which line it closes', () => {
    const closing = flattenJson(document)
      .filter((node) => node.type === 'close')
      .map((node) => [node.lineNumber, node.closingFor]);

    // the closing line → the key of the line it closes: tags, origin, data, the root
    expect(closing).toEqual([
      [7, 3],
      [10, 7],
      [12, 1],
      [13, 0],
    ]);
  });

  it('are searched by their label and their value', () => {
    const nodes = flattenJson({ name: 'Rick', count: 3, alive: true, missing: null });

    expect(nodes.map((node) => node.searchText)).toEqual([
      '{',
      'name: "Rick"',
      'count: 3',
      'alive: true',
      'missing: null',
      '}',
    ]);
  });

  it('are a single one for a value that holds nothing', () => {
    expect(flattenJson('just text').map(shown)).toEqual(['"just text"']);
    expect(flattenJson(null).map(shown)).toEqual(['null']);
    expect(flattenJson({}).map(shown)).toEqual(['{}']);
  });
});

/** The key of the line that carries a label */
const keyOf = (nodes: JsonNode[], label: string) => {
  const node = nodes.find((candidate) => candidate.label === label);
  if (!node) throw new Error(`no line is labelled "${label}"`);
  return node.key;
};

/** The lines still displayed once the lines with these labels are collapsed */
function visibleWith(collapsedLabels: string[]) {
  const nodes = flattenJson(document);
  const hidden = hiddenNodes(nodes, new Set(collapsedLabels.map((label) => keyOf(nodes, label))));
  return nodes.filter((node) => !hidden.has(node.key)).map(shown);
}

describe('a collapsed line', () => {
  it('hides the lines it holds and its closing line', () => {
    expect(visibleWith(['origin'])).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '      0: true',
      '      1: null',
      '    ]',
      '    origin: {1}',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('hides the collapsed lines it holds along with the rest', () => {
    expect(visibleWith(['data', 'origin'])).toEqual(['{1}', '  data: {4}', '}']);
  });

  it('leaves every line displayed when there is none', () => {
    expect(visibleWith([])).toHaveLength(13);
  });
});

describe('collapsing everything', () => {
  /** The lines displayed for a value once everything is collapsed, then these labels expanded again */
  function visibleAfterCollapseAll(value: unknown, expandedLabels: string[] = []) {
    const nodes = flattenJson(value);
    const collapsed = collapseAll(nodes);
    expandedLabels.forEach((label) => collapsed.delete(keyOf(nodes, label)));
    const hidden = hiddenNodes(nodes, collapsed);
    return nodes.filter((node) => !hidden.has(node.key)).map(shown);
  }

  it('leaves the top level in sight: the first line stays expanded, the ones it holds are collapsed', () => {
    expect(visibleAfterCollapseAll({ data: document.data, errors: [{ message: 'Not found' }] })).toEqual([
      '{2}',
      '  data: {4}',
      '  errors: [1]',
      '}',
    ]);
  });

  it('collapses every level, so that expanding a line shows the next level collapsed', () => {
    expect(visibleAfterCollapseAll(document, ['data'])).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '    origin: {1}',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('does the same for a list at the top', () => {
    expect(visibleAfterCollapseAll([{ name: 'Rick' }, { name: 'Morty' }])).toEqual([
      '[2]',
      '  0: {1}',
      '  1: {1}',
      ']',
    ]);
  });

  it('collapses nothing in a value that holds nothing', () => {
    expect(collapseAll(flattenJson('just text')).size).toBe(0);
    expect(collapseAll(flattenJson({})).size).toBe(0);
  });
});

describe('expanding up to a line', () => {
  /** The lines displayed once everything is collapsed, then expanded up to the line found by `find` */
  function visibleAfterExpandingTo(find: (node: JsonNode) => boolean) {
    const nodes = flattenJson(document);
    const target = nodes.find(find);
    if (!target) throw new Error('no such line');
    const hidden = hiddenNodes(nodes, expandTo(nodes, collapseAll(nodes), target.key));
    return nodes.filter((node) => !hidden.has(node.key)).map(shown);
  }

  it('expands the collapsed lines that hold it, and leaves the others collapsed', () => {
    // the name of the origin, not the one of the character
    expect(visibleAfterExpandingTo((node) => node.searchText === 'name: "Earth"')).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '    origin: {1}',
      '      name: "Earth"',
      '    }',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('leaves a collapsed line collapsed when it is the one to show', () => {
    expect(visibleAfterExpandingTo((node) => node.label === 'origin')).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '    origin: {1}',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('expands a line to show its closing line', () => {
    const closingOfTags = (node: JsonNode) => node.type === 'close' && node.lineNumber === 7;

    expect(visibleAfterExpandingTo(closingOfTags)).toEqual([
      '{1}',
      '  data: {4}',
      '    name: "Rick"',
      '    tags: [2]',
      '      0: true',
      '      1: null',
      '    ]',
      '    origin: {1}',
      '    episodes: []',
      '  }',
      '}',
    ]);
  });

  it('gives the same collapsed lines back when the line is already displayed', () => {
    const nodes = flattenJson(document);
    const collapsed = new Set([keyOf(nodes, 'origin')]);

    expect(expandTo(nodes, collapsed, keyOf(nodes, 'tags'))).toBe(collapsed);
  });
});
