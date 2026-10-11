import { describe, expect, it } from 'vitest';
import { createRequestLog, type FinishedRequest } from './requestLog';
import { readTrace, replay, traced, writeTrace, type TraceEntry } from './trace';
import type { ToPanel } from './captureProtocol';

const URL = 'https://api.test/graphql';
const BROWSER = 'Mozilla/5.0 Chrome/141.0.0.0';
const query = (name: string) => `query ${name} { viewer }`;

/** The background saw a request leave */
const pending = (name: string): ToPanel => ({
  type: 'gql_pending',
  payload: { url: URL, query: query(name), variables: null, operationName: name, timestamp: 0 },
});

/** The in-page interceptor saw a request leave */
const request = (id: string, name: string): ToPanel => ({
  type: 'gql_request',
  payload: {
    id,
    url: URL,
    query: query(name),
    variables: null,
    operationName: name,
    requestHeaders: [{ name: 'authorization', value: '[redacted by GraphQL Inspector]' }],
    timestamp: 0,
  },
});

/** The in-page interceptor read the response to a request */
const response = (id: string): ToPanel => ({
  type: 'gql_response',
  payload: {
    id,
    url: URL,
    status: 200,
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    body: `{"data":"${id}"}`,
    duration: 40,
    size: 17,
  },
});

/** DevTools saw a request finish */
const finished = (name: string, extra: Partial<FinishedRequest> = {}): FinishedRequest => ({
  method: 'POST',
  url: URL,
  postData: JSON.stringify({ query: query(name), operationName: name }),
  requestHeaders: [{ name: 'content-type', value: 'application/json' }],
  responseHeaders: [{ name: 'content-type', value: 'application/json' }],
  status: 200,
  startedAt: 1_000,
  duration: 30,
  responseSize: 20,
  ...extra,
});

/** A log that is being recorded */
function recording() {
  const log = traced(createRequestLog());
  log.record(true);
  return log;
}

const entries = (log: ReturnType<typeof traced>) => log.trace(BROWSER)?.entries;

describe('a request log that is recorded', () => {
  it('lists what the log it wraps lists', () => {
    const plain = createRequestLog();
    const log = recording();

    for (const each of [plain, log]) {
      each.receive(pending('Viewer'), 1_000);
      each.receive(request('page-1', 'Viewer'), 1_010);
      each.receive(response('page-1'), 1_100);
      each.networkFinished(finished('Viewer'), 1_120);
      each.tick(6_000);
    }

    expect(log.requests).toEqual(plain.requests);
    expect(log.requests).toHaveLength(1);
  });

  it('keeps nothing until it is asked to record', () => {
    const log = traced(createRequestLog());

    log.receive(pending('Viewer'), 1_000);

    expect(log.trace(BROWSER)).toBeNull();
    expect(log.requests).toHaveLength(1); // and the log is told all the same
  });

  it('keeps what the log is told, in order, each with its source and the time it arrived at', () => {
    const log = recording();

    log.receive(pending('Viewer'), 1_000);
    log.receive(request('page-1', 'Viewer'), 1_010);
    log.receive(response('page-1'), 1_100);
    log.tick(6_000);
    log.clear();

    expect(entries(log)).toEqual([
      { at: 1_000, source: 'background', message: pending('Viewer') },
      { at: 1_010, source: 'interceptor', message: request('page-1', 'Viewer') },
      { at: 1_100, source: 'interceptor', message: response('page-1') },
      { at: 6_000, source: 'clock' },
      { source: 'panel', cleared: true },
    ]);
  });

  it('keeps a request DevTools reports as finished, and the body it gives for it under the same reference', () => {
    const log = recording();
    log.receive(pending('Viewer'), 1_000);
    log.receive(pending('Friends'), 1_005);

    const friends = log.networkFinished(finished('Friends'), 1_200);
    const viewer = log.networkFinished(finished('Viewer'), 1_210);
    log.networkBody(viewer!, '{"data":"viewer"}', 1_220);
    log.networkBody(friends!, '{"data":"friends"}', 1_230);

    expect(entries(log)?.slice(2)).toEqual([
      { at: 1_200, source: 'devtools', ref: 1, finished: finished('Friends') },
      { at: 1_210, source: 'devtools', ref: 2, finished: finished('Viewer') },
      { at: 1_220, source: 'devtools', ref: 2, body: '{"data":"viewer"}' },
      { at: 1_230, source: 'devtools', ref: 1, body: '{"data":"friends"}' },
    ]);
  });

  it('keeps the name of a header that carries a credential without its value, which the log still gets', () => {
    const log = recording();
    const seen = finished('Viewer', {
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer secret' },
        { name: 'accept', value: '*/*' },
      ],
      responseHeaders: [{ name: 'set-cookie', value: 'session=secret' }],
    });

    log.networkFinished(seen, 1_200);

    expect(entries(log)).toEqual([
      {
        at: 1_200,
        source: 'devtools',
        ref: 1,
        finished: finished('Viewer', {
          requestHeaders: [
            { name: 'Authorization', value: '[redacted by GraphQL Inspector]' },
            { name: 'accept', value: '*/*' },
          ],
          responseHeaders: [{ name: 'set-cookie', value: '[redacted by GraphQL Inspector]' }],
        }),
      },
    ]);
    // the panel shows the headers as DevTools gave them
    expect(log.requests[0].requestHeaders[0]).toEqual({ name: 'Authorization', value: 'Bearer secret' });
  });

  it('leaves out a finished request that cannot be a GraphQL one: not a POST, or with another body', () => {
    const log = recording();

    log.networkFinished(finished('Viewer', { method: 'GET', postData: null }), 1_200);
    log.networkFinished(finished('Viewer', { url: 'https://api.test/login', postData: 'user=ada&password=secret' }), 1_210);
    log.networkFinished(finished('Viewer', { postData: '{"name":"Ada"}' }), 1_220);

    expect(entries(log)).toEqual([]);
  });

  it('keeps a finished POST whose body DevTools does not have: the log may take it for a pending request', () => {
    const log = recording();

    log.networkFinished(finished('Viewer', { postData: null }), 1_200);

    expect(entries(log)).toEqual([
      { at: 1_200, source: 'devtools', ref: 1, finished: finished('Viewer', { postData: null }) },
    ]);
  });

  it('goes on with the same trace when asked to record while it already does', () => {
    const log = recording();
    log.receive(pending('Viewer'), 1_000);

    log.record(true);
    log.receive(pending('Friends'), 1_010);

    expect(entries(log)).toHaveLength(2);
  });

  it('forgets what it kept when recording is turned off, and starts again from nothing', () => {
    const log = recording();
    log.receive(pending('Viewer'), 1_000);

    log.record(false);
    expect(log.trace(BROWSER)).toBeNull();

    log.record(true);
    log.receive(pending('Friends'), 1_010);
    expect(entries(log)).toEqual([{ at: 1_010, source: 'background', message: pending('Friends') }]);
  });

  it('keeps the 5 000 most recent entries', () => {
    const log = recording();

    for (let at = 1; at <= 5_001; at++) log.tick(at);

    expect(entries(log)).toHaveLength(5_000);
    expect(entries(log)?.[0]).toEqual({ at: 2, source: 'clock' });
  });

  it('gives a trace that says its version, the browser it was recorded in, and what it holds', () => {
    const log = recording();

    expect(log.trace(BROWSER)).toEqual({
      version: 1,
      note:
        'What the panel of GraphQL Inspector received during a session. It holds the queries, the variables ' +
        'and the responses of the requests it lists. Only the values of headers that carry a credential are ' +
        'redacted. Keep it on this machine unless it was recorded on public APIs.',
      browser: 'Mozilla/5.0 Chrome/141.0.0.0',
      entries: [],
    });
  });
});

describe('a trace that is replayed', () => {
  /** A session with a request from each source, as a recorded log kept it */
  function session() {
    const log = recording();
    log.receive(pending('Viewer'), 1_000);
    log.receive(request('page-1', 'Viewer'), 1_010);
    log.receive(response('page-1'), 1_100);
    log.networkFinished(finished('Viewer'), 1_120);
    const id = log.networkFinished(finished('Friends', { startedAt: 1_150 }), 1_300);
    log.networkBody(id!, '{"data":"friends"}', 1_310);
    log.receive(pending('Slow'), 2_000);
    log.tick(40_000);
    return log;
  }

  it('lists the requests the recorded log listed', () => {
    const recorded = session();

    const log = replay(entries(recorded)!);

    expect(log.requests.map((r) => `${r.operationName}: ${r.timedOut ? 'given up' : r.status}`)).toEqual([
      'Viewer: 200',
      'Friends: 200',
      'Slow: given up',
    ]);
    expect(log.requests).toEqual(recorded.requests);
  });

  it('gives a body to the request the log asks it for, which may not have the id it had', () => {
    const log = createRequestLog();
    log.receive(pending('Earlier'), 500);

    replay(entries(session())!, log);

    expect(log.requests.map((r) => [r.id, r.operationName, r.responseRaw])).toEqual([
      [1, 'Earlier', ''],
      [2, 'Viewer', '{"data":"page-1"}'],
      [3, 'Friends', '{"data":"friends"}'],
      [4, 'Slow', ''],
    ]);
  });

  it('empties the log where the panel did', () => {
    const cleared: TraceEntry[] = [
      { at: 1_000, source: 'background', message: pending('Viewer') },
      { source: 'panel', cleared: true },
      { at: 2_000, source: 'background', message: pending('Friends') },
    ];

    expect(replay(cleared).requests.map((r) => r.operationName)).toEqual(['Friends']);
  });

  it('leaves out a body whose finished request is not in the trace', () => {
    const orphan: TraceEntry[] = [
      { at: 1_000, source: 'background', message: pending('Viewer') },
      { at: 1_100, source: 'devtools', ref: 7, body: '{"data":"lost"}' },
    ];

    expect(replay(orphan).requests.map((r) => r.responseRaw)).toEqual(['']);
  });
});

describe('a trace written to a file', () => {
  it('is read back as it was, with what DevTools did not say', () => {
    const log = recording();
    log.receive(request('page-1', 'Viewer'), 1_010);
    log.receive(response('page-1'), 1_100);
    log.networkFinished(finished('Viewer', { startedAt: NaN, duration: NaN, responseSize: NaN }), 1_120);
    log.tick(6_000);
    log.clear();
    const trace = log.trace(BROWSER)!;

    const read = readTrace(writeTrace(trace));

    expect(read).toEqual(trace);
    expect(read.entries[2]).toMatchObject({ finished: { startedAt: NaN, duration: NaN, responseSize: NaN } });
  });

  it('is JSON, where what DevTools did not say is null', () => {
    const log = recording();
    log.networkFinished(finished('Viewer', { startedAt: NaN }), 1_120);

    const file = JSON.parse(writeTrace(log.trace(BROWSER)!));

    expect(file.version).toBe(1);
    expect(file.entries[0].finished).toMatchObject({ startedAt: null, duration: 30 });
  });

  it.each([
    ['not JSON', 'trace'],
    ['JSON that is not a trace', '{"requests":[]}'],
    ['a trace of another version', '{"version":2,"note":"","browser":"","entries":[]}'],
    ['a trace without its entries', '{"version":1,"note":"","browser":""}'],
  ])('is not read when it is %s', (_what, text) => {
    expect(() => readTrace(text)).toThrow('not a trace');
  });
});
