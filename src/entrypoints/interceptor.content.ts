/**
 * Runs in the page's MAIN world (same JS context as the page).
 * Wraps window.fetch to detect outbound GraphQL requests at start time
 * and posts a message so the ISOLATED bridge can forward it to the extension.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN' as any,   // Chrome 111+ / MV3
  runAt: 'document_start',

  main() {
    if ((window as any).__gqlInspectorActive) return;
    (window as any).__gqlInspectorActive = true;

    const _fetch = window.fetch.bind(window);

    window.fetch = function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      // Determine URL & method without consuming the body
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;

      const method = (
        init?.method ??
        (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();

      if (method === 'POST' && typeof init?.body === 'string') {
        try {
          const gql = JSON.parse(init.body);
          if (typeof gql.query === 'string') {
            window.postMessage(
              {
                __gqlInspector: true,
                type: 'gql_pending',
                url,
                query: gql.query,
                variables: gql.variables ?? null,
                operationName: gql.operationName ?? null,
                timestamp: Date.now(),
              },
              '*'
            );
          }
        } catch {
          // Not a JSON / GraphQL request – ignore
        }
      }

      return _fetch(input, init);
    };
  },
});
