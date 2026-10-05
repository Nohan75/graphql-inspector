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
  /** True while the network response has not yet been received */
  pending?: boolean;
  /** True when the response never arrived and the pending entry was given up on */
  timedOut?: boolean;
}

export type TabId = 'headers' | 'request' | 'response' | 'raw';

export type SandboxFormat = 'auto' | 'apollo' | 'apollo-no-endpoint' | 'graphiql';

export interface Settings {
  sandboxUrl: string;
  sandboxFormat: SandboxFormat;
}
