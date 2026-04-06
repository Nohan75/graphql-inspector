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
 */
export function buildApolloSandboxUrl(
  sandboxBase: string,
  query: string,
  variables: Record<string, unknown> | null,
  endpoint: string
): string {
  const params = new URLSearchParams({
    endpoint,
    explorerURLState: JSON.stringify({
      document: query,
      variables: variables ? JSON.stringify(variables) : '',
      headers: '{}',
    }),
  });
  return `${sandboxBase}?${params.toString()}`;
}

/**
 * Build a GraphiQL URL for the given query.
 */
export function buildGraphiQLUrl(
  sandboxBase: string,
  query: string,
  variables: Record<string, unknown> | null
): string {
  const params = new URLSearchParams({
    query,
    variables: variables ? JSON.stringify(variables, null, 2) : '',
  });
  return `${sandboxBase}?${params.toString()}`;
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
