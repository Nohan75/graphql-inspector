import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInSandbox, SANDBOX_FORMATS, validateSandboxUrl, type SandboxFormat } from './sandbox';

const lines = (...parts: string[]) => parts.join('\n');

const SANDBOX = 'https://sandbox.test/explorer';

const request = {
  url: 'https://api.test/graphql',
  query: 'query Q($id: ID, $first: Int){user(id:$id){name posts(first:$first){title}}}',
  variables: { id: 1, first: 3 } as Record<string, unknown> | null,
};

/** `request.query`, normalised */
const DOCUMENT = lines(
  'query Q($id: ID, $first: Int) {',
  '  user(id: $id) {',
  '    name',
  '    posts(first: $first) {',
  '      title',
  '    }',
  '  }',
  '}'
);

/** `request.variables`, as indented JSON */
const VARIABLES = lines('{', '  "id": 1,', '  "first": 3', '}');

const settings = (sandboxFormat: SandboxFormat, sandboxUrl = SANDBOX) => ({ sandboxUrl, sandboxFormat });

/** The tabs the browser was asked to open, in order */
let tabs: Array<{ url: string; active?: boolean }>;

beforeEach(() => {
  tabs = [];
  // The part of the `chrome` API the module uses, the way the panel preview
  // stands in for it: the tab is recorded in place of being opened.
  vi.stubGlobal('chrome', {
    tabs: { create: (tab: { url: string; active?: boolean }) => tabs.push(tab) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The URL of the one tab opened, decoded so that it reads as text */
function openedUrl(): string {
  expect(tabs).toHaveLength(1);
  return decodeURIComponent(tabs[0].url);
}

describe('opening a captured request', () => {
  it('opens the sandbox in a new, active tab and says so', () => {
    const opened = openInSandbox(settings('graphiql'), request);

    expect(opened).toBe(true);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].active).toBe(true);
  });

  it('passes the query document normalised and the variables as indented JSON', () => {
    openInSandbox(settings('graphiql'), request);

    expect(openedUrl()).toBe(`${SANDBOX}?query=${DOCUMENT}&variables=${VARIABLES}`);
  });

  it('leaves the variables out when the request has none', () => {
    openInSandbox(settings('graphiql'), { ...request, variables: null });

    expect(openedUrl()).toBe(`${SANDBOX}?query=${DOCUMENT}`);
  });

  it('percent-encodes each value, so that none of them can add a parameter', () => {
    openInSandbox(settings('apollo'), {
      url: 'https://api.test/graphql?tenant=a&debug=1',
      query: '{ me }',
      variables: { name: 'b c' },
    });

    expect(tabs[0].url).toBe(
      'https://sandbox.test/explorer' +
        '?document=%7B%0A%20%20me%0A%7D' +
        '&endpoint=https%3A%2F%2Fapi.test%2Fgraphql%3Ftenant%3Da%26debug%3D1' +
        '&variables=%7B%0A%20%20%22name%22%3A%20%22b%20c%22%0A%7D'
    );
  });

  it('still opens a query document that does not parse', () => {
    openInSandbox(settings('graphiql'), { ...request, query: 'query Q { user {', variables: null });

    expect(openedUrl()).toBe(`${SANDBOX}?query=query Q { user {`);
  });
});

describe('URL format', () => {
  it('Apollo Studio passes the document, the endpoint of the captured request and the variables', () => {
    openInSandbox(settings('apollo'), request);

    expect(openedUrl()).toBe(
      `${SANDBOX}?document=${DOCUMENT}&endpoint=https://api.test/graphql&variables=${VARIABLES}`
    );
  });

  it('Apollo Playground passes the document and the variables, without the endpoint', () => {
    openInSandbox(settings('apollo-no-endpoint'), request);

    expect(openedUrl()).toBe(`${SANDBOX}?document=${DOCUMENT}&variables=${VARIABLES}`);
  });

  it('GraphiQL passes the query and the variables', () => {
    openInSandbox(settings('graphiql'), request);

    expect(openedUrl()).toBe(`${SANDBOX}?query=${DOCUMENT}&variables=${VARIABLES}`);
  });

  it.each([
    'https://studio.apollographql.com/sandbox/explorer',
    'https://sandbox.apollo.dev',
  ])('auto-detect takes %s for Apollo Studio', (sandboxUrl) => {
    openInSandbox(settings('auto', sandboxUrl), request);

    expect(openedUrl()).toBe(
      `${sandboxUrl}?document=${DOCUMENT}&endpoint=https://api.test/graphql&variables=${VARIABLES}`
    );
  });

  it('auto-detect takes any other URL for GraphiQL', () => {
    openInSandbox(settings('auto', 'http://localhost:4000/graphiql'), request);

    expect(openedUrl()).toBe(`http://localhost:4000/graphiql?query=${DOCUMENT}&variables=${VARIABLES}`);
  });

  it('is offered in the settings under the name it is stored by, auto-detect first', () => {
    expect(SANDBOX_FORMATS.map((format) => format.id)).toEqual([
      'auto',
      'apollo',
      'apollo-no-endpoint',
      'graphiql',
    ]);
  });
});

describe('opening one field of a captured request', () => {
  const subquery = {
    text: lines('query Q($id: ID) {', '  user(id: $id) {', '    name', '  }', '}'),
    variableNames: ['id'],
  };

  it('passes the sub-query in place of the whole query document', () => {
    openInSandbox(settings('graphiql'), { ...request, variables: null }, subquery);

    expect(openedUrl()).toBe(`${SANDBOX}?query=${subquery.text}`);
  });

  it('passes only the values of the variables the sub-query declares', () => {
    openInSandbox(settings('graphiql'), request, subquery);

    expect(openedUrl()).toBe(`${SANDBOX}?query=${subquery.text}&variables=${lines('{', '  "id": 1', '}')}`);
  });

  it('passes no variables when the sub-query declares none', () => {
    const plain = { text: lines('query Q {', '  viewer {', '    name', '  }', '}'), variableNames: [] };

    openInSandbox(settings('graphiql'), request, plain);

    expect(openedUrl()).toBe(`${SANDBOX}?query=${plain.text}`);
  });
});

describe('a sandbox URL that is not valid', () => {
  it.each(['', 'sandbox.test/explorer', 'javascript:alert(1)', 'file:///etc/hosts'])(
    'opens nothing for "%s" and says so',
    (sandboxUrl) => {
      const opened = openInSandbox(settings('auto', sandboxUrl), request);

      expect(opened).toBe(false);
      expect(tabs).toEqual([]);
    }
  );

  it('is anything but an http or https address', () => {
    expect(validateSandboxUrl('https://sandbox.test/explorer')).toBe(true);
    expect(validateSandboxUrl('http://localhost:4000/graphiql')).toBe(true);
    expect(validateSandboxUrl('')).toBe(false);
    expect(validateSandboxUrl('sandbox.test/explorer')).toBe(false);
    expect(validateSandboxUrl('javascript:alert(1)')).toBe(false);
    expect(validateSandboxUrl('chrome://settings')).toBe(false);
  });
});
