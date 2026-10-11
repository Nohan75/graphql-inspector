import type { OperationType } from '../types';

const ALLOWED_OPERATION_TYPES: OperationType[] = ['query', 'mutation', 'subscription'];

/**
 * Parse a GraphQL operation type from a query string.
 */
export function parseOperationType(query: string): OperationType {
  const trimmed = query.trim().toLowerCase();
  for (const type of ALLOWED_OPERATION_TYPES) {
    if (trimmed.startsWith(type)) {
      return type;
    }
  }
  // Shorthand query (no keyword)
  if (trimmed.startsWith('{')) {
    return 'query';
  }
  return 'query';
}

/**
 * Parse an operation name from a GraphQL query string.
 */
export function parseOperationName(query: string): string {
  const match = query.match(
    /(?:query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/
  );
  return match?.[1] ?? 'Anonymous';
}

/**
 * The messages of the GraphQL errors a response carries: one per entry of
 * its `errors`, when the response is an object and `errors` a list.
 *
 * A GraphQL server usually answers 200 when an operation fails, so the HTTP
 * status does not tell whether it did.
 */
export function graphqlErrors(response: unknown): string[] {
  if (typeof response !== 'object' || response === null || Array.isArray(response)) return [];
  const { errors } = response as { errors?: unknown };
  if (!Array.isArray(errors)) return [];

  return errors.map((error: unknown) => {
    if (typeof error === 'string') return error;
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message !== '' ? message : 'Error without a message';
  });
}
