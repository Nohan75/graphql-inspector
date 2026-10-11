import type { GQLRequest, OperationType } from '../types';
import { graphqlErrors } from './graphql';

/**
 * A state the list can be narrowed to:
 * - `errors`: what went wrong, whichever way it shows;
 * - `pending`: what still waits for its response.
 */
export type RequestState = 'errors' | 'pending';

/** What narrows the request list. A request is kept when it passes all three. */
export interface RequestFilter {
  /** Looked for in the operation name and in the URL, whatever the case. Empty keeps everything. */
  text: string;
  /** The operation types to keep. None keeps every type. */
  types: ReadonlySet<OperationType>;
  /** The states to keep: a request in any of them is. None keeps every state. */
  states: ReadonlySet<RequestState>;
}

export const NO_FILTER: RequestFilter = { text: '', types: new Set(), states: new Set() };

export function isFiltering({ text, types, states }: RequestFilter): boolean {
  return text !== '' || types.size > 0 || states.size > 0;
}

/**
 * Something went wrong with a request when it got an HTTP status from 400
 * up, when its response carries GraphQL errors, when it failed before any
 * response, or when it was given up on.
 */
function wentWrong(request: GQLRequest): boolean {
  if (request.pending) return false;
  return (
    request.timedOut === true ||
    request.status >= 400 ||
    request.status === 0 ||
    graphqlErrors(request.response).length > 0
  );
}

function inState(request: GQLRequest, state: RequestState): boolean {
  return state === 'pending' ? request.pending === true : wentWrong(request);
}

/** The captured requests a filter keeps, in their order. The list itself when it filters nothing. */
export function filterRequests(requests: GQLRequest[], filter: RequestFilter): GQLRequest[] {
  if (!isFiltering(filter)) return requests;

  const text = filter.text.toLowerCase();
  const states = [...filter.states];
  return requests.filter(
    (request) =>
      (text === '' ||
        request.operationName.toLowerCase().includes(text) ||
        request.url.toLowerCase().includes(text)) &&
      (filter.types.size === 0 || filter.types.has(request.operationType)) &&
      (states.length === 0 || states.some((state) => inState(request, state)))
  );
}
