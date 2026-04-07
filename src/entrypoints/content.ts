/**
 * Runs in the ISOLATED world (has access to chrome.runtime).
 * Bridges window.postMessage events from the MAIN world interceptor
 * to the background service worker via chrome.runtime.sendMessage.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      if (!event.data?.__gqlInspector) return;
      if (event.data.type !== 'gql_pending') return;

      chrome.runtime
        .sendMessage({
          type: 'gql_pending',
          payload: {
            url: event.data.url,
            query: event.data.query,
            variables: event.data.variables,
            operationName: event.data.operationName,
            timestamp: event.data.timestamp,
          },
        })
        .catch(() => {
          // Background not ready yet – silently ignore
        });
    });
  },
});
