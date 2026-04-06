export type OperationType = 'query' | 'mutation' | 'subscription';

export interface GQLRequest {
  id: number;
  operationName: string;
  operationType: OperationType;
  query: string;
  variables: Record<string, unknown> | null;
  requestHeaders: Array<{ name: string; value: string }>;
  responseHeaders: Array<{ name: string; value: string }>;
  response: unknown;
  responseRaw: string;
  status: number;
  url: string;
  timestamp: number;
}

export type TabId = 'headers' | 'request' | 'response' | 'raw';

export interface Settings {
  sandboxUrl: string;
}
