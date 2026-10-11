import { describe, expect, it } from 'vitest';
import { createRequestLog, type FinishedRequest, type RequestLog } from './requestLog';
import type { ToPanel } from './captureProtocol';

const URL = 'https://api.test/graphql';
const query = (name: string) => `query ${name} { viewer }`;

/** The background saw a request leave */
const pending = (name: string, extra: object = {}): ToPanel => ({
  type: 'gql_pending',
  payload: { url: URL, query: query(name), variables: null, operationName: name, timestamp: 0, ...extra },
});

/** The in-page interceptor saw a request leave */
const request = (id: string, name: string, extra: object = {}): ToPanel => ({
  type: 'gql_request',
  payload: {
    id,
    url: URL,
    query: query(name),
    variables: null,
    operationName: name,
    requestHeaders: [{ name: 'x-seen-by', value: 'page' }],
    timestamp: 0,
    ...extra,
  },
});

/** The in-page interceptor read the response to a request */
const response = (id: string, extra: object = {}): ToPanel => ({
  type: 'gql_response',
  payload: {
    id,
    url: URL,
    status: 200,
    responseHeaders: [{ name: 'x-answered-to', value: 'page' }],
    body: `{"data":"${id}"}`,
    ...extra,
  },
});

/** DevTools saw a request finish */
const finished = (name: string, extra: Partial<FinishedRequest> = {}): FinishedRequest => ({
  method: 'POST',
  url: URL,
  postData: JSON.stringify({ query: query(name), operationName: name }),
  requestHeaders: [{ name: 'x-seen-by', value: 'network' }],
  responseHeaders: [{ name: 'x-answered-to', value: 'network' }],
  status: 200,
  ...extra,
});

/** Each captured request as "name: state", in the order the log lists them */
const states = (log: RequestLog) =>
  log.requests.map(
    (r) => `${r.operationName}: ${r.pending ? 'pending' : r.timedOut ? 'given up' : r.status}`
  );

const SECOND = 1000;

describe('a request the background reports', () => {
  it('is listed as a pending request', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer', { variables: { id: 1 } }), 5 * SECOND);

    expect(log.requests).toEqual([
      {
        id: 1,
        operationName: 'Viewer',
        operationType: 'query',
        query: 'query Viewer { viewer }',
        variables: { id: 1 },
        requestHeaders: [],
        responseHeaders: [],
        response: null,
        responseRaw: '',
        status: 0,
        url: 'https://api.test/graphql',
        timestamp: 5000,
        pending: true,
      },
    ]);
  });

  it('takes its name and its type from the query document when the report names no operation', () => {
    const log = createRequestLog();

    log.receive(pending('', { operationName: null, query: 'mutation Rename($to: String) { rename(to: $to) }' }), 0);
    log.receive(pending('', { operationName: null, query: '{ viewer }' }), 0);

    expect(log.requests.map((r) => [r.operationName, r.operationType])).toEqual([
      ['Rename', 'mutation'],
      ['Anonymous', 'query'],
    ]);
  });

  it('is listed up to a query document of 500 000 characters, and not beyond', () => {
    const log = createRequestLog();

    log.receive(pending('AtTheLimit', { query: 'q'.repeat(500_000) }), 0);
    log.receive(pending('Beyond', { query: 'q'.repeat(500_001) }), 0);

    expect(states(log)).toEqual(['AtTheLimit: pending']);
  });
});

describe('a request the in-page interceptor reports', () => {
  it('joins the pending request the background reported, and brings the request headers', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 50);

    expect(states(log)).toEqual(['Viewer: pending']);
    expect(log.requests[0].requestHeaders).toEqual([{ name: 'x-seen-by', value: 'page' }]);
  });

  it('is listed as a pending request of its own when the background reported nothing', () => {
    const log = createRequestLog();

    log.receive(request('page-1', 'Viewer'), 50);

    expect(states(log)).toEqual(['Viewer: pending']);
    expect(log.requests[0]).toMatchObject({ id: 1, timestamp: 50, requestHeaders: [{ name: 'x-seen-by', value: 'page' }] });
  });

  it('joins a pending request reported less than 2 seconds before', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 1999);

    expect(states(log)).toEqual(['Viewer: pending']);
  });

  it('does not join a pending request reported 2 seconds before or more', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 2000);

    expect(states(log)).toEqual(['Viewer: pending', 'Viewer: pending']);
  });

  it('does not join a pending request of another operation or of another URL', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Friends'), 10);
    log.receive(request('page-2', 'Viewer', { url: 'https://other.test/graphql' }), 20);

    expect(log.requests.map((r) => [r.operationName, r.url])).toEqual([
      ['Viewer', 'https://api.test/graphql'],
      ['Friends', 'https://api.test/graphql'],
      ['Viewer', 'https://other.test/graphql'],
    ]);
  });

  it('joins, among pending requests of the same operation, the oldest that no report has joined yet', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(pending('Viewer'), 10);
    log.receive(request('page-1', 'Viewer'), 20);
    log.receive(request('page-2', 'Viewer'), 30);
    log.receive(response('page-2'), 100);

    expect(states(log)).toEqual(['Viewer: pending', 'Viewer: 200']);
  });
});

describe('a response the in-page interceptor reports', () => {
  it('completes its request with the status, the headers and the body', () => {
    const log = createRequestLog();

    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1', { body: '{"data":{"viewer":"Ada"}}' }), 120);

    expect(log.requests[0]).toMatchObject({
      status: 200,
      responseHeaders: [{ name: 'x-answered-to', value: 'page' }],
      responseRaw: '{"data":{"viewer":"Ada"}}',
      response: { data: { viewer: 'Ada' } },
      pending: false,
      timedOut: false,
    });
  });

  it('completes the request that carries its id, whatever else is pending on the same URL', () => {
    const log = createRequestLog();

    log.receive(pending('Viewer'), 0);
    log.receive(pending('Friends'), 10);
    log.receive(request('page-1', 'Friends'), 20);
    log.receive(request('page-2', 'Viewer'), 30);
    log.receive(response('page-1'), 100);

    expect(states(log)).toEqual(['Viewer: pending', 'Friends: 200']);
    expect(log.requests[1].responseRaw).toBe('{"data":"page-1"}');
  });

  it('keeps a body that is not JSON as it came', () => {
    const log = createRequestLog();

    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1', { status: 502, body: '<h1>Bad gateway</h1>' }), 100);

    expect(log.requests[0]).toMatchObject({ status: 502, responseRaw: '<h1>Bad gateway</h1>', response: null });
  });

  it('has its body cut at 2 000 000 characters', () => {
    const log = createRequestLog();

    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1', { body: 'x'.repeat(2_000_001) }), 100);

    expect(log.requests[0].responseRaw).toHaveLength(2_000_000);
  });

  it('is ignored when no pending request carries its id', () => {
    const log = createRequestLog();

    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-9'), 100);
    expect(states(log)).toEqual(['Viewer: pending']);

    log.receive(response('page-1'), 200);
    log.receive(response('page-1', { status: 500, body: 'again' }), 300);
    expect(log.requests[0]).toMatchObject({ status: 200, responseRaw: '{"data":"page-1"}' });
  });
});

describe('a pending request without a response', () => {
  it('is given up on when the clock ticks more than 30 seconds after it was reported', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);

    log.tick(30 * SECOND);
    expect(states(log)).toEqual(['Viewer: pending']);

    log.tick(30 * SECOND + 1);
    expect(states(log)).toEqual(['Viewer: given up']);
    expect(log.requests[0]).toMatchObject({ pending: false, timedOut: true, status: 0 });
  });

  it('is completed all the same by the response the interceptor reports afterwards, however late', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 10);
    log.tick(35 * SECOND);
    expect(states(log)).toEqual(['Viewer: given up']);

    log.receive(response('page-1'), 90 * SECOND);

    expect(states(log)).toEqual(['Viewer: 200']);
    expect(log.requests[0]).toMatchObject({
      timedOut: false,
      responseHeaders: [{ name: 'x-answered-to', value: 'page' }],
      responseRaw: '{"data":"page-1"}',
      response: { data: 'page-1' },
    });
  });

  it('is completed by a late response that has no body', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.tick(35 * SECOND);

    log.receive(response('page-1', { status: 504, body: '' }), 60 * SECOND);

    expect(states(log)).toEqual(['Viewer: 504']);
  });

  it('does not take what DevTools reports just after its late response for another request', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.tick(35 * SECOND);
    log.receive(response('page-1'), 60 * SECOND);

    const id = log.networkFinished(finished('Viewer'), 60 * SECOND + 50);

    expect(states(log)).toEqual(['Viewer: 200']);
    expect(log.requests[0].requestHeaders).toEqual([{ name: 'x-seen-by', value: 'network' }]);
    expect(id).toBeNull();
  });

  it('is still completed by a response that comes after 30 seconds but before the clock ticks', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.tick(30 * SECOND);

    log.receive(response('page-1'), 31 * SECOND);
    log.tick(35 * SECOND);

    expect(states(log)).toEqual(['Viewer: 200']);
  });
});

describe('a finished request DevTools reports', () => {
  it('completes the pending request of the same URL and operation, with the headers seen on the network', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(pending('Friends'), 10);

    log.networkFinished(finished('Friends', { status: 201 }), 100);

    expect(states(log)).toEqual(['Viewer: pending', 'Friends: 201']);
    expect(log.requests[1]).toMatchObject({
      requestHeaders: [{ name: 'x-seen-by', value: 'network' }],
      responseHeaders: [{ name: 'x-answered-to', value: 'network' }],
      responseRaw: '',
      pending: false,
    });
  });

  it('asks for the response body of the request it completed', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);

    const id = log.networkFinished(finished('Viewer'), 100);

    expect(id).toBe(1);
  });

  it('completes the oldest pending request of its URL when DevTools has no request body for it', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(pending('Friends'), 10);

    log.networkFinished(finished('Friends', { postData: null }), 100);

    expect(states(log)).toEqual(['Viewer: 200', 'Friends: pending']);
  });

  it('is listed as a request of its own rather than complete a pending request of another operation', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);

    const id = log.networkFinished(finished('Friends'), 100);

    expect(states(log)).toEqual(['Viewer: pending', 'Friends: 200']);
    expect(log.requests[1]).toMatchObject({
      id: 2,
      query: 'query Friends { viewer }',
      requestHeaders: [{ name: 'x-seen-by', value: 'network' }],
      timestamp: 100,
      pending: false,
    });
    expect(id).toBe(2);
  });

  it('leaves the request open to the body of the response the interceptor reports afterwards', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 10);

    log.networkFinished(finished('Viewer', { status: 201 }), 100);
    log.receive(response('page-1'), 110);

    // the body from the page, the status and the headers still from the network
    expect(log.requests[0]).toMatchObject({
      status: 201,
      responseHeaders: [{ name: 'x-answered-to', value: 'network' }],
      responseRaw: '{"data":"page-1"}',
      response: { data: 'page-1' },
    });
  });

  it('only brings its headers to a request the interceptor completed less than 5 seconds before', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1'), 100);

    const id = log.networkFinished(finished('Viewer', { status: 204 }), 100 + 4999);

    expect(states(log)).toEqual(['Viewer: 200']);
    expect(log.requests[0]).toMatchObject({
      requestHeaders: [{ name: 'x-seen-by', value: 'network' }],
      responseHeaders: [{ name: 'x-answered-to', value: 'network' }],
      responseRaw: '{"data":"page-1"}',
    });
    expect(id).toBeNull();
  });

  it('asks for the response body when the interceptor completed the request without one', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1', { body: '' }), 100);

    const id = log.networkFinished(finished('Viewer'), 200);
    expect(id).toBe(1);

    log.networkBody(1, '{"data":"from the network"}', 300);
    expect(log.requests[0]).toMatchObject({
      status: 200,
      responseRaw: '{"data":"from the network"}',
      response: { data: 'from the network' },
    });
  });

  it('is listed as another request when the interceptor completed its request 5 seconds before or more', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1'), 100);

    log.networkFinished(finished('Viewer'), 100 + 5000);

    expect(states(log)).toEqual(['Viewer: 200', 'Viewer: 200']);
  });

  it('is ignored when it is not a POST', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);

    const id = log.networkFinished(finished('Viewer', { method: 'GET' }), 100);

    expect(states(log)).toEqual(['Viewer: pending']);
    expect(id).toBeNull();
  });

  it('is ignored when it is not a GraphQL request and nothing is pending on its URL', () => {
    const log = createRequestLog();

    expect(log.networkFinished(finished('', { postData: '{"name":"Ada"}' }), 0)).toBeNull();
    expect(log.networkFinished(finished('', { postData: null }), 0)).toBeNull();
    expect(log.requests).toEqual([]);
  });

  it('is ignored when its query document is longer than 500 000 characters', () => {
    const log = createRequestLog();

    log.networkFinished(finished('', { postData: JSON.stringify({ query: 'q'.repeat(500_001) }) }), 0);

    expect(log.requests).toEqual([]);
  });

  it('is ignored when its request body is not a GraphQL request, whatever is pending on its URL', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);

    const id = log.networkFinished(finished('', { postData: '{"name":"Ada"}', status: 201 }), 100);

    expect(states(log)).toEqual(['Viewer: pending']);
    expect(id).toBeNull();
  });
});

describe('the response body DevTools gives', () => {
  it('goes to the request it was asked for', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(pending('Friends'), 10);
    const id = log.networkFinished(finished('Friends'), 100);

    log.networkBody(id!, '{"data":{"friends":[]}}', 300);

    expect(log.requests.map((r) => r.responseRaw)).toEqual(['', '{"data":{"friends":[]}}']);
    expect(log.requests[1].response).toEqual({ data: { friends: [] } });
  });

  it('is taken less than 5 seconds after DevTools reported the request, and not after', () => {
    const inTime = createRequestLog();
    inTime.receive(pending('Viewer'), 0);
    inTime.networkBody(inTime.networkFinished(finished('Viewer'), 100)!, '{"data":1}', 100 + 4999);

    const late = createRequestLog();
    late.receive(pending('Viewer'), 0);
    late.networkBody(late.networkFinished(finished('Viewer'), 100)!, '{"data":1}', 100 + 5000);

    expect(inTime.requests[0].responseRaw).toBe('{"data":1}');
    expect(late.requests[0].responseRaw).toBe('');
  });

  it('is cut at 2 000 000 characters', () => {
    const log = createRequestLog();
    const id = log.networkFinished(finished('Viewer'), 0);

    log.networkBody(id!, 'x'.repeat(2_000_001), 100);

    expect(log.requests[0].responseRaw).toHaveLength(2_000_000);
  });

  it('does not replace the body the interceptor brought in the meantime', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Viewer'), 10);
    const id = log.networkFinished(finished('Viewer'), 100);
    log.receive(response('page-1'), 110);

    log.networkBody(id!, '{"data":"from the network"}', 150);

    expect(log.requests[0].responseRaw).toBe('{"data":"page-1"}');
  });

  it('is ignored for a request it was not asked for', () => {
    const log = createRequestLog();
    log.receive(request('page-1', 'Viewer'), 0);
    log.receive(response('page-1'), 100);

    log.networkBody(1, '{"data":"from the network"}', 200);

    expect(log.requests[0].responseRaw).toBe('{"data":"page-1"}');
  });
});

describe('the log', () => {
  it('lists the captured requests in the order they were first reported', () => {
    const log = createRequestLog();

    log.receive(pending('First'), 0);
    log.receive(request('page-1', 'Second'), 10);
    log.networkFinished(finished('Third'), 20);
    log.receive(response('page-1'), 30);

    expect(log.requests.map((r) => [r.id, r.operationName])).toEqual([
      [1, 'First'],
      [2, 'Second'],
      [3, 'Third'],
    ]);
  });

  it('keeps the 500 most recent captured requests', () => {
    const log = createRequestLog();

    for (let n = 1; n <= 503; n++) log.receive(pending(`Op${n}`), n);

    expect(log.requests).toHaveLength(500);
    expect(log.requests[0].operationName).toBe('Op4');
    expect(log.requests[499].operationName).toBe('Op503');
  });

  it('is emptied by clear, after which numbering goes on', () => {
    const log = createRequestLog();
    log.receive(pending('Before'), 0);

    log.clear();
    expect(log.requests).toEqual([]);

    log.receive(pending('After'), 100);
    expect(log.requests.map((r) => [r.id, r.operationName])).toEqual([[2, 'After']]);
  });

  it('forgets what was pending and what was completed when cleared', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    log.receive(request('page-1', 'Friends'), 0);
    log.receive(response('page-1'), 50);
    log.clear();

    log.receive(request('page-2', 'Viewer'), 100);
    log.networkFinished(finished('Friends'), 200);

    // a request of its own each: nothing left to join, nothing left to bring headers to
    expect(log.requests.map((r) => [r.id, r.operationName])).toEqual([
      [3, 'Viewer'],
      [4, 'Friends'],
    ]);
  });

  it('gives a new list when a captured request changes, and the same one when none does', () => {
    const log = createRequestLog();
    log.receive(pending('Viewer'), 0);
    const listed = log.requests;

    log.receive(response('page-9'), 10); // nothing pending under that id
    log.tick(1 * SECOND); // nothing to give up on
    expect(log.requests).toBe(listed);

    log.receive(request('page-1', 'Viewer'), 20);
    expect(log.requests).not.toBe(listed);
  });
});
