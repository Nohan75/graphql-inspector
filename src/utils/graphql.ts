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
