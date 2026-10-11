/**
 * Isolated-world content script — bridge.
 *
 * The MAIN-world interceptor cannot talk to the extension directly, and a
 * DevTools page cannot receive chrome.runtime messages from a content script.
 * So this script relays in both directions:
 *
 *   page → extension : what the interceptor reports, requests and responses
 *   extension → page : the capture switch, on while a DevTools panel is open.
 *                      The interceptor stays dormant until told otherwise, so
 *                      nothing is captured while you browse other sites.
 *
 * Everything arriving from the page is untrusted: only the interceptor's
 * reports are forwarded, and only with the fields a report has. The capture
 * protocol does the reading.
 */
import {
  pageCaptureSwitch,
  readPageReport,
  type PanelQueryAnswer,
  type ToBackground,
  type ToContentScript,
} from '../utils/captureProtocol';

function setInterceptorActive(active: boolean) {
  window.postMessage(pageCaptureSwitch(active), '*');
}

export default defineContentScript({
  matches: ['<all_urls>'],

  main() {
    // ── page → extension ────────────────────────────────────────────
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;

      const report = readPageReport(event.data);
      if (!report) return;

      try {
        chrome.runtime.sendMessage(report satisfies ToBackground);
      } catch {
        // Extension reloaded or context invalidated — nothing to do
      }
    });

    // ── extension → page ────────────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg: ToContentScript | undefined) => {
      if (msg?.type === 'gql_activate') setInterceptorActive(true);
      else if (msg?.type === 'gql_deactivate') setInterceptorActive(false);
    });

    // The panel may already be open when this page loads — ask.
    try {
      chrome.runtime
        .sendMessage({ type: 'gql_panel_query' } satisfies ToBackground)
        .then((res: PanelQueryAnswer | undefined) => {
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
