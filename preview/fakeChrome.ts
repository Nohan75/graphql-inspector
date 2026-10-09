import { fixtures } from './fixtures';

/**
 * A stand-in for the part of the `chrome` API the panel uses, so the panel
 * can run in an ordinary page.
 *
 * It replays the fixtures the way the in-page interceptor reports real
 * traffic: a `gql_request` message, then a `gql_response` with the same id.
 * Nothing here is shipped: the extension build only takes `src/entrypoints`.
 */

/** Fired on `window` with the URL the panel asked to open in a new tab */
export const TAB_OPENED = 'preview:tab-opened';

type Listener = (message: unknown) => void;

function connect() {
  const listeners: Listener[] = [];
  let open = true;
  const emit = (message: unknown) => {
    if (open) listeners.forEach((listener) => listener(message));
  };

  return {
    name: 'devtools-panel',
    postMessage(message: { type?: string }) {
      if (message.type !== 'init') return;
      // Asynchronously, like a real port. A port closed in the meantime stays
      // silent, which is what React StrictMode's first mount relies on.
      setTimeout(() => {
        fixtures.forEach((fixture, index) => {
          const id = `fixture-${index + 1}`;
          emit({
            type: 'gql_request',
            payload: {
              id,
              url: fixture.url,
              query: fixture.query,
              variables: fixture.variables,
              operationName: fixture.operationName,
              requestHeaders: [
                { name: 'content-type', value: 'application/json' },
                { name: 'authorization', value: '[redacted by GraphQL Inspector]' },
              ],
              timestamp: Date.now(),
            },
          });
          if (fixture.response) {
            emit({
              type: 'gql_response',
              payload: {
                id,
                url: fixture.url,
                status: fixture.response.status,
                responseHeaders: [{ name: 'content-type', value: 'application/json' }],
                body: fixture.response.body,
              },
            });
          }
        });
      }, 0);
    },
    onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
    onDisconnect: { addListener: () => {} },
    disconnect() {
      open = false;
    },
  };
}

export function installFakeChrome() {
  const stored: Record<string, unknown> = {};
  const noEvents = { addListener: () => {}, removeListener: () => {} };

  const fake = {
    runtime: { connect },
    devtools: {
      inspectedWindow: { tabId: 1 },
      network: { onRequestFinished: noEvents, onNavigated: noEvents },
    },
    storage: {
      local: {
        get(keys: string[], callback: (items: Record<string, unknown>) => void) {
          callback(Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]])));
        },
        set(items: Record<string, unknown>) {
          Object.assign(stored, items);
        },
      },
    },
    tabs: {
      create({ url }: { url: string }) {
        window.dispatchEvent(new CustomEvent(TAB_OPENED, { detail: url }));
      },
    },
  };

  (globalThis as { chrome?: unknown }).chrome = fake;
}
