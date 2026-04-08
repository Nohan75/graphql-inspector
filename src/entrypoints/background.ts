/**
 * Service worker.
 *
 * Two responsibilities:
 *  1. Keep a port open with each DevTools panel (one per inspected tab).
 *  2. Use chrome.webRequest.onBeforeRequest to detect outgoing GraphQL
 *     requests BEFORE the response arrives, then forward them to the
 *     correct panel via the stored port.
 *
 * Why webRequest and not content-script postMessage?
 *   chrome.runtime.onMessage in a DevTools page does NOT receive messages
 *   from content scripts — that is a Chrome architectural constraint.
 *   webRequest runs in the service worker and is the only reliable way to
 *   observe request starts from the background.
 */

export default defineBackground(() => {
  /** tabId → port connected by the DevTools panel for that tab */
  const panelPorts = new Map<number, chrome.runtime.Port>();

  // ── 1. DevTools panel connects here on load ─────────────────────────
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'devtools-panel') return;

    let registeredTabId: number | null = null;

    port.onMessage.addListener((msg: { type: string; tabId?: number }) => {
      if (msg.type === 'init' && msg.tabId != null) {
        registeredTabId = msg.tabId;
        panelPorts.set(registeredTabId, port);
      }
    });

    port.onDisconnect.addListener(() => {
      if (registeredTabId != null) panelPorts.delete(registeredTabId);
    });
  });

  // ── 2. Intercept outgoing requests before any response arrives ───────
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      // Only POST requests from a real tab
      if (details.method !== 'POST') return;
      if (details.tabId < 0) return;

      const port = panelPorts.get(details.tabId);
      if (!port) return; // DevTools not open for this tab

      const raw = details.requestBody?.raw?.[0]?.bytes;
      if (!raw) return;

      let text: string;
      try {
        text = new TextDecoder('utf-8').decode(raw);
      } catch {
        return;
      }

      let gql: { query?: unknown; variables?: unknown; operationName?: unknown };
      try {
        gql = JSON.parse(text);
      } catch {
        return; // Not JSON
      }

      if (typeof gql.query !== 'string') return; // Not a GraphQL request

      try {
        port.postMessage({
          type: 'gql_pending',
          payload: {
            url: details.url,
            query: gql.query,
            variables: (gql.variables as Record<string, unknown>) ?? null,
            operationName: typeof gql.operationName === 'string'
              ? gql.operationName
              : null,
            timestamp: details.timeStamp,
          },
        });
      } catch {
        // Port closed between check and send
        panelPorts.delete(details.tabId);
      }
    },
    { urls: ['<all_urls>'] },
    ['requestBody']
  );
});
