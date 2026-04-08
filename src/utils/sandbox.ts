/**
 * Validate and open a sandbox URL.
 */

const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function validateSandboxUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Build an Apollo Playground URL without the endpoint parameter.
 * For self-hosted playgrounds that already know their endpoint
 * (the sandbox URL IS the GraphQL endpoint) — adding ?endpoint=
 * would override it and cause errors.
 */
export function buildApolloPlaygroundUrl(
  sandboxBase: string,
  query: string,
  variables: Record<string, unknown> | null
): string {
  return (
    `${sandboxBase}` +
    `?document=${encodeURIComponent(query)}` +
    (variables
      ? `&variables=${encodeURIComponent(JSON.stringify(variables, null, 2))}`
      : '')
  );
}

/**
 * Build an Apollo Sandbox URL for the given query.
 * Uses the documented format: ?document=&endpoint=&variables=
 * Ref: https://www.apollographql.com/docs/graphos/explorer/sandbox
 */
export function buildApolloSandboxUrl(
  sandboxBase: string,
  query: string,
  variables: Record<string, unknown> | null,
  endpoint: string
): string {
  return (
    `${sandboxBase}` +
    `?document=${encodeURIComponent(query)}` +
    `&endpoint=${encodeURIComponent(endpoint)}` +
    (variables
      ? `&variables=${encodeURIComponent(JSON.stringify(variables, null, 2))}`
      : '')
  );
}

/**
 * Build a GraphiQL URL for the given query.
 * Uses encodeURIComponent so spaces are properly encoded as %20.
 */
export function buildGraphiQLUrl(
  sandboxBase: string,
  query: string,
  variables: Record<string, unknown> | null
): string {
  return (
    `${sandboxBase}` +
    `?query=${encodeURIComponent(query)}` +
    (variables
      ? `&variables=${encodeURIComponent(JSON.stringify(variables, null, 2))}`
      : '')
  );
}

/**
 * Open a URL safely in a new tab after validation.
 */
export function openInSandbox(url: string): void {
  if (!validateSandboxUrl(url)) {
    console.warn('[GraphQL Inspector] Blocked navigation to invalid URL:', url);
    return;
  }
  chrome.tabs.create({ url, active: true });
}
