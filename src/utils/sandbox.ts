import type { GQLRequest, Settings } from '../types';
import { parseQueryDocument, type Subquery } from './queryDocument';

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/** What a sandbox is given, each value ready to go in its URL */
interface Content {
  /** Text of the query document, or of one of its sub-queries */
  query: string;
  /** The variables as JSON, or null when there are none to pass */
  variables: string | null;
  /** URL of the captured request, which is the GraphQL endpoint */
  endpoint: string;
}

interface Format {
  /** What the settings call it */
  label: string;
  /** The URL parameters, in order. A null one is left out. */
  params(content: Content): Record<string, string | null>;
}

/**
 * The ways a sandbox reads a query from its URL. Adding one here is all it
 * takes: the settings list it and `SandboxFormat` accepts it.
 *
 * The keys are what the user's settings store, so renaming one loses that
 * choice.
 */
const FORMATS = {
  apollo: {
    // Ref: https://www.apollographql.com/docs/graphos/explorer/sandbox
    label: 'Apollo Studio — ?document= + &endpoint=',
    params: ({ query, endpoint, variables }) => ({ document: query, endpoint, variables }),
  },
  'apollo-no-endpoint': {
    // For a playground served by the GraphQL endpoint itself: it already
    // knows its endpoint, and an `endpoint` parameter would override it and
    // cause errors.
    label: 'Apollo Playground — ?document= (no endpoint)',
    params: ({ query, variables }) => ({ document: query, variables }),
  },
  graphiql: {
    label: 'GraphiQL — ?query= + &variables=',
    params: ({ query, variables }) => ({ query, variables }),
  },
} satisfies Record<string, Format>;

export type SandboxFormat = 'auto' | keyof typeof FORMATS;

/** The URL formats the settings offer, in the order they are listed */
export const SANDBOX_FORMATS: ReadonlyArray<{ id: SandboxFormat; label: string }> = [
  { id: 'auto', label: 'Auto-detect (apollographql → Apollo, otherwise GraphiQL)' },
  ...(Object.keys(FORMATS) as Array<keyof typeof FORMATS>).map((id) => ({
    id,
    label: FORMATS[id].label,
  })),
];

/** A sandbox URL is valid when it is an http or https address */
export function validateSandboxUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Opens a captured request in the user's sandbox, in a new tab: its whole
 * query document, or one of its sub-queries when one is given.
 *
 * Returns false, and opens nothing, when the sandbox URL is not valid.
 */
export function openInSandbox(
  { sandboxUrl, sandboxFormat }: Settings,
  request: Pick<GQLRequest, 'query' | 'variables' | 'url'>,
  subquery?: Subquery
): boolean {
  if (!validateSandboxUrl(sandboxUrl)) return false;

  const variables = subquery ? variablesOf(subquery, request.variables) : request.variables;
  const params = formatFor(sandboxUrl, sandboxFormat).params({
    query: subquery ? subquery.text : parseQueryDocument(request.query).text,
    variables: variables ? JSON.stringify(variables, null, 2) : null,
    endpoint: request.url,
  });

  // encodeURIComponent, so that spaces are encoded as %20
  const search = Object.entries(params)
    .filter((param): param is [string, string] => param[1] !== null)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');

  chrome.tabs.create({ url: withSearch(sandboxUrl, search), active: true });
  return true;
}

/**
 * Adds parameters to a URL that may carry some already, and a fragment:
 * after its own parameters, and before its fragment.
 */
function withSearch(url: string, search: string): string {
  const fragmentAt = url.indexOf('#');
  const base = fragmentAt < 0 ? url : url.slice(0, fragmentAt);
  const fragment = fragmentAt < 0 ? '' : url.slice(fragmentAt);

  // A `?` in the fragment is not a query string: only the part before counts
  const joint = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&';
  return `${base}${joint}${search}${fragment}`;
}

function formatFor(sandboxUrl: string, format: SandboxFormat): Format {
  if (format !== 'auto') return FORMATS[format];
  const isApollo = sandboxUrl.includes('apollographql') || sandboxUrl.includes('apollo.dev');
  return isApollo ? FORMATS.apollo : FORMATS.graphiql;
}

/**
 * Only the values the sub-query declares: the others would be noise in the
 * sandbox, and have no reason to travel in its URL.
 */
function variablesOf(
  subquery: Subquery,
  variables: Record<string, unknown> | null
): Record<string, unknown> | null {
  const used = Object.entries(variables ?? {}).filter(([name]) =>
    subquery.variableNames.includes(name)
  );
  return used.length > 0 ? Object.fromEntries(used) : null;
}
