import { useState, useEffect, useRef, useCallback } from 'react';
import type { GQLRequest } from '../types';
import {
  parseGraphQLBody,
  parseOperationType,
  parseOperationName,
} from '../utils/graphql';

const MAX_REQUESTS = 500;
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

      request.getContent((body) => {
        let response: unknown = null;
        let responseRaw = body ?? '';

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
