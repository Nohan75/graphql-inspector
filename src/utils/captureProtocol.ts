/**
 * The capture protocol: what the four extension contexts say to each other
 * while GraphQL requests are captured, and the one rule that makes a request
 * body a GraphQL one.
 *
 *   page, in-page interceptor
 *      │  window.postMessage      reports ↑   capture switch ↓
 *   content script
 *      │  chrome.runtime          reports ↑   capture switch ↓
 *   background
 *      │  PANEL_PORT              reports and pending requests ↑
 *   DevTools panel
 *
 * Every context imports this file, and so does the panel preview. It is
 * bundled into the in-page interceptor, which runs in every page: it stays
 * free of dependencies and of code that runs on import.
 */

// ── The rule ─────────────────────────────────────────────────────────────

/** The GraphQL fields of a request body */
export interface GraphQLBody {
  /** Text of the query document, never empty */
  query: string;
  variables: Record<string, unknown> | null;
  operationName: string | null;
}

/**
 * Reads a request body as a GraphQL request: a JSON object whose `query` is
 * a non-empty string. Null for anything else, which leaves out batches (a
 * JSON array) and persisted queries sent without a `query`.
 */
export function parseGraphQLBody(text: string | null | undefined): GraphQLBody | null {
  if (!text) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(body)) return null;

  const { query, variables, operationName } = body;
  if (typeof query !== 'string' || query === '') return null;
  return {
    query,
    variables: isObject(variables) ? variables : null,
    // An empty name is no name: the panel then reads one from the query document
    operationName: typeof operationName === 'string' && operationName !== '' ? operationName : null,
  };
}

// ── What is reported ─────────────────────────────────────────────────────

export interface Header {
  name: string;
  value: string;
}

/** What the in-page interceptor reports when a request leaves the page */
export interface RequestReport extends GraphQLBody {
  /** Minted by the interceptor. The response carries the same one. */
  id: string;
  /** Absolute, as the browser resolved it to send the request */
  url: string;
  /** The values of sensitive headers are redacted before they leave the page */
  requestHeaders: Header[];
  timestamp: number;
}

/** What the in-page interceptor reports when a request gets its response, or fails */
export interface ResponseReport {
  /** The id of the request it answers */
  id: string;
  url: string;
  /** 0 when the request failed before any response */
  status: number;
  responseHeaders: Header[];
  /** Empty when the interceptor could not read it */
  body: string;
}

/** A report of the in-page interceptor: a request left, or its response arrived */
export type InterceptorReport =
  | { type: 'gql_request'; payload: RequestReport }
  | { type: 'gql_response'; payload: ResponseReport };

/** A pending request, as the background sees it leave through chrome.webRequest */
export interface PendingRequest extends GraphQLBody {
  url: string;
  timestamp: number;
}

// ── Page ↔ content script, over window.postMessage ───────────────────────
// This is the page's own message bus: every script in the page can read it
// and post on it. What is read from it is checked field by field, and only
// the fields of the protocol are kept.

/** In-page interceptor → content script */
export function pageReport(report: InterceptorReport) {
  return { __gqlInspector: true, type: report.type, payload: report.payload };
}

/** The report a message of the page bus carries, or null when it is not one */
export function readPageReport(data: unknown): InterceptorReport | null {
  if (!isObject(data) || data.__gqlInspector !== true || !isObject(data.payload)) return null;

  if (data.type === 'gql_request') {
    const { id, url, query, variables, operationName, timestamp } = data.payload;
    const requestHeaders = readHeaders(data.payload.requestHeaders);
    if (typeof id !== 'string' || typeof url !== 'string' || typeof query !== 'string') return null;
    if (variables !== null && !isObject(variables)) return null;
    if (operationName !== null && typeof operationName !== 'string') return null;
    if (!requestHeaders || typeof timestamp !== 'number') return null;
    return {
      type: 'gql_request',
      payload: { id, url, query, variables, operationName, requestHeaders, timestamp },
    };
  }

  if (data.type === 'gql_response') {
    const { id, url, status, body } = data.payload;
    const responseHeaders = readHeaders(data.payload.responseHeaders);
    if (typeof id !== 'string' || typeof url !== 'string' || typeof status !== 'number') return null;
    if (!responseHeaders || typeof body !== 'string') return null;
    return { type: 'gql_response', payload: { id, url, status, responseHeaders, body } };
  }

  return null;
}

/** Content script → in-page interceptor: capture on or off */
export function pageCaptureSwitch(active: boolean) {
  return { __gqlInspectorControl: true, type: active ? 'activate' : 'deactivate' };
}

/** What a message of the page bus sets the capture switch to, or null when it is not one */
export function readPageCaptureSwitch(data: unknown): boolean | null {
  if (!isObject(data) || data.__gqlInspectorControl !== true) return null;
  if (data.type === 'activate') return true;
  if (data.type === 'deactivate') return false;
  return null;
}

// ── Content script ↔ background, over chrome.runtime ─────────────────────

/**
 * Content script → background: the reports to relay to the panel, and the
 * question a page asks when it loads, whether a panel already watches its tab.
 */
export type ToBackground = InterceptorReport | { type: 'gql_panel_query' };

/** The background's answer to `gql_panel_query` */
export interface PanelQueryAnswer {
  active: boolean;
}

/** Background → content script: capture on or off */
export type ToContentScript = { type: 'gql_activate' } | { type: 'gql_deactivate' };

// ── Background ↔ panel, over a port ──────────────────────────────────────

/** Name of the port a panel opens to the background */
export const PANEL_PORT = 'devtools-panel';

/** Panel → background: the tab this panel inspects */
export type FromPanel = { type: 'init'; tabId: number };

/** Background → panel */
export type ToPanel = InterceptorReport | { type: 'gql_pending'; payload: PendingRequest };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readHeaders(value: unknown): Header[] | null {
  if (!Array.isArray(value)) return null;
  const headers: Header[] = [];
  for (const header of value) {
    if (!isObject(header)) return null;
    const { name, value } = header;
    if (typeof name !== 'string' || typeof value !== 'string') return null;
    headers.push({ name, value });
  }
  return headers;
}
