import { describe, expect, it } from 'vitest';
import {
  pageReport,
  pageCaptureSwitch,
  parseGraphQLBody,
  readPageReport,
  readPageCaptureSwitch,
  type InterceptorReport,
} from './captureProtocol';

describe('a GraphQL request body', () => {
  it('is a JSON object whose query is a string', () => {
    const body =
      '{"query":"query Q($id: ID) { user(id: $id) { name } }","variables":{"id":1},"operationName":"Q"}';

    expect(parseGraphQLBody(body)).toEqual({
      query: 'query Q($id: ID) { user(id: $id) { name } }',
      variables: { id: 1 },
      operationName: 'Q',
    });
  });

  it('has no variables and no operation name when the body gives none', () => {
    expect(parseGraphQLBody('{"query":"{ me }"}')).toEqual({
      query: '{ me }',
      variables: null,
      operationName: null,
    });
  });

  it.each(['""', '5', 'null'])('has no operation name when the body gives %s for it', (operationName) => {
    const body = `{"query":"query Q { me }","operationName":${operationName}}`;

    expect(parseGraphQLBody(body)).toEqual({
      query: 'query Q { me }',
      variables: null,
      operationName: null,
    });
  });

  it.each(['"id=1"', '5', 'null'])('has no variables when the body gives %s for them', (variables) => {
    const body = `{"query":"{ me }","variables":${variables}}`;

    expect(parseGraphQLBody(body)).toEqual({ query: '{ me }', variables: null, operationName: null });
  });

  it.each([
    ['a body that is not JSON', 'a=1&b=2'],
    ['the JSON value null', 'null'],
    ['a JSON number', '5'],
    ['a JSON string', '"{ me }"'],
    ['a batch, which is a JSON array', '[{"query":"{ a }"},{"query":"{ b }"}]'],
    ['an object without a query', '{"operationName":"Q","extensions":{"persistedQuery":{}}}'],
    ['an object whose query is another object', '{"query":{"match":{"title":"x"}}}'],
    ['an object whose query is a number', '{"query":5}'],
    ['an object whose query is empty', '{"query":""}'],
    ['an empty body', ''],
  ])('is not %s', (_what, body) => {
    expect(parseGraphQLBody(body)).toBeNull();
  });

  it('is not a body that could not be read', () => {
    expect(parseGraphQLBody(null)).toBeNull();
    expect(parseGraphQLBody(undefined)).toBeNull();
  });
});

const request: InterceptorReport = {
  type: 'gql_request',
  payload: {
    id: 'p-1',
    url: 'https://api.test/graphql',
    query: 'query Q($id: ID) { user(id: $id) { name } }',
    variables: { id: 1 },
    operationName: 'Q',
    requestHeaders: [{ name: 'content-type', value: 'application/json' }],
    timestamp: 1_700_000_000_000,
  },
};

const response: InterceptorReport = {
  type: 'gql_response',
  payload: {
    id: 'p-1',
    url: 'https://api.test/graphql',
    status: 200,
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    body: '{"data":{"user":{"name":"Ada"}}}',
    duration: 120,
    size: 32,
  },
};

describe('a report of the interceptor on the page bus', () => {
  it('carries the mark of the interceptor', () => {
    expect(pageReport(response)).toEqual({
      __gqlInspector: true,
      type: 'gql_response',
      payload: {
        id: 'p-1',
        url: 'https://api.test/graphql',
        status: 200,
        responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        body: '{"data":{"user":{"name":"Ada"}}}',
        duration: 120,
        size: 32,
      },
    });
  });

  it('is read back as it was posted', () => {
    expect(readPageReport(pageReport(request))).toEqual(request);
    expect(readPageReport(pageReport(response))).toEqual(response);
  });

  it('is read with a request that has no variables and no operation name', () => {
    const bare: InterceptorReport = {
      type: 'gql_request',
      payload: { ...request.payload, variables: null, operationName: null, requestHeaders: [] },
    };

    expect(readPageReport(pageReport(bare))).toEqual(bare);
  });

  it('is read with a response whose body could not be read, and so has no size', () => {
    const unread: InterceptorReport = {
      type: 'gql_response',
      payload: { ...response.payload, body: '', size: null },
    };

    expect(readPageReport(pageReport(unread))).toEqual(unread);
  });

  it('is read without the fields a report does not have', () => {
    const padded = {
      __gqlInspector: true,
      type: 'gql_request',
      note: 'added by the page',
      payload: {
        ...request.payload,
        note: 'added by the page',
        requestHeaders: [{ name: 'content-type', value: 'application/json', note: 'added by the page' }],
      },
    };

    expect(readPageReport(padded)).toEqual(request);
  });

  const posted = (payload: object, type = 'gql_request') => ({ __gqlInspector: true, type, payload });

  it.each([
    ['a message without the mark', { type: 'gql_request', payload: request.payload }],
    ['a message whose mark is not true', { ...posted(request.payload), __gqlInspector: 1 }],
    ['a pending request, which only the background reports', posted(request.payload, 'gql_pending')],
    ['a message without a payload', { __gqlInspector: true, type: 'gql_request' }],
    ['a message whose payload is not an object', { __gqlInspector: true, type: 'gql_request', payload: 'x' }],
    ['a request whose id is not a string', posted({ ...request.payload, id: 1 })],
    ['a request whose URL is not a string', posted({ ...request.payload, url: 5 })],
    ['a request whose query is not a string', posted({ ...request.payload, query: 7 })],
    ['a request whose variables are not an object', posted({ ...request.payload, variables: 'id=1' })],
    ['a request whose operation name is not a string', posted({ ...request.payload, operationName: 5 })],
    ['a request whose headers are not a list', posted({ ...request.payload, requestHeaders: 'none' })],
    ['a request with a header that has no value', posted({ ...request.payload, requestHeaders: [{ name: 'a' }] })],
    ['a request whose timestamp is not a number', posted({ ...request.payload, timestamp: 'now' })],
    ['a response whose status is not a number', posted({ ...response.payload, status: '200' }, 'gql_response')],
    ['a response whose body is not a string', posted({ ...response.payload, body: { data: 1 } }, 'gql_response')],
    ['a response without headers', posted({ ...response.payload, responseHeaders: null }, 'gql_response')],
    ['a response whose duration is not a number', posted({ ...response.payload, duration: '120' }, 'gql_response')],
    ['a response without a duration', posted({ ...response.payload, duration: undefined }, 'gql_response')],
    ['a response whose size is not a number', posted({ ...response.payload, size: '32' }, 'gql_response')],
    ['a response without a size', posted({ ...response.payload, size: undefined }, 'gql_response')],
    ['a request posted as a response', posted(request.payload, 'gql_response')],
    ['null', null],
    ['a string', 'gql_request'],
  ])('is not %s', (_what, data) => {
    expect(readPageReport(data)).toBeNull();
  });
});

describe('the capture switch on the page bus', () => {
  it('carries the mark of a control message', () => {
    expect(pageCaptureSwitch(true)).toEqual({ __gqlInspectorControl: true, type: 'activate' });
    expect(pageCaptureSwitch(false)).toEqual({ __gqlInspectorControl: true, type: 'deactivate' });
  });

  it('is read back as on or off', () => {
    expect(readPageCaptureSwitch(pageCaptureSwitch(true))).toBe(true);
    expect(readPageCaptureSwitch(pageCaptureSwitch(false))).toBe(false);
  });

  it.each([
    ['a message without the mark', { type: 'activate' }],
    ['a control message of another type', { __gqlInspectorControl: true, type: 'toggle' }],
    ['a report', pageReport(request)],
    ['null', null],
    ['a string', 'activate'],
  ])('is not %s', (_what, data) => {
    expect(readPageCaptureSwitch(data)).toBeNull();
  });

  it('is not read as a report', () => {
    expect(readPageReport(pageCaptureSwitch(true))).toBeNull();
  });
});
