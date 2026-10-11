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
 * context. The capture switch exists to keep quiet on the other sites you
 * browse.
 */
import {
  pageReport,
  parseGraphQLBody,
  readPageCaptureSwitch,
  type InterceptorReport,
  type Header,
} from '../utils/captureProtocol';

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
      const on = readPageCaptureSwitch(event.data);
      if (on !== null) active = on;
    });

    /** Unique per page load, so ids never collide across frames */
    const idPrefix = Math.random().toString(36).slice(2, 10);
    let seq = 0;
    const nextId = () => `${idPrefix}-${++seq}`;

    function post(report: InterceptorReport) {
      if (!active) return;
      try {
        window.postMessage(pageReport(report), '*');
      } catch {
        // Payload not structured-cloneable — drop it rather than break the page
      }
    }

    /**
     * The URL the way the browser resolves it to send the request: absolute,
     * against the base URL of the document. chrome.webRequest reports the
     * same request under that URL, and the panel pairs the two by it.
     */
    function absolute(url: string): string {
      try {
        return new URL(url, document.baseURI).href;
      } catch {
        return url; // not a URL the browser can send to either
      }
    }

    function redact(name: string, value: string): string {
      return DENIED_HEADERS.has(name.toLowerCase()) ? REDACTED : value;
    }

    function headerList(headers: Headers | null): Header[] {
      const out: Header[] = [];
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

      const url = absolute(
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.href
          : typeof (input as Request).url === 'string'
          ? (input as Request).url
          : String(input) // what fetch itself does with anything else
      );

      // Read the request body BEFORE handing it to fetch — a Request's body
      // is single-use, so it has to be cloned while it is still intact.
      let bodyText: Promise<string | null>;
      if (typeof init?.body === 'string') {
        bodyText = Promise.resolve(init.body);
      } else if (input instanceof Request) {
        try {
          bodyText = input.clone().text().catch(() => null);
        } catch {
          bodyText = Promise.resolve(null);
        }
      } else {
        bodyText = Promise.resolve(null);
      }

      let requestHeaders: Header[] = [];
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

      // Copy the response BEFORE the page can read it: once read, a response
      // cannot be cloned. The handlers of a promise run in the order they
      // were attached, so this one is attached here, before the page gets the
      // promise back, and not below, once the request body has been read.
      let wanted = true;
      const response = promise.then(
        (res) => {
          let copy: Response | null = null;
          if (wanted) {
            try {
              copy = res.clone();
            } catch {
              // already read or locked: reported without its body
            }
          }
          return { res, copy };
        },
        () => null // the request failed before any response
      );

      bodyText.then((text) => {
        const gql = parseGraphQLBody(text);
        if (!gql) {
          // Not a GraphQL request: its response is left alone. A copy taken
          // while the request body was still being read is let go of, or it
          // would hold the response body for as long as the page reads it.
          wanted = false;
          response.then((r) => r?.copy?.body?.cancel()).catch(() => {});
          return;
        }

        const id = nextId();
        post({
          type: 'gql_request',
          payload: { id, url, ...gql, requestHeaders, timestamp: Date.now() },
        });

        const respond = (status: number, responseHeaders: Header[], body: string) =>
          post({ type: 'gql_response', payload: { id, url, status, responseHeaders, body } });

        response.then((r) => {
          if (!r) {
            respond(0, [], '');
            return;
          }
          const responseHeaders = headerList(r.res.headers);
          const status = r.res.status;
          if (!r.copy) {
            respond(status, responseHeaders, '');
            return;
          }
          r.copy.text().then(
            (body) => respond(status, responseHeaders, body.slice(0, MAX_BODY)),
            () => respond(status, responseHeaders, '')
          );
        });
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
      (this as any).__gqlUrl = absolute(typeof url === 'string' ? url : String(url));
      return (_open as any).call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (this: XMLHttpRequest, body?: any) {
      const method = (this as any).__gqlMethod;
      const url = (this as any).__gqlUrl;

      if (active && method === 'POST' && typeof body === 'string') {
        const gql = parseGraphQLBody(body);
        if (gql) {
          const id = nextId();
          post({
            type: 'gql_request',
            payload: { id, url, ...gql, requestHeaders: [], timestamp: Date.now() },
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
            const responseHeaders: Header[] = [];
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
            post({
              type: 'gql_response',
              payload: {
                id,
                url,
                status: this.status,
                responseHeaders,
                body: responseText.slice(0, MAX_BODY),
              },
            });
          });
        }
      }

      return (_send as any).call(this, body);
    };
  },
});
