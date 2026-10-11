import type { GQLRequest } from '../types';
import {
  parseGraphQLBody,
  type Header,
  type PendingRequest,
  type RequestReport,
  type ResponseReport,
  type ToPanel,
} from './captureProtocol';
import { parseOperationName, parseOperationType } from './graphql';

/** The log keeps the most recent captured requests */
const MAX_REQUESTS = 500;
const MAX_QUERY_LENGTH = 500_000; // 500 KB
const MAX_BODY_LENGTH = 2_000_000; // 2 MB
/** A pending request that has waited longer than this is given up on */
const PENDING_TIMEOUT = 30_000;
/** How long after the background reported a request the interceptor's report still joins it */
const ATTACH_WINDOW = 2_000;
/** How long a completed request still takes the headers DevTools brings, rather than being listed again */
const RESOLVED_WINDOW = 5_000;
/** How long DevTools has to give a response body: it does not always answer */
const BODY_WINDOW = 5_000;
/** How far the time a request is first reported can be from the time DevTools says it started */
const START_WINDOW = 2_000;

/** A request DevTools reports as finished, reduced to what the log reads of it */
export interface FinishedRequest {
  method: string;
  url: string;
  /** Text of the request body. DevTools does not always have it: large or streamed bodies. */
  postData: string | null;
  /** The headers as they went on the wire, which the page cannot see */
  requestHeaders: Header[];
  responseHeaders: Header[];
  status: number;
  /** When the request started, in milliseconds since the epoch. NaN when DevTools does not say. */
  startedAt: number;
  /**
   * How long the request took, in milliseconds, from when the page issued
   * it: the wait before it went on the network included. NaN when DevTools
   * does not say.
   */
  duration: number;
  /** Size in bytes of the response body, uncompressed. NaN when DevTools does not say. */
  responseSize: number;
}

/**
 * The captured requests of the inspected tab, as the panel lists them.
 *
 * Three sources report the same request: the background when it leaves, the
 * in-page interceptor when it leaves and when its response arrives, and
 * DevTools when it has finished. The log pairs their reports, so that a
 * request is listed once, and holds the timing rules that pairing needs. It
 * reads no clock: every report comes with the time it is received at.
 *
 * Two sources measure how long a request took and how big its response is:
 * the interceptor, from inside the page, and DevTools, on the network. The
 * ones DevTools measured are kept when it reports the request, the page's
 * otherwise. The times the reports are received at are not a measure: they
 * include the time a report takes to reach the panel.
 */
export interface RequestLog {
  /** The captured requests, oldest first. A new list whenever one of them changes. */
  readonly requests: GQLRequest[];
  /** What the background and the in-page interceptor report, as it arrives on the panel's port */
  receive(message: ToPanel, now: number): void;
  /**
   * What DevTools reports when a request has finished. Returns the id of the
   * captured request whose response body is to be asked of DevTools, or null
   * when there is none to ask for.
   */
  networkFinished(request: FinishedRequest, now: number): number | null;
  /** The response body DevTools gave for the captured request `networkFinished` named */
  networkBody(id: number, body: string, now: number): void;
  /** Time has passed: gives up on the pending requests that have waited too long */
  tick(now: number): void;
  clear(): void;
}

/** A pending request, as the log waits for its response */
interface Pending {
  id: number;
  since: number;
  /** What tells it from the other pending requests of the same URL */
  operationName: string;
  /**
   * Id of the interceptor's report, once one has joined. The response is
   * then paired by that id, not by URL and operation.
   */
  reportId?: string;
}

const completedKey = (url: string, operationName: string) => `${url}|${operationName}`;

/**
 * The duration and the response size a source measured, without the one it
 * did not measure: a source says so with null or with something that is not
 * a number, zero or more.
 */
function measured(duration: number | null, responseSize: number | null) {
  const isMeasure = (value: number | null): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  return {
    ...(isMeasure(duration) ? { duration } : null),
    ...(isMeasure(responseSize) ? { responseSize } : null),
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createRequestLog(): RequestLog {
  let requests: GQLRequest[] = [];
  /** Not reset by `clear`, so that an id never names two captured requests */
  let lastId = 0;

  /** URL → the pending requests sent to it, oldest first */
  const pending = new Map<string, Pending[]>();
  /**
   * Recently completed requests, so that a second source reporting the same
   * request brings its headers to it instead of being listed again.
   */
  const completed = new Map<string, { id: number; at: number }>();
  /** Captured requests whose body was asked of DevTools → when it was asked */
  const awaitingBody = new Map<number, number>();
  /** Captured requests DevTools has reported: it reports a request once */
  const reportedByNetwork = new Set<number>();
  /**
   * Id of an interceptor's report → the captured request it joined, for the
   * requests that stopped being pending before the interceptor reported
   * their response: completed by DevTools, or given up on. That response
   * can still bring what they lack.
   */
  const awaitingReport = new Map<string, number>();

  function add(request: Omit<GQLRequest, 'id'>): number {
    const id = ++lastId;
    const next = [...requests, { id, ...request }];
    requests = next.length > MAX_REQUESTS ? next.slice(next.length - MAX_REQUESTS) : next;
    return id;
  }

  /** Changes one captured request. A null patch leaves it, and the list, as they are. */
  function change(id: number, patch: (request: GQLRequest) => Partial<GQLRequest> | null) {
    let changed = false;
    const next = requests.map((request) => {
      const fields = request.id === id ? patch(request) : null;
      if (!fields) return request;
      changed = true;
      return { ...request, ...fields };
    });
    if (changed) requests = next;
  }

  function wait(url: string, entry: Pending) {
    pending.set(url, [...(pending.get(url) ?? []), entry]);
  }

  /** A pending request has its response: it stops waiting and counts as completed */
  function complete(url: string, entry: Pending, now: number) {
    const rest = (pending.get(url) ?? []).filter((other) => other.id !== entry.id);
    if (rest.length === 0) pending.delete(url);
    else pending.set(url, rest);
    completed.set(completedKey(url, entry.operationName), { id: entry.id, at: now });
  }

  // ── The background: a request leaves, seen through chrome.webRequest ──
  function pendingReported(report: PendingRequest, now: number) {
    if (!report.query || report.query.length > MAX_QUERY_LENGTH) return;

    const operationName = report.operationName ?? parseOperationName(report.query);
    const id = add({
      operationName,
      operationType: parseOperationType(report.query),
      query: report.query,
      variables: report.variables,
      requestHeaders: [],
      responseHeaders: [],
      response: null,
      responseRaw: '',
      status: 0,
      url: report.url,
      // The time the report is received at, not the one it carries: giving
      // up compares two readings of the same clock.
      timestamp: now,
      pending: true,
    });
    wait(report.url, { id, since: now, operationName });
  }

  // ── The in-page interceptor: the same request leaves ──
  // The background usually reports it first. When it did, the interceptor's
  // report joins that pending request rather than being listed as a second one.
  function requestReported(report: RequestReport, now: number) {
    if (!report.query || report.query.length > MAX_QUERY_LENGTH) return;

    const operationName = report.operationName ?? parseOperationName(report.query);
    const joined = (pending.get(report.url) ?? []).find(
      (entry) =>
        entry.reportId === undefined &&
        entry.operationName === operationName &&
        now - entry.since < ATTACH_WINDOW
    );

    if (joined) {
      joined.reportId = report.id;
      // Request headers are only known from inside the page
      if (report.requestHeaders.length > 0) {
        change(joined.id, (request) =>
          request.requestHeaders.length === 0 ? { requestHeaders: report.requestHeaders } : null
        );
      }
      return;
    }

    const id = add({
      operationName,
      operationType: parseOperationType(report.query),
      query: report.query,
      variables: report.variables,
      requestHeaders: report.requestHeaders,
      responseHeaders: [],
      response: null,
      responseRaw: '',
      status: 0,
      url: report.url,
      timestamp: now,
      pending: true,
    });
    wait(report.url, { id, since: now, operationName, reportId: report.id });
  }

  // ── The in-page interceptor: the response arrives ──
  // Paired by the id the interceptor minted, never by URL.
  function responseReported(report: ResponseReport, now: number) {
    for (const [url, waiting] of pending) {
      const entry = waiting.find((candidate) => candidate.reportId === report.id);
      if (!entry) continue;

      complete(url, entry, now);
      const responseRaw = report.body.slice(0, MAX_BODY_LENGTH);
      change(entry.id, () => ({
        responseHeaders: report.responseHeaders,
        response: parseJson(responseRaw),
        responseRaw,
        status: report.status,
        pending: false,
        timedOut: false,
        ...measured(report.duration, report.size),
      }));
      return;
    }

    // Nothing pending under that id: the request stopped waiting before its
    // response was reported.
    const id = awaitingReport.get(report.id);
    if (id === undefined) return;
    awaitingReport.delete(report.id);
    const request = requests.find((candidate) => candidate.id === id);
    if (!request) return;
    const responseRaw = report.body.slice(0, MAX_BODY_LENGTH);

    if (request.timedOut) {
      // Given up on: a response that comes after all still completes it
      completed.set(completedKey(request.url, request.operationName), { id, at: now });
      change(id, () => ({
        responseHeaders: report.responseHeaders,
        response: parseJson(responseRaw),
        responseRaw,
        status: report.status,
        timedOut: false,
        ...measured(report.duration, report.size),
      }));
    } else {
      // Completed by DevTools, which does not always give a body, and may
      // not have measured the request: what the page has is news for what
      // the request lacks, and for that only.
      const { duration, responseSize } = measured(report.duration, report.size);
      const news: Partial<GQLRequest> = {
        ...(!request.responseRaw && responseRaw ? { response: parseJson(responseRaw), responseRaw } : null),
        ...(request.duration === undefined && duration !== undefined ? { duration } : null),
        ...(request.responseSize === undefined && responseSize !== undefined ? { responseSize } : null),
      };
      if (Object.keys(news).length > 0) change(id, () => news);
    }
  }

  /** DevTools completes a pending request, and its body is asked for */
  function completeFromNetwork(entry: Pending, finished: FinishedRequest, now: number): number {
    complete(finished.url, entry, now);
    if (entry.reportId !== undefined) awaitingReport.set(entry.reportId, entry.id);
    change(entry.id, () => ({
      requestHeaders: finished.requestHeaders,
      responseHeaders: finished.responseHeaders,
      status: finished.status,
      pending: false,
      timedOut: false,
      ...measured(finished.duration, finished.responseSize),
    }));
    awaitingBody.set(entry.id, now);
    reportedByNetwork.add(entry.id);
    return entry.id;
  }

  /**
   * DevTools reports a request that is no longer pending: its headers are
   * news, and so is what it measured, which replaces what the page did. Its
   * status is news too when the request was given up on, and its body when
   * the request has none.
   */
  function bringFromNetwork(id: number, finished: FinishedRequest, now: number): number | null {
    const request = requests.find((candidate) => candidate.id === id);
    if (!request) return null;
    reportedByNetwork.add(id);

    if (request.timedOut) {
      completed.set(completedKey(request.url, request.operationName), { id, at: now });
    }
    change(id, () => ({
      requestHeaders: finished.requestHeaders,
      responseHeaders: finished.responseHeaders,
      ...(request.timedOut ? { status: finished.status, timedOut: false } : null),
      ...measured(finished.duration, finished.responseSize),
    }));

    if (request.responseRaw) return null;
    awaitingBody.set(id, now);
    return id;
  }

  /**
   * The request DevTools reports, when the log already lists it and it is
   * no longer pending: the one of the same URL and operation that was first
   * reported closest to the time DevTools says the request started. DevTools
   * can report long after the other sources, and after a request was given
   * up on, so the time its report arrives at tells nothing.
   */
  function startedAsReported(finished: FinishedRequest, operationName: string): GQLRequest | undefined {
    let closest: GQLRequest | undefined;
    let gap = START_WINDOW;
    for (const request of requests) {
      if (request.pending || reportedByNetwork.has(request.id)) continue;
      if (request.url !== finished.url || request.operationName !== operationName) continue;
      const distance = Math.abs(request.timestamp - finished.startedAt);
      if (distance < gap) {
        closest = request;
        gap = distance;
      }
    }
    return closest;
  }

  return {
    get requests() {
      return requests;
    },

    receive(message, now) {
      if (message.type === 'gql_pending') pendingReported(message.payload, now);
      else if (message.type === 'gql_request') requestReported(message.payload, now);
      else if (message.type === 'gql_response') responseReported(message.payload, now);
    },

    // DevTools is a secondary source: it carries the headers that went on the
    // wire, which the page cannot see, but it does not report every request.
    networkFinished(finished, now) {
      if (finished.method !== 'POST') return null;

      const waiting = pending.get(finished.url) ?? [];

      if (!finished.postData) {
        // Without a request body there is no operation to match on. The
        // oldest pending request of the URL is taken for it: it already
        // carries the query captured when it left. With nothing pending,
        // this is not a GraphQL request.
        const oldest = waiting[0];
        return oldest ? completeFromNetwork(oldest, finished, now) : null;
      }

      // A request body that is there and is not GraphQL is another request
      // sent to the same URL: it completes nothing.
      const body = parseGraphQLBody(finished.postData);
      if (!body || body.query.length > MAX_QUERY_LENGTH) return null;

      // With an operation in hand, never fall back to the oldest: that would
      // pair one operation's query with another's response.
      const operationName = body.operationName ?? parseOperationName(body.query);
      const entry = waiting.find((candidate) => candidate.operationName === operationName);
      if (entry) return completeFromNetwork(entry, finished, now);

      // Already listed and no longer pending? Then it is not listed again.
      const earlier = startedAsReported(finished, operationName);
      if (earlier) return bringFromNetwork(earlier.id, finished, now);

      // The same, for when DevTools does not say when the request started:
      // a request of that operation completed a moment ago is taken for it.
      const recent = completed.get(completedKey(finished.url, operationName));
      if (recent && now - recent.at < RESOLVED_WINDOW) {
        return bringFromNetwork(recent.id, finished, now);
      }

      // A request no other source reported: DevTools opened after it left, …
      const id = add({
        operationName,
        operationType: parseOperationType(body.query),
        query: body.query,
        variables: body.variables,
        requestHeaders: finished.requestHeaders,
        responseHeaders: finished.responseHeaders,
        response: null,
        responseRaw: '',
        status: finished.status,
        url: finished.url,
        timestamp: now,
        pending: false,
        ...measured(finished.duration, finished.responseSize),
      });
      awaitingBody.set(id, now);
      reportedByNetwork.add(id);
      return id;
    },

    networkBody(id, body, now) {
      const askedAt = awaitingBody.get(id);
      if (askedAt === undefined) return;
      awaitingBody.delete(id);
      if (now - askedAt >= BODY_WINDOW || !body) return;

      const responseRaw = body.slice(0, MAX_BODY_LENGTH);
      change(id, (request) =>
        // Never replace a body the request already has
        request.responseRaw ? null : { response: parseJson(responseRaw), responseRaw }
      );
    },

    // Without this, one missed response would leave a request pending for
    // ever, which cannot be told from a request that really hangs.
    tick(now) {
      const givenUp: number[] = [];
      for (const [url, waiting] of pending) {
        const kept = waiting.filter((entry) => {
          if (now - entry.since <= PENDING_TIMEOUT) return true;
          givenUp.push(entry.id);
          // Its response may still come, and will still complete it
          if (entry.reportId !== undefined) awaitingReport.set(entry.reportId, entry.id);
          return false;
        });
        if (kept.length === 0) pending.delete(url);
        else if (kept.length !== waiting.length) pending.set(url, kept);
      }

      for (const [key, entry] of completed) {
        if (now - entry.at > RESOLVED_WINDOW) completed.delete(key);
      }
      for (const [id, askedAt] of awaitingBody) {
        if (now - askedAt >= BODY_WINDOW) awaitingBody.delete(id);
      }
      // No use remembering a request the log no longer lists
      const listed = new Set(requests.map((request) => request.id));
      for (const [reportId, id] of awaitingReport) {
        if (!listed.has(id)) awaitingReport.delete(reportId);
      }
      for (const id of reportedByNetwork) {
        if (!listed.has(id)) reportedByNetwork.delete(id);
      }

      if (givenUp.length > 0) {
        requests = requests.map((request) =>
          givenUp.includes(request.id) ? { ...request, pending: false, timedOut: true } : request
        );
      }
    },

    clear() {
      requests = [];
      pending.clear();
      completed.clear();
      awaitingBody.clear();
      awaitingReport.clear();
      reportedByNetwork.clear();
    },
  };
}
