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
  /**
   * tabId → every port currently registered by a DevTools panel for that tab.
   *
   * A Set, not a single port: React StrictMode mounts the panel effect twice,
   * so a second port is opened before the first one's disconnect is delivered
   * here. Keying a single slot by tabId let the stale port's disconnect wipe
   * the live port's registration, after which no pending request was ever
   * forwarded. Each port now removes only itself.
   */
  const panelPorts = new Map<number, Set<chrome.runtime.Port>>();

  /**
   * Tell a tab's content scripts whether to capture.
   *
   * The in-page interceptor is dormant until this says otherwise, so the
   * extension captures nothing on the other sites you browse.
   */
  function setCapture(tabId: number, active: boolean) {
    chrome.tabs
      .sendMessage(tabId, { type: active ? 'gql_activate' : 'gql_deactivate' })
      .catch(() => {
        // No content script in that tab (chrome:// page, tab closed, …)
      });
  }

  function unregister(tabId: number, port: chrome.runtime.Port) {
    const ports = panelPorts.get(tabId);
    if (!ports) return;
    ports.delete(port);
    if (ports.size === 0) {
      panelPorts.delete(tabId);
      setCapture(tabId, false); // last panel for this tab closed
    }
  }

  // ── 1. DevTools panel connects here on load ─────────────────────────
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'devtools-panel') return;

    let registeredTabId: number | null = null;

    port.onMessage.addListener((msg: { type: string; tabId?: number }) => {
      if (msg.type === 'init' && msg.tabId != null) {
        registeredTabId = msg.tabId;
        const ports = panelPorts.get(registeredTabId) ?? new Set();
        ports.add(port);
        panelPorts.set(registeredTabId, ports);
        setCapture(registeredTabId, true);
      }
    });

    port.onDisconnect.addListener(() => {
      if (registeredTabId != null) unregister(registeredTabId, port);
    });
  });

  /** Relay a message to every panel watching a tab */
  function broadcast(tabId: number, message: unknown) {
    const ports = panelPorts.get(tabId);
    if (!ports || ports.size === 0) return;
    // Iterate a copy: unregister() mutates the Set on a failed send.
    for (const port of [...ports]) {
      try {
        port.postMessage(message);
      } catch {
        // Port closed between the check and the send — drop just this one,
        // never the whole tab, or a live panel loses its registration.
        unregister(tabId, port);
      }
    }
  }

  // ── 2. Relay captures from the in-page interceptor ──────────────────
  // The interceptor wraps fetch/XHR in the page and reports both the request
  // and its response body. This path is independent of chrome.devtools.network.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId == null) return;

    // A page that just loaded asks whether a panel is already watching it
    if (msg?.type === 'gql_panel_query') {
      sendResponse({ active: panelPorts.has(tabId) });
      return;
    }

    if (msg?.type !== 'gql_request' && msg?.type !== 'gql_response') return;
    broadcast(tabId, msg);
  });

  // ── 3. Intercept outgoing requests before any response arrives ───────
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      // Only POST requests from a real tab
      if (details.method !== 'POST') return;
      if (details.tabId < 0) return;

      const ports = panelPorts.get(details.tabId);
      if (!ports || ports.size === 0) return; // DevTools not open for this tab

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

      broadcast(details.tabId, {
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
    },
    { urls: ['<all_urls>'] },
    ['requestBody']
  );
});
