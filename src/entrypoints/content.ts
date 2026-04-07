/**
 * Isolated-world content script — no-op.
 *
 * Pending request detection is now handled entirely by
 * chrome.webRequest.onBeforeRequest in the background service worker,
 * which does not require any content-script message bridging.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // intentionally empty
  },
});
