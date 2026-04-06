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
 * Build an Apollo Sandbox URL for the given query.
 * Uses the documented format: ?endpoint=&document=&variables=
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
    `?endpoint=${encodeURIComponent(endpoint)}` +
    `&document=${encodeURIComponent(query)}` +
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
