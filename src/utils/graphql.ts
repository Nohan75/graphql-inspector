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
 * Strip common leading whitespace indentation from a query string.
 */
export function stripCommonIndent(query: string): string {
  const lines = query.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return query;

  const minIndent = Math.min(
    ...nonEmpty.map((l) => l.match(/^(\s*)/)?.[1].length ?? 0)
  );
  if (minIndent === 0) return query;

  return lines.map((l) => l.slice(minIndent)).join('\n');
}

/**
 * Determine if a network request is a GraphQL request.
 */
export function isGraphQLRequest(body: string): boolean {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === 'object' && parsed !== null && 'query' in parsed;
  } catch {
    return false;
  }
}

/**
 * Parse the POST body of a network request to extract GraphQL fields.
 */
export function parseGraphQLBody(body: string): {
  query: string;
  variables: Record<string, unknown> | null;
  operationName: string | null;
} | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('query' in parsed)) {
      return null;
    }
    return {
      query: String(parsed.query ?? ''),
      variables:
        parsed.variables && typeof parsed.variables === 'object'
          ? (parsed.variables as Record<string, unknown>)
          : null,
      operationName: parsed.operationName
        ? String(parsed.operationName)
        : null,
    };
  } catch {
    return null;
  }
}
