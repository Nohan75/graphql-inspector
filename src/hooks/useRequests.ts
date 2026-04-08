import { useState, useEffect, useRef, useCallback } from 'react';
import type { GQLRequest } from '../types';
import {
  parseGraphQLBody,
  parseOperationType,
  parseOperationName,
} from '../utils/graphql';

const MAX_REQUESTS = 500;
const MAX_QUERY_LENGTH = 500_000;   // 500 KB
const MAX_BODY_LENGTH  = 2_000_000; // 2 MB
const PENDING_MATCH_WINDOW = 30_000; // 30 s — max time between intercept and finish

let requestIdCounter = 0;

/** Pending entry tracked for later correlation with onRequestFinished */
interface PendingMeta {
  id: number;
  timestamp: number;
  /** Used to match the right pending entry when multiple requests share the same URL */
  operationName: string;
}

export function useRequests(preserveLog: boolean) {
  const [requests, setRequests] = useState<GQLRequest[]>([]);
  const preserveLogRef = useRef(preserveLog);

  /**
   * url → list of pending request metas, in arrival order.
   * Used to match an onRequestFinished event back to the right pending entry.
   */
  const pendingMapRef = useRef(new Map<string, PendingMeta[]>());

  useEffect(() => {
    preserveLogRef.current = preserveLog;
  }, [preserveLog]);

  const clearRequests = useCallback(() => {
    setRequests([]);
    pendingMapRef.current.clear();
  }, []);

  // ── Handle a pending request arriving from the content script ───────
  const handlePendingMessage = useCallback(
    (payload: {
      url: string;
      query: string;
      variables: Record<string, unknown> | null;
      operationName: string | null;
      timestamp: number;
    }) => {
      if (!payload.query || payload.query.length > MAX_QUERY_LENGTH) return;

      const id = ++requestIdCounter;
      const entry: GQLRequest = {
        id,
        operationName:
          payload.operationName ??
          parseOperationName(payload.query) ??
          'Anonymous',
        operationType: parseOperationType(payload.query),
        query: payload.query,
        variables: payload.variables,
        requestHeaders: [],
        responseHeaders: [],
        response: null,
        responseRaw: '',
        status: 0,
        url: payload.url,
        timestamp: payload.timestamp,
        pending: true,
      };

      // Track for later correlation
      const list = pendingMapRef.current.get(payload.url) ?? [];
      pendingMapRef.current.set(payload.url, [
        ...list,
        { id, timestamp: payload.timestamp, operationName: entry.operationName },
      ]);

      setRequests((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_REQUESTS
          ? next.slice(next.length - MAX_REQUESTS)
          : next;
      });
    },
    []
  );

  useEffect(() => {
    // ── Connect to background service worker via a named port ────────────
    // The background uses chrome.webRequest.onBeforeRequest to detect
    // request starts and forwards them here via this port.
    // We reconnect automatically if the service worker restarts.
    const tabId = chrome.devtools.inspectedWindow.tabId;
    let port: chrome.runtime.Port | null = null;

    function connectPort() {
      try {
        port = chrome.runtime.connect({ name: 'devtools-panel' });
        port.postMessage({ type: 'init', tabId });

        port.onMessage.addListener(
          (msg: { type: string; payload: unknown }) => {
            if (msg.type === 'gql_pending') {
              handlePendingMessage(
                msg.payload as Parameters<typeof handlePendingMessage>[0]
              );
            }
          }
        );

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

    // ── onRequestFinished — update pending entry or create a new one ────
    function handleRequestFinished(
      request: chrome.devtools.network.Request
    ) {
      if (request.request.method !== 'POST') return;

      const postData = request.request.postData;
      if (!postData?.text) return;

      const parsed = parseGraphQLBody(postData.text);
      if (!parsed) return;

      const { query, variables, operationName } = parsed;
      if (query.length > MAX_QUERY_LENGTH) return;

      request.getContent((body) => {
        let response: unknown = null;
        const responseRaw = (body ?? '').slice(0, MAX_BODY_LENGTH);
        try {
          response = JSON.parse(responseRaw);
        } catch {
          response = null;
        }

        const url        = request.request.url;
        const finishTime = Date.now();
        const reqHeaders = (request.request.headers ?? []).map((h) => ({
          name: h.name,
          value: h.value,
        }));
        const resHeaders = (request.response.headers ?? []).map((h) => ({
          name: h.name,
          value: h.value,
        }));
        const status = request.response.status;

        // ── Try to match an existing pending entry ──
        // Primary key: operationName — reliable even when responses arrive
        // out of order (multiple requests to the same GraphQL endpoint).
        // Fallback: FIFO within the same window when names clash.
        const resolvedName =
          operationName ?? parseOperationName(query) ?? 'Anonymous';
        const pendingList = pendingMapRef.current.get(url) ?? [];

        // 1st pass — match by operationName (exact, within time window)
        let bestIdx = pendingList.findIndex((p) => {
          const diff = finishTime - p.timestamp;
          return (
            diff >= 0 &&
            diff < PENDING_MATCH_WINDOW &&
            p.operationName === resolvedName
          );
        });

        // 2nd pass — FIFO fallback (same name used multiple times simultaneously)
        if (bestIdx < 0) {
          bestIdx = pendingList.findIndex((p) => {
            const diff = finishTime - p.timestamp;
            return diff >= 0 && diff < PENDING_MATCH_WINDOW;
          });
        }

        if (bestIdx >= 0) {
          // Update the matched pending request with the real response
          const { id } = pendingList[bestIdx];
          const newList = pendingList.filter((_, i) => i !== bestIdx);
          if (newList.length === 0) {
            pendingMapRef.current.delete(url);
          } else {
            pendingMapRef.current.set(url, newList);
          }

          setRequests((prev) =>
            prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    requestHeaders: reqHeaders,
                    responseHeaders: resHeaders,
                    response,
                    responseRaw,
                    status,
                    pending: false,
                  }
                : r
            )
          );
        } else {
          // No pending match — content script missed it (page loaded before
          // DevTools, CSP blocked the interceptor, etc.). Create new entry.
          const id = ++requestIdCounter;
          const entry: GQLRequest = {
            id,
            operationName:
              operationName ?? parseOperationName(query) ?? 'Anonymous',
            operationType: parseOperationType(query),
            query,
            variables,
            requestHeaders: reqHeaders,
            responseHeaders: resHeaders,
            response,
            responseRaw,
            status,
            url,
            timestamp: Date.now(),
            pending: false,
          };
          setRequests((prev) => {
            const next = [...prev, entry];
            return next.length > MAX_REQUESTS
              ? next.slice(next.length - MAX_REQUESTS)
              : next;
          });
        }
      });
    }

    function handleNavigated() {
      if (!preserveLogRef.current) {
        setRequests([]);
        pendingMapRef.current.clear();
      }
    }

    chrome.devtools.network.onRequestFinished.addListener(
      handleRequestFinished
    );
    chrome.devtools.network.onNavigated.addListener(handleNavigated);

    return () => {
      port?.disconnect();
      chrome.devtools.network.onRequestFinished.removeListener(
        handleRequestFinished
      );
      chrome.devtools.network.onNavigated.removeListener(handleNavigated);
    };
  }, [handlePendingMessage]);

  return { requests, clearRequests };
}
