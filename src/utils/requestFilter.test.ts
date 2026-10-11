import { describe, expect, it } from 'vitest';
import type { GQLRequest } from '../types';
import { filterRequests, isFiltering, NO_FILTER, type RequestFilter } from './requestFilter';

const request = (operationName: string, over: Partial<GQLRequest> = {}): GQLRequest => ({
  id: 1,
  operationName,
  operationType: 'query',
  query: `query ${operationName} { viewer }`,
  variables: null,
  requestHeaders: [],
  responseHeaders: [],
  response: { data: { viewer: 'Ada' } },
  responseRaw: '{"data":{"viewer":"Ada"}}',
  status: 200,
  url: 'https://api.test/graphql',
  timestamp: 0,
  ...over,
});

const noResponse = { response: null, responseRaw: '', status: 0 };

const captured = [
  request('Viewer'),
  request('Rename', { operationType: 'mutation' }),
  request('OnRename', { operationType: 'subscription' }),
  request('Friends', { url: 'https://other.test/api' }),
  // what went wrong, one of each kind
  request('Forbidden', { status: 403, response: null, responseRaw: 'Forbidden' }),
  request('Refused', { response: { data: null, errors: [{ message: 'Not authorised.' }] } }),
  request('Partial', { response: { data: { viewer: null }, errors: [{ message: 'No viewer.' }] } }),
  request('Offline', { ...noResponse }),
  request('GivenUp', { ...noResponse, timedOut: true }),
  // still waiting
  request('Slow', { ...noResponse, pending: true }),
];

const filter = (over: Partial<RequestFilter>): RequestFilter => ({ ...NO_FILTER, ...over });
const names = (kept: GQLRequest[]) => kept.map((r) => r.operationName);

describe('the text of a filter', () => {
  it('keeps the requests whose operation name contains it, whatever the case', () => {
    expect(names(filterRequests(captured, filter({ text: 'rename' })))).toEqual(['Rename', 'OnRename']);
  });

  it('keeps the requests whose URL contains it', () => {
    expect(names(filterRequests(captured, filter({ text: 'OTHER.test' })))).toEqual(['Friends']);
  });
});

describe('the operation types of a filter', () => {
  it('keep the requests of those types', () => {
    expect(names(filterRequests(captured, filter({ types: new Set(['mutation']) })))).toEqual(['Rename']);
    expect(names(filterRequests(captured, filter({ types: new Set(['mutation', 'subscription']) })))).toEqual([
      'Rename',
      'OnRename',
    ]);
  });

  it('keep every type when none is chosen', () => {
    expect(filterRequests(captured, filter({ types: new Set() }))).toHaveLength(10);
  });
});

describe('the states of a filter', () => {
  it('"errors" keeps what went wrong: an HTTP status from 400 up, GraphQL errors, a request that failed before any response, one given up on', () => {
    expect(names(filterRequests(captured, filter({ states: new Set(['errors']) })))).toEqual([
      'Forbidden',
      'Refused',
      'Partial',
      'Offline',
      'GivenUp',
    ]);
  });

  it('"pending" keeps the requests still waiting for their response', () => {
    expect(names(filterRequests(captured, filter({ states: new Set(['pending']) })))).toEqual(['Slow']);
  });

  it('together, they keep the requests in either state', () => {
    expect(names(filterRequests(captured, filter({ states: new Set(['errors', 'pending']) })))).toEqual([
      'Forbidden',
      'Refused',
      'Partial',
      'Offline',
      'GivenUp',
      'Slow',
    ]);
  });
});

describe('a filter', () => {
  it('keeps a request that passes its text, its types and its states all at once', () => {
    const several = [
      request('RenameUser', { operationType: 'mutation', status: 500 }),
      request('RenameTeam', { operationType: 'mutation' }),
      request('RenameQuery', { status: 500 }),
      request('DeleteUser', { operationType: 'mutation', status: 500 }),
    ];

    const kept = filterRequests(
      several,
      filter({ text: 'rename', types: new Set(['mutation']), states: new Set(['errors']) })
    );

    expect(names(kept)).toEqual(['RenameUser']);
  });

  it('gives the list back as it is when it filters nothing', () => {
    expect(filterRequests(captured, NO_FILTER)).toBe(captured);
  });

  it('says whether it filters anything', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering(filter({ text: 'a' }))).toBe(true);
    expect(isFiltering(filter({ types: new Set(['query']) }))).toBe(true);
    expect(isFiltering(filter({ states: new Set(['pending']) }))).toBe(true);
  });
});
