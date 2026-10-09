/**
 * Captured requests replayed into the panel preview.
 *
 * Each one stands for a case the panel has to display. Add a fixture when a
 * change needs a case that is not here yet.
 */
export interface Fixture {
  url: string;
  operationName: string | null;
  query: string;
  variables: Record<string, unknown> | null;
  /** Left out for a request that never gets its response */
  response?: { status: number; body: string };
}

const ENDPOINT = 'https://example.test/graphql';

export const fixtures: Fixture[] = [
  {
    // A query with variables, a directive, a union behind fragments and a
    // named fragment: every case the per-field sandbox button has to handle.
    url: ENDPOINT,
    operationName: 'Search',
    query: `
      query Search($text: String!, $withOrigin: Boolean!, $first: Int) {
        search(text: $text) {
          ... on Character {
            name
            origin @include(if: $withOrigin) { name }
            episode(first: $first) { name }
          }
          ...Place
        }
      }
      fragment Place on Location { name dimension }
    `,
    variables: { text: 'rick', withOrigin: true, first: 3, unusedHere: 'kept only by the whole query' },
    response: {
      status: 200,
      body: JSON.stringify({
        data: {
          search: [
            { name: 'Rick Sanchez', origin: { name: 'Earth (C-137)' }, episode: [{ name: 'Pilot' }] },
            { name: 'Citadel of Ricks', dimension: 'unknown' },
          ],
        },
      }),
    },
  },
  {
    url: ENDPOINT,
    operationName: 'Character',
    query: 'query Character($id: ID!) { character(id: $id) { name status } }',
    variables: { id: '1' },
    response: {
      status: 200,
      body: JSON.stringify({ data: { character: { name: 'Rick Sanchez', status: 'Alive' } } }),
    },
  },
  {
    // Same operation, other variables and answer: a pair for compare mode
    url: ENDPOINT,
    operationName: 'Character',
    query: 'query Character($id: ID!) { character(id: $id) { name status } }',
    variables: { id: '2' },
    response: {
      status: 200,
      body: JSON.stringify({ data: { character: { name: 'Morty Smith', status: 'Alive' } } }),
    },
  },
  {
    url: ENDPOINT,
    operationName: 'CreateReview',
    query: 'mutation CreateReview($stars: Int!) { createReview(stars: $stars) { id } }',
    variables: { stars: 5 },
    response: {
      status: 400,
      body: JSON.stringify({ errors: [{ message: 'Cannot query field "createReview" on type "Mutation".' }] }),
    },
  },
  {
    // A text that does not parse is still displayed, without sandbox buttons
    url: ENDPOINT,
    operationName: 'Broken',
    query: '\n    query Broken {\n      character(id: "1") {\n        name\n',
    variables: null,
    response: { status: 400, body: JSON.stringify({ errors: [{ message: 'Syntax Error: Expected Name, found <EOF>.' }] }) },
  },
  {
    // No response: stays pending
    url: ENDPOINT,
    operationName: 'Slow',
    query: 'query Slow { characters { name } }',
    variables: null,
  },
];
