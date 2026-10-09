/**
 * Isolated-world content script — bridge.
 *
 * The MAIN-world interceptor cannot talk to the extension directly, and a
 * DevTools page cannot receive chrome.runtime messages from a content script.
 * So this script relays in both directions:
 *
 *   page → extension : captured GraphQL requests and responses
 *   extension → page : whether a DevTools panel is open, which is what gates
 *                      the interceptor. It stays dormant until told otherwise,
 *                      so nothing is captured while you browse other sites.
 *
 * Everything arriving from the page is untrusted: only known message types are
 * forwarded, and only the fields we expect are copied.
 */
const FORWARDED = new Set(['gql_request', 'gql_response']);

function setInterceptorActive(active: boolean) {
  window.postMessage(
    { __gqlInspectorControl: true, type: active ? 'activate' : 'deactivate' },
    '*'
  );
}

export default defineContentScript({
  matches: ['<all_urls>'],

  main() {
    // ── page → extension ────────────────────────────────────────────
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;

      const data = event.data;
      if (!data || data.__gqlInspector !== true) return;
      if (typeof data.type !== 'string' || !FORWARDED.has(data.type)) return;
      if (!data.payload || typeof data.payload !== 'object') return;

      try {
        chrome.runtime.sendMessage({ type: data.type, payload: data.payload });
      } catch {
        // Extension reloaded or context invalidated — nothing to do
      }
    });

    // ── extension → page ────────────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
      if (msg?.type === 'gql_activate') setInterceptorActive(true);
      else if (msg?.type === 'gql_deactivate') setInterceptorActive(false);
    });

    // The panel may already be open when this page loads — ask.
    try {
      chrome.runtime
        .sendMessage({ type: 'gql_panel_query' })
        .then((res: { active?: boolean } | undefined) => {
          if (res?.active) setInterceptorActive(true);
        })
        .catch(() => {
          // No service worker listening yet — stay dormant
        });
    } catch {
      // Extension context invalidated
    }
  },
});
