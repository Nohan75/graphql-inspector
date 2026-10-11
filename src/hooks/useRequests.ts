import { useState, useEffect, useRef, useCallback } from 'react';
import type { GQLRequest } from '../types';
import { PANEL_PORT, type FromPanel, type Header, type ToPanel } from '../utils/captureProtocol';
import { createRequestLog } from '../utils/requestLog';
import { traced } from '../utils/trace';

/** How often the request log is told that time has passed */
const TICK_INTERVAL = 5_000;

const headers = (list: Array<{ name: string; value: string }> | undefined): Header[] =>
  (list ?? []).map(({ name, value }) => ({ name, value }));

/**
 * Connects the request log to its sources: the port to the background, the
 * DevTools network events and the clock. What the sources report is paired
 * in `src/utils/requestLog.ts`; nothing here decides which request is which.
 *
 * With `recordTrace`, what the sources report is also kept as a trace, which
 * `trace` gives: see `src/utils/trace.ts`.
 */
export function useRequests(preserveLog: boolean, recordTrace: boolean) {
  const [log] = useState(() => traced(createRequestLog()));
  const [requests, setRequests] = useState<GQLRequest[]>(log.requests);
  const preserveLogRef = useRef(preserveLog);

  useEffect(() => {
    preserveLogRef.current = preserveLog;
  }, [preserveLog]);

  // Before the sources are connected, so that nothing they report is missed
  useEffect(() => {
    log.record(recordTrace);
  }, [log, recordTrace]);

  /** What the sources reported since recording was turned on, or null when it is off */
  const trace = useCallback(() => log.trace(navigator.userAgent), [log]);

  const clearRequests = useCallback(() => {
    log.clear();
    setRequests(log.requests);
  }, [log]);

  useEffect(() => {
    // The log gives the same list back when nothing changed, which React
    // takes for no update.
    const publish = () => setRequests(log.requests);

    const ticking = setInterval(() => {
      log.tick(Date.now());
      publish();
    }, TICK_INTERVAL);

    // ── Connect to background service worker via a named port ────────────
    // The background forwards both webRequest starts and the in-page
    // interceptor's reports over this port. We reconnect automatically if
    // the service worker restarts.
    const tabId = chrome.devtools.inspectedWindow.tabId;
    let port: chrome.runtime.Port | null = null;
    let closed = false;

    function connectPort() {
      if (closed) return;
      try {
        port = chrome.runtime.connect({ name: PANEL_PORT });
        port.postMessage({ type: 'init', tabId } satisfies FromPanel);

        port.onMessage.addListener((message: ToPanel) => {
          log.receive(message, Date.now());
          publish();
        });

        // Service worker can restart (e.g. after Chrome update); reconnect.
        port.onDisconnect.addListener(() => {
          port = null;
          setTimeout(connectPort, 200);
        });
      } catch {
        // Extension context invalidated – stop retrying
      }
    }

    connectPort();

    // ── chrome.devtools.network, a secondary source ──────────────────────
    // It is not relied upon: the event does not always fire, and getContent()
    // does not always call back. The log stops waiting for a body by itself.
    function handleRequestFinished(request: chrome.devtools.network.Request) {
      const id = log.networkFinished(
        {
          method: request.request.method,
          url: request.request.url,
          postData: request.request.postData?.text ?? null,
          requestHeaders: headers(request.request.headers),
          responseHeaders: headers(request.response.headers),
          status: request.response.status,
          startedAt: Date.parse(request.startedDateTime),
          // A finished request is a HAR entry. Its total time starts when
          // the page issued the request: it counts the queueing that the
          // Time column of the Network panel leaves out. Its content size
          // is the one of the response body once decoded.
          duration: request.time,
          responseSize: request.response.content.size,
        },
        Date.now()
      );
      publish();
      if (id === null) return;

      try {
        request.getContent((content) => {
          log.networkBody(id, content ?? '', Date.now());
          publish();
        });
      } catch {
        // No body to be had: the request already shows its status
      }
    }

    function handleNavigated() {
      if (preserveLogRef.current) return;
      log.clear();
      publish();
    }

    chrome.devtools.network.onRequestFinished.addListener(handleRequestFinished);
    chrome.devtools.network.onNavigated.addListener(handleNavigated);

    return () => {
      closed = true;
      clearInterval(ticking);
      port?.disconnect();
      chrome.devtools.network.onRequestFinished.removeListener(handleRequestFinished);
      chrome.devtools.network.onNavigated.removeListener(handleNavigated);
    };
  }, [log]);

  return { requests, clearRequests, trace };
}
