import type { SandboxFormat } from '../utils/sandbox';

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
  /**
   * How long the request took, in milliseconds: from when it was sent to when
   * its response had arrived, or to its failure. Undefined until then, and
   * when no source measured it.
   */
  duration?: number;
  /**
   * Size in bytes of the whole response body, uncompressed. `responseRaw` may
   * only hold the beginning of it. Undefined until the response has arrived,
   * and when no source measured it.
   */
  responseSize?: number;
}

export type TabId = 'headers' | 'request' | 'response' | 'raw';

export interface Settings {
  sandboxUrl: string;
  sandboxFormat: SandboxFormat;
}
