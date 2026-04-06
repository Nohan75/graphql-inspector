import { useState, useEffect, useRef, useCallback } from 'react';
import type { GQLRequest } from '../types';
import {
  parseGraphQLBody,
  parseOperationType,
  parseOperationName,
} from '../utils/graphql';

const MAX_REQUESTS = 500;
const MAX_QUERY_LENGTH = 500_000;   // 500 KB
const MAX_BODY_LENGTH = 2_000_000;  // 2 MB
let requestIdCounter = 0;

export function useRequests(preserveLog: boolean) {
  const [requests, setRequests] = useState<GQLRequest[]>([]);
  const preserveLogRef = useRef(preserveLog);

  useEffect(() => {
    preserveLogRef.current = preserveLog;
  }, [preserveLog]);

  const clearRequests = useCallback(() => {
    setRequests([]);
  }, []);

  useEffect(() => {
    function handleRequestFinished(
      request: chrome.devtools.network.Request
    ) {
      // Only intercept POST requests
      if (request.request.method !== 'POST') return;

      const postData = request.request.postData;
      if (!postData?.text) return;

      const parsed = parseGraphQLBody(postData.text);
      if (!parsed) return;

      const { query, variables, operationName } = parsed;

      // Reject abnormally large queries (e.g. generated/injected payloads)
      if (query.length > MAX_QUERY_LENGTH) return;

      request.getContent((body) => {
        let response: unknown = null;
        // Truncate oversized response bodies to avoid memory exhaustion
        let responseRaw = (body ?? '').slice(0, MAX_BODY_LENGTH);

        try {
          response = JSON.parse(responseRaw);
        } catch {
          response = null;
        }

        const id = ++requestIdCounter;
        const entry: GQLRequest = {
          id,
          operationName:
            operationName ?? parseOperationName(query) ?? 'Anonymous',
          operationType: parseOperationType(query),
          query,
          variables,
          requestHeaders: (request.request.headers ?? []).map((h) => ({
            name: h.name,
            value: h.value,
          })),
          responseHeaders: (request.response.headers ?? []).map((h) => ({
            name: h.name,
            value: h.value,
          })),
          response,
          responseRaw,
          status: request.response.status,
          url: request.request.url,
          timestamp: Date.now(),
        };

        setRequests((prev) => {
          const next = [...prev, entry];
          if (next.length > MAX_REQUESTS) {
            return next.slice(next.length - MAX_REQUESTS);
          }
          return next;
        });
      });
    }

    function handleNavigated() {
      if (!preserveLogRef.current) {
        setRequests([]);
      }
    }

    chrome.devtools.network.onRequestFinished.addListener(
      handleRequestFinished
    );
    chrome.devtools.network.onNavigated.addListener(handleNavigated);

    return () => {
      chrome.devtools.network.onRequestFinished.removeListener(
        handleRequestFinished
      );
      chrome.devtools.network.onNavigated.removeListener(handleNavigated);
    };
  }, []);

  return { requests, clearRequests };
}
