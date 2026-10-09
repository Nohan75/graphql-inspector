import { describe, expect, it } from 'vitest';
import { buildSchema, parse, validate } from 'graphql';
import { parseQueryDocument } from './queryDocument';

const schema = buildSchema(`
  type Query {
    character(id: ID, filter: CharacterFilter): Character
    characters: [Character]
    search(text: String!): [SearchResult]
  }
  input CharacterFilter { ids: [ID!] }
  union SearchResult = Character | Location
  type Character {
    name: String
    status: String
    origin: Location
    episode(first: Int): [Episode]
  }
  type Location { name: String dimension: String }
  type Episode { name: String }
`);

const lines = (...parts: string[]) => parts.join('\n');

/** 1-based number of the first line of `text` that starts with `start` */
function lineOf(text: string, start: string): number {
  const index = text.split('\n').findIndex((l) => l.trim().startsWith(start));
  if (index < 0) throw new Error(`no line starts with "${start}"`);
  return index + 1;
}

function subqueryOf(source: string, start: string) {
  const doc = parseQueryDocument(source);
  return doc.subqueryAt(lineOf(doc.text, start));
}

describe('text of a query document', () => {
  it('is the query printed with standard spacing and indentation', () => {
    const doc = parseQueryDocument('query Q{character{name origin{name}}}');

    expect(doc.text).toBe(
      lines(
        'query Q {',
        '  character {',
        '    name',
        '    origin {',
        '      name',
        '    }',
        '  }',
        '}'
      )
    );
  });

  it('is the trimmed source when the query does not parse', () => {
    const doc = parseQueryDocument('  query Q {\n    character {\n');

    expect(doc.text).toBe('query Q {\n    character {');
  });
});

describe('field lines of a query document', () => {
  it('are the lines that start a field', () => {
    const doc = parseQueryDocument('query Q { character { name origin { name } } }');

    expect([...doc.fieldLines].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
  });

  it('include the fields reached through fragments', () => {
    const doc = parseQueryDocument(`
      query Q { character { ... on Character { status } ...Names } }
      fragment Names on Character { name }
    `);

    // character on line 2, status on line 4, name on line 11
    expect([...doc.fieldLines].sort((a, b) => a - b)).toEqual([2, 4, 11]);
  });

  it('are empty when the query does not parse', () => {
    const doc = parseQueryDocument('query Q { character {');

    expect(doc.fieldLines.size).toBe(0);
  });
});

describe('sub-query of a line', () => {
  it('keeps the field, everything beneath it and its parents', () => {
    const subquery = subqueryOf(
      'query Q { character { name origin { name dimension } status } }',
      'origin'
    );

    expect(subquery?.text).toBe(
      lines(
        'query Q {',
        '  character {',
        '    origin {',
        '      name',
        '      dimension',
        '    }',
        '  }',
        '}'
      )
    );
  });

  it('leaves the siblings of the field out', () => {
    const subquery = subqueryOf(
      'query Q { character { name origin { name dimension } status } }',
      'status'
    );

    expect(subquery?.text).toBe(lines('query Q {', '  character {', '    status', '  }', '}'));
  });

  it('declares only the variables it uses', () => {
    const source =
      'query Q($id: ID!, $first: Int) { character(id: $id) { name episode(first: $first) { name } } }';

    expect(subqueryOf(source, 'name')).toEqual({
      text: lines('query Q($id: ID!) {', '  character(id: $id) {', '    name', '  }', '}'),
      variableNames: ['id'],
    });
    expect(subqueryOf(source, 'episode')).toEqual({
      text: lines(
        'query Q($id: ID!, $first: Int) {',
        '  character(id: $id) {',
        '    episode(first: $first) {',
        '      name',
        '    }',
        '  }',
        '}'
      ),
      variableNames: ['id', 'first'],
    });
  });

  it('finds the variables nested in list and object arguments', () => {
    const subquery = subqueryOf(
      'query Q($id: ID!, $unused: Int) { character(filter: {ids: [$id]}) { name } }',
      'character'
    );

    expect(subquery?.variableNames).toEqual(['id']);
    expect(subquery?.text).toContain('query Q($id: ID!) {');
  });

  it('belongs to the operation that contains the line', () => {
    const subquery = subqueryOf(
      'query A { characters { name } } query B { characters { status } }',
      'status'
    );

    expect(subquery?.text).toBe(lines('query B {', '  characters {', '    status', '  }', '}'));
  });

  it('is null for a line that carries no field', () => {
    const doc = parseQueryDocument('query Q { character { name } }');

    expect(doc.subqueryAt(1)).toBeNull(); // query Q {
    expect(doc.subqueryAt(4)).toBeNull(); // closing brace
    expect(doc.subqueryAt(99)).toBeNull();
  });

  it('is null when the query does not parse', () => {
    const doc = parseQueryDocument('query Q { character {');

    expect(doc.subqueryAt(1)).toBeNull();
  });
});

describe('every sub-query of a valid query document is valid', () => {
  it.each([
    ['nested fields', 'query Q { character { name origin { name dimension } status } }'],
    [
      'variables in arguments',
      'query Q($id: ID!, $first: Int) { character(id: $id) { name episode(first: $first) { name } } }',
    ],
    [
      'variables in list and object arguments',
      'query Q($id: ID!) { character(filter: {ids: [$id]}) { name } all: characters { status } }',
    ],
    ['two operations', 'query A { characters { name } } query B { characters { status } }'],
  ])('%s', (_label, source) => {
    const doc = parseQueryDocument(source);
    expect(validate(schema, parse(doc.text)), 'the fixture itself').toEqual([]);
    expect(doc.fieldLines.size).toBeGreaterThan(0);

    for (const line of doc.fieldLines) {
      const subquery = doc.subqueryAt(line);
      expect(subquery, `line ${line}`).not.toBeNull();
      const errors = validate(schema, parse(subquery!.text)).map((e) => e.message);
      expect(errors, `line ${line}:\n${subquery!.text}`).toEqual([]);
    }
  });
});
