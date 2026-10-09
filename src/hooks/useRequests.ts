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
/** After this, a pending entry that never saw its response is given up on */
const PENDING_TIMEOUT = 30_000;
const PENDING_SWEEP_INTERVAL = 5_000;
/** getContent() does not always invoke its callback — don't wait forever */
const GET_CONTENT_TIMEOUT = 5_000;
/** Max gap between a webRequest pending and the interceptor's report of it */
const ATTACH_WINDOW = 2_000;
/** How long a resolved request stays eligible for a late header merge */
const RESOLVED_WINDOW = 5_000;

let requestIdCounter = 0;

/** Pending entry tracked for later correlation with a response */
interface PendingMeta {
  id: number;
  timestamp: number;
  /** Used to match the right pending entry when multiple requests share a URL */
  operationName: string;
  /**
   * Id minted by the in-page interceptor. When present, the response is
   * correlated exactly rather than by URL and operation name.
   */
  interceptorId?: string;
}

const resolvedKey = (url: string, operationName: string) =>
  `${url}|${operationName}`;

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useRequests(preserveLog: boolean) {
  const [requests, setRequests] = useState<GQLRequest[]>([]);
  const preserveLogRef = useRef(preserveLog);

  /**
   * url → list of pending request metas, in arrival order.
   * Used to match a finished response back to the right pending entry.
   */
  const pendingMapRef = useRef(new Map<string, PendingMeta[]>());

  /**
   * Recently resolved requests, so a second source reporting the same request
   * merges into the existing row instead of appending a duplicate.
   */
  const resolvedRef = useRef(new Map<string, { id: number; at: number }>());

  useEffect(() => {
    preserveLogRef.current = preserveLog;
  }, [preserveLog]);

  const clearRequests = useCallback(() => {
    setRequests([]);
    pendingMapRef.current.clear();
    resolvedRef.current.clear();
  }, []);

  /** Append a row, trimming the log to MAX_REQUESTS */
  const appendRequest = useCallback((entry: GQLRequest) => {
    setRequests((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_REQUESTS
        ? next.slice(next.length - MAX_REQUESTS)
        : next;
    });
  }, []);

  /** Remove a pending meta from the map by its row id */
  const dropPending = useCallback((url: string, rowId: number) => {
    const list = pendingMapRef.current.get(url);
    if (!list) return;
    const next = list.filter((p) => p.id !== rowId);
    if (next.length === 0) pendingMapRef.current.delete(url);
    else pendingMapRef.current.set(url, next);
  }, []);

  // ── webRequest pending, forwarded by the background ─────────────────
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
      const operationName =
        payload.operationName ?? parseOperationName(payload.query);
      const timestamp = Date.now();

      const list = pendingMapRef.current.get(payload.url) ?? [];
      pendingMapRef.current.set(payload.url, [
        ...list,
        { id, timestamp, operationName },
      ]);

      appendRequest({
        id,
        operationName,
        operationType: parseOperationType(payload.query),
        query: payload.query,
        variables: payload.variables,
        requestHeaders: [],
        responseHeaders: [],
        response: null,
        responseRaw: '',
        status: 0,
        url: payload.url,
        // The background sends chrome.webRequest's timeStamp; stamp locally
        // instead so the pending sweep compares two readings of one clock.
        timestamp,
        pending: true,
      });
    },
    [appendRequest]
  );

  // ── In-page interceptor: request start ──────────────────────────────
  // webRequest usually reports the same request first. When it did, attach
  // the interceptor's id to that row rather than adding a second one.
  const handleInterceptorRequest = useCallback(
    (payload: {
      id: string;
      url: string;
      query: string;
      variables: Record<string, unknown> | null;
      operationName: string | null;
      requestHeaders: Array<{ name: string; value: string }>;
      timestamp: number;
    }) => {
      if (!payload.query || payload.query.length > MAX_QUERY_LENGTH) return;

      const operationName =
        payload.operationName ?? parseOperationName(payload.query);
      const now = Date.now();
      const list = pendingMapRef.current.get(payload.url) ?? [];

      const existing = list.find(
        (p) =>
          p.interceptorId === undefined &&
          p.operationName === operationName &&
          now - p.timestamp < ATTACH_WINDOW
      );

      if (existing) {
        existing.interceptorId = payload.id;
        // Request headers are only known from inside the page
        if (payload.requestHeaders.length > 0) {
          setRequests((prev) =>
            prev.map((r) =>
              r.id === existing.id && r.requestHeaders.length === 0
                ? { ...r, requestHeaders: payload.requestHeaders }
                : r
            )
          );
        }
        return;
      }

      const id = ++requestIdCounter;
      pendingMapRef.current.set(payload.url, [
        ...list,
        { id, timestamp: now, operationName, interceptorId: payload.id },
      ]);

      appendRequest({
        id,
        operationName,
        operationType: parseOperationType(payload.query),
        query: payload.query,
        variables: payload.variables,
        requestHeaders: payload.requestHeaders,
        responseHeaders: [],
        response: null,
        responseRaw: '',
        status: 0,
        url: payload.url,
        timestamp: now,
        pending: true,
      });
    },
    [appendRequest]
  );

  // ── In-page interceptor: response ───────────────────────────────────
  const handleInterceptorResponse = useCallback(
    (payload: {
      id: string;
      url: string;
      status: number;
      responseHeaders: Array<{ name: string; value: string }>;
      body: string;
    }) => {
      // Exact correlation: find the pending meta carrying this interceptor id
      let match: PendingMeta | undefined;
      let matchUrl = '';
      pendingMapRef.current.forEach((list, url) => {
        if (match) return;
        const found = list.find((p) => p.interceptorId === payload.id);
        if (found) {
          match = found;
          matchUrl = url;
        }
      });
      if (!match) return; // row already resolved or swept

      const rowId = match.id;
      const operationName = match.operationName;
      dropPending(matchUrl, rowId);
      resolvedRef.current.set(resolvedKey(matchUrl, operationName), {
        id: rowId,
        at: Date.now(),
      });

      const responseRaw = (payload.body ?? '').slice(0, MAX_BODY_LENGTH);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                responseHeaders: payload.responseHeaders,
                response: parseBody(responseRaw),
                responseRaw,
                status: payload.status,
                pending: false,
                timedOut: false,
              }
            : r
        )
      );
    },
    [dropPending]
  );

  // ── Give up on pending entries whose response never arrived ─────────
  // Without this, one missed response leaves a row spinning forever, which is
  // indistinguishable from a genuinely hung request.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const staleIds: number[] = [];

      pendingMapRef.current.forEach((list, url) => {
        const kept = list.filter((p) => {
          if (now - p.timestamp > PENDING_TIMEOUT) {
            staleIds.push(p.id);
            return false;
          }
          return true;
        });
        if (kept.length === 0) pendingMapRef.current.delete(url);
        else if (kept.length !== list.length) pendingMapRef.current.set(url, kept);
      });

      resolvedRef.current.forEach((entry, key) => {
        if (now - entry.at > RESOLVED_WINDOW) resolvedRef.current.delete(key);
      });

      if (staleIds.length > 0) {
        setRequests((prev) =>
          prev.map((r) =>
            staleIds.includes(r.id)
              ? { ...r, pending: false, timedOut: true }
              : r
          )
        );
      }
    }, PENDING_SWEEP_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // ── Connect to background service worker via a named port ────────────
    // The background forwards both webRequest starts and the in-page
    // interceptor's captures over this port. We reconnect automatically if
    // the service worker restarts.
    const tabId = chrome.devtools.inspectedWindow.tabId;
    let port: chrome.runtime.Port | null = null;
    let closed = false;

    function connectPort() {
      if (closed) return;
      try {
        port = chrome.runtime.connect({ name: 'devtools-panel' });
        port.postMessage({ type: 'init', tabId });

        port.onMessage.addListener((msg: { type: string; payload: any }) => {
          if (msg.type === 'gql_pending') handlePendingMessage(msg.payload);
          else if (msg.type === 'gql_request') handleInterceptorRequest(msg.payload);
          else if (msg.type === 'gql_response') handleInterceptorResponse(msg.payload);
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

    /**
     * chrome.devtools.network fallback.
     *
     * Kept as a secondary source: it carries the real on-the-wire headers the
     * in-page interceptor cannot see. It is not relied upon, because the event
     * does not always fire and getContent() does not always call back.
     */
    function handleRequestFinished(
      request: chrome.devtools.network.Request
    ) {
      if (request.request.method !== 'POST') return;

      const url = request.request.url;
      const pendingList = pendingMapRef.current.get(url) ?? [];

      // postData.text is not always populated by Chrome (large or streamed
      // bodies). When it is missing we can still resolve a pending entry on
      // the same URL — it already carries the query captured at send time.
      const bodyText = request.request.postData?.text ?? '';
      const parsed = bodyText ? parseGraphQLBody(bodyText) : null;

      if (!parsed && pendingList.length === 0) return; // not a GraphQL request
      if (parsed && parsed.query.length > MAX_QUERY_LENGTH) return;

      const resolvedName = parsed
        ? parsed.operationName ?? parseOperationName(parsed.query)
        : null;

      // ── Match an existing pending entry ──
      // Primary key: operationName. When the body is unavailable we have no
      // name to match on, so fall back to FIFO on the same URL. With a name in
      // hand we never fall back: stealing a pending slot would pair one
      // operation's query with another's response.
      let bestIdx = -1;
      if (resolvedName !== null) {
        bestIdx = pendingList.findIndex((p) => p.operationName === resolvedName);
      } else if (pendingList.length > 0) {
        bestIdx = 0;
      }

      const reqHeaders = (request.request.headers ?? []).map((h) => ({
        name: h.name,
        value: h.value,
      }));
      const resHeaders = (request.response.headers ?? []).map((h) => ({
        name: h.name,
        value: h.value,
      }));
      const status = request.response.status;

      let targetId: number;

      if (bestIdx >= 0) {
        const meta = pendingList[bestIdx];
        targetId = meta.id;
        dropPending(url, targetId);
        resolvedRef.current.set(resolvedKey(url, meta.operationName), {
          id: targetId,
          at: Date.now(),
        });

        setRequests((prev) =>
          prev.map((r) =>
            r.id === targetId
              ? {
                  ...r,
                  requestHeaders: reqHeaders,
                  responseHeaders: resHeaders,
                  status,
                  pending: false,
                  timedOut: false,
                }
              : r
          )
        );
      } else {
        // Already resolved by the interceptor? Merge the real network headers
        // into that row instead of appending a duplicate.
        const recent =
          resolvedName !== null
            ? resolvedRef.current.get(resolvedKey(url, resolvedName))
            : undefined;

        if (recent && Date.now() - recent.at < RESOLVED_WINDOW) {
          setRequests((prev) =>
            prev.map((r) =>
              r.id === recent.id
                ? { ...r, requestHeaders: reqHeaders, responseHeaders: resHeaders }
                : r
            )
          );
          return; // body already captured in-page; nothing more to fetch
        }

        // Genuinely unseen request (DevTools opened after page load, …).
        // parsed is non-null here: the early return above guarantees it.
        const body = parsed!;
        targetId = ++requestIdCounter;
        appendRequest({
          id: targetId,
          operationName: resolvedName!,
          operationType: parseOperationType(body.query),
          query: body.query,
          variables: body.variables,
          requestHeaders: reqHeaders,
          responseHeaders: resHeaders,
          response: null,
          responseRaw: '',
          status,
          url,
          timestamp: Date.now(),
          pending: false,
        });
      }

      // ── Merge the response body in once it is available ──
      let settled = false;
      const applyBody = (raw: string) => {
        if (settled) return;
        settled = true;
        if (!raw) return; // nothing to merge; the row already shows its status

        const responseRaw = raw.slice(0, MAX_BODY_LENGTH);
        setRequests((prev) =>
          prev.map((r) =>
            // Never clobber a body the interceptor already captured
            r.id === targetId && !r.responseRaw
              ? { ...r, response: parseBody(responseRaw), responseRaw }
              : r
          )
        );
      };

      const bodyTimer = setTimeout(() => applyBody(''), GET_CONTENT_TIMEOUT);
      try {
        request.getContent((content) => {
          clearTimeout(bodyTimer);
          applyBody(content ?? '');
        });
      } catch {
        clearTimeout(bodyTimer);
        applyBody('');
      }
    }

    function handleNavigated() {
      if (!preserveLogRef.current) {
        setRequests([]);
        pendingMapRef.current.clear();
        resolvedRef.current.clear();
      }
    }

    chrome.devtools.network.onRequestFinished.addListener(
      handleRequestFinished
    );
    chrome.devtools.network.onNavigated.addListener(handleNavigated);

    return () => {
      closed = true;
      port?.disconnect();
      chrome.devtools.network.onRequestFinished.removeListener(
        handleRequestFinished
      );
      chrome.devtools.network.onNavigated.removeListener(handleNavigated);
    };
  }, [
    handlePendingMessage,
    handleInterceptorRequest,
    handleInterceptorResponse,
    appendRequest,
    dropPending,
  ]);

  return { requests, clearRequests };
}
