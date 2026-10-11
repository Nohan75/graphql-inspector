import { parseGraphQLBody, redactHeader, type ToPanel } from './captureProtocol';
import { createRequestLog, type FinishedRequest, type RequestLog } from './requestLog';

/**
 * A trace: what the request log was told during a session, in the order it
 * was told. Recorded in a real browser, it says what the three sources send
 * and when; replayed into a request log, it gives the list the panel showed.
 *
 * A trace is a debugging aid. Nothing is kept until recording is asked for.
 */

/** One thing the request log was told, who by, and the time it arrived at */
export type TraceEntry =
  /** A report that came on the panel's port */
  | { at: number; source: 'background' | 'interceptor'; message: ToPanel }
  /** A request DevTools reported as finished. `ref` names it for the body that may follow. */
  | { at: number; source: 'devtools'; ref: number; finished: FinishedRequest }
  /** The response body DevTools gave for the finished request of the same `ref` */
  | { at: number; source: 'devtools'; ref: number; body: string }
  /** Time passed */
  | { at: number; source: 'clock' }
  /** The list was emptied: by a navigation, or by the Clear button */
  | { source: 'panel'; cleared: true };

export interface Trace {
  version: 1;
  /** What the file holds and where it may go, for whoever opens it */
  note: string;
  /** The browser it was recorded in, as `navigator.userAgent` gives it */
  browser: string;
  entries: TraceEntry[];
}

const NOTE =
  'What the panel of GraphQL Inspector received during a session. It holds the queries, the variables ' +
  'and the responses of the requests it lists. Only the values of headers that carry a credential are ' +
  'redacted. Keep it on this machine unless it was recorded on public APIs.';

/** A trace keeps the most recent entries */
const MAX_ENTRIES = 5_000;

/** A request log whose every call can be kept as a trace */
export interface TracedLog extends RequestLog {
  /**
   * Starts keeping what the log is told, or stops and forgets what was kept.
   * Off at first. Asked to record while it already does, it goes on.
   */
  record(on: boolean): void;
  /** What the log was told since recording started. Null when recording is off. */
  trace(browser: string): Trace | null;
}

/**
 * Wraps a request log so that what it is told can be recorded. The log is
 * told everything, recorded or not, and as it came.
 *
 * What a trace must not carry is left out here, before it is kept: the value
 * of a header that carries a credential, which DevTools gives in full, and a
 * request DevTools reports that cannot be a GraphQL one, such as the form a
 * page logs in with.
 */
export function traced(log: RequestLog): TracedLog {
  let entries: TraceEntry[] | null = null;
  let lastRef = 0;
  /** Captured request whose body the log asked for → the finished request that made it ask */
  const asked = new Map<number, number>();

  function keep(entry: TraceEntry) {
    if (!entries) return;
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.shift();
  }

  /** The log ignores anything else, whatever is pending: it has nothing to say of the capture */
  const mayBeGraphQL = ({ method, postData }: FinishedRequest) =>
    method === 'POST' && (!postData || parseGraphQLBody(postData) !== null);

  return {
    get requests() {
      return log.requests;
    },

    receive(message, now) {
      keep({ at: now, source: message.type === 'gql_pending' ? 'background' : 'interceptor', message });
      log.receive(message, now);
    },

    networkFinished(finished, now) {
      const id = log.networkFinished(finished, now);
      if (entries && mayBeGraphQL(finished)) {
        const ref = ++lastRef;
        keep({
          at: now,
          source: 'devtools',
          ref,
          finished: {
            ...finished,
            requestHeaders: finished.requestHeaders.map(redactHeader),
            responseHeaders: finished.responseHeaders.map(redactHeader),
          },
        });
        if (id !== null) asked.set(id, ref);
      }
      return id;
    },

    networkBody(id, body, now) {
      const ref = asked.get(id);
      if (ref !== undefined) keep({ at: now, source: 'devtools', ref, body });
      log.networkBody(id, body, now);
    },

    tick(now) {
      keep({ at: now, source: 'clock' });
      log.tick(now);
    },

    clear() {
      keep({ source: 'panel', cleared: true });
      log.clear();
    },

    record(on) {
      if (on === (entries !== null)) return;
      entries = on ? [] : null;
      asked.clear();
    },

    trace(browser) {
      return entries && { version: 1, note: NOTE, browser, entries: [...entries] };
    },
  };
}

/**
 * Tells a request log what a trace holds, entry by entry, each at the time
 * it was recorded at. Returns the log: a new one unless one is given.
 */
export function replay(entries: TraceEntry[], log: RequestLog = createRequestLog()): RequestLog {
  /** `ref` of a finished request → the captured request the log asked the body of */
  const asked = new Map<number, number>();

  for (const entry of entries) {
    if ('message' in entry) {
      log.receive(entry.message, entry.at);
    } else if ('finished' in entry) {
      const id = log.networkFinished(entry.finished, entry.at);
      if (id !== null) asked.set(entry.ref, id);
    } else if ('body' in entry) {
      // Recorded because the log asked for it then. A log that does not ask
      // for it now has no use for it.
      const id = asked.get(entry.ref);
      if (id !== undefined) log.networkBody(id, entry.body, entry.at);
    } else if (entry.source === 'clock') {
      log.tick(entry.at);
    } else {
      log.clear();
    }
  }
  return log;
}

/** The name of the file a trace is exported to, after the time it is exported at */
export function traceFileName(now: number): string {
  // 2026-10-12T09:41:07.250Z, down to the second and without the colons
  return `gql-inspector-trace-${new Date(now).toISOString().slice(0, 19).replaceAll(':', '-')}.json`;
}

/** A trace as the text of a file. What DevTools did not say, NaN in a finished request, is null there. */
export function writeTrace(trace: Trace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}

/** Reads the text of a file as a trace. Throws when it is not one this version reads. */
export function readTrace(text: string): Trace {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    file = null;
  }
  if (!isTrace(file)) throw new Error('not a trace of version 1');

  const orNaN = (value: number | null) => value ?? NaN;
  return {
    ...file,
    entries: file.entries.map((entry) =>
      'finished' in entry
        ? {
            ...entry,
            finished: {
              ...entry.finished,
              startedAt: orNaN(entry.finished.startedAt),
              duration: orNaN(entry.finished.duration),
              responseSize: orNaN(entry.finished.responseSize),
            },
          }
        : entry
    ),
  };
}

/** The entries are taken as they are: a trace is written by `writeTrace`, and read by tests */
function isTrace(file: unknown): file is Trace {
  if (typeof file !== 'object' || file === null) return false;
  const { version, entries } = file as Partial<Trace>;
  return version === 1 && Array.isArray(entries);
}
