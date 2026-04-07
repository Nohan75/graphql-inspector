/**
 * Service worker — kept minimal.
 * Message routing is handled directly in the DevTools panel via
 * chrome.runtime.onMessage, which receives content-script messages
 * without needing a background intermediary.
 */
export default defineBackground(() => {
  // No-op: the service worker just needs to exist so Chrome
  // delivers content-script messages to other extension contexts.
});
