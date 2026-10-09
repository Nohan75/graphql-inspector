/**
 * Runs in the page's MAIN world (same JS context as the page).
 *
 * Captures GraphQL traffic by wrapping window.fetch and XMLHttpRequest:
 * both the outbound request AND the response body, correlated by an id we
 * mint ourselves. This path does not depend on chrome.devtools.network —
 * neither onRequestFinished nor getContent — which is why it works when the
 * DevTools network API goes silent.
 *
 * SECURITY — read before changing anything here.
 *
 * Captures leave this file through window.postMessage, which lands on the
 * page's own message bus: every script in the page can read them. Two rules
 * follow, and both are enforced below.
 *
 *   1. Dormant by default. Nothing is captured or posted until the DevTools
 *      panel is open for this tab. Without this the extension would broadcast
 *      GraphQL bodies on every site visited, DevTools open or not.
 *   2. Credentials are redacted. Header values on DENIED_HEADERS never leave
 *      this file; the header name is kept so the panel can still show that it
 *      was sent.
 *
 * A hostile page can forge the activation message, but a page that hostile
 * can already wrap fetch itself — and the data never leaves that same page
 * context. The gate exists to keep quiet on the other sites you browse.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN' as any,   // Chrome 111+ / MV3
  runAt: 'document_start',

  main() {
    if ((window as any).__gqlInspectorActive) return;
    (window as any).__gqlInspectorActive = true;

    const MAX_BODY = 2_000_000; // 2 MB

    /** Header values never forwarded — the name is kept, the value replaced */
    const DENIED_HEADERS = new Set([
      'authorization',
      'proxy-authorization',
      'authentication',
      'cookie',
      'set-cookie',
      'x-api-key',
      'api-key',
      'x-auth-token',
      'x-csrf-token',
      'x-xsrf-token',
    ]);
    const REDACTED = '[redacted by GraphQL Inspector]';

    /** No capture happens until the DevTools panel says it is listening */
    let active = false;

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__gqlInspectorControl !== true) return;
      if (data.type === 'activate') active = true;
      else if (data.type === 'deactivate') active = false;
    });

    /** Unique per page load, so ids never collide across frames */
    const idPrefix = Math.random().toString(36).slice(2, 10);
    let seq = 0;
    const nextId = () => `${idPrefix}-${++seq}`;

    function post(type: string, payload: Record<string, unknown>) {
      if (!active) return;
      try {
        window.postMessage({ __gqlInspector: true, type, payload }, '*');
      } catch {
        // Payload not structured-cloneable — drop it rather than break the page
      }
    }

    function redact(name: string, value: string): string {
      return DENIED_HEADERS.has(name.toLowerCase()) ? REDACTED : value;
    }

    function headerList(headers: Headers | null): Array<{ name: string; value: string }> {
      const out: Array<{ name: string; value: string }> = [];
      if (!headers) return out;
      try {
        headers.forEach((value, name) =>
          out.push({ name, value: redact(name, value) })
        );
      } catch {
        // ignore
      }
      return out;
    }

    /** Parse a body and return the GraphQL fields, or null if it is not GraphQL */
    function asGraphQL(text: string | null) {
      if (!text) return null;
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return null;
      }
      if (!parsed || typeof parsed.query !== 'string') return null;
      return {
        query: parsed.query as string,
        variables:
          parsed.variables && typeof parsed.variables === 'object'
            ? (parsed.variables as Record<string, unknown>)
            : null,
        operationName:
          typeof parsed.operationName === 'string' ? parsed.operationName : null,
      };
    }

    // ── fetch ──────────────────────────────────────────────────────────
    const _fetch = window.fetch.bind(window);

    window.fetch = function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const method = (
        init?.method ??
        (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();

      // Dormant: no body cloning, no capture, no cost
      if (method !== 'POST' || !active) return _fetch(input, init);

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.href
          : (input as Request).url;

      // Read the request body BEFORE handing it to fetch — a Request's body
      // is single-use, so it has to be cloned while it is still intact.
      let bodyText: Promise<string | null>;
      if (typeof init?.body === 'string') {
        bodyText = Promise.resolve(init.body);
      } else if (input instanceof Request) {
        try {
          bodyText = input.clone().text();
        } catch {
          bodyText = Promise.resolve(null);
        }
      } else {
        bodyText = Promise.resolve(null);
      }

      let requestHeaders: Array<{ name: string; value: string }> = [];
      try {
        requestHeaders = headerList(
          new Headers(
            init?.headers ??
              (input instanceof Request ? input.headers : undefined)
          )
        );
      } catch {
        // ignore
      }

      const promise = _fetch(input, init);

      bodyText.then((text) => {
        const gql = asGraphQL(text);
        if (!gql) return;

        const id = nextId();
        post('gql_request', {
          id,
          url,
          query: gql.query,
          variables: gql.variables,
          operationName: gql.operationName,
          requestHeaders,
          timestamp: Date.now(),
        });

        promise.then(
          (res) => {
            const responseHeaders = headerList(res.headers);
            const status = res.status;
            // clone() so the page still receives an unread body
            let copy: Response | null;
            try {
              copy = res.clone();
            } catch {
              copy = null;
            }
            if (!copy) {
              post('gql_response', { id, url, status, responseHeaders, body: '' });
              return;
            }
            copy.text().then(
              (body) =>
                post('gql_response', {
                  id,
                  url,
                  status,
                  responseHeaders,
                  body: body.slice(0, MAX_BODY),
                }),
              () =>
                post('gql_response', { id, url, status, responseHeaders, body: '' })
            );
          },
          () => post('gql_response', { id, url, status: 0, responseHeaders: [], body: '' })
        );
      });

      return promise;
    };

    // ── XMLHttpRequest ─────────────────────────────────────────────────
    // Some GraphQL clients still use XHR; without this they would show up as
    // pending rows that never resolve.
    const XHR = window.XMLHttpRequest;
    const _open = XHR.prototype.open;
    const _send = XHR.prototype.send;

    XHR.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: any[]
    ) {
      (this as any).__gqlMethod = String(method ?? '').toUpperCase();
      (this as any).__gqlUrl = typeof url === 'string' ? url : String(url);
      return (_open as any).call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (this: XMLHttpRequest, body?: any) {
      const method = (this as any).__gqlMethod;
      const url = (this as any).__gqlUrl;

      if (active && method === 'POST' && typeof body === 'string') {
        const gql = asGraphQL(body);
        if (gql) {
          const id = nextId();
          post('gql_request', {
            id,
            url,
            query: gql.query,
            variables: gql.variables,
            operationName: gql.operationName,
            requestHeaders: [],
            timestamp: Date.now(),
          });

          this.addEventListener('loadend', () => {
            let responseText: string;
            try {
              // responseType '' or 'text' exposes responseText; others do not
              responseText = this.responseType === '' || this.responseType === 'text'
                ? this.responseText ?? ''
                : '';
            } catch {
              responseText = '';
            }
            const responseHeaders: Array<{ name: string; value: string }> = [];
            try {
              for (const line of (this.getAllResponseHeaders() || '').trim().split(/[\r\n]+/)) {
                const sep = line.indexOf(':');
                if (sep > 0) {
                  const name = line.slice(0, sep).trim();
                  responseHeaders.push({
                    name,
                    value: redact(name, line.slice(sep + 1).trim()),
                  });
                }
              }
            } catch {
              // ignore
            }
            post('gql_response', {
              id,
              url,
              status: this.status,
              responseHeaders,
              body: responseText.slice(0, MAX_BODY),
            });
          });
        }
      }

      return (_send as any).call(this, body);
    };
  },
});
