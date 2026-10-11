import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FromPanel, ToPanel } from '../../utils/captureProtocol';

/**
 * The capture, end to end, without a browser: the in-page interceptor, the
 * content script and the background run together, each from its entry point,
 * with a stand-in for the page they share and for the `chrome` API between
 * them. A test plays the page and Chrome, and reads what a panel receives.
 *
 * What this cannot reach is on the other side of the panel's port: the
 * DevTools network events, and Chrome itself.
 */

type Listener = (...args: unknown[]) => unknown;

const TAB = 1;
const REDACTED = '[redacted by GraphQL Inspector]';
const QUERY = 'query Viewer($id: ID) { viewer(id: $id) { name } }';
const BODY = JSON.stringify({ query: QUERY, variables: { id: 1 }, operationName: 'Viewer' });
const ANSWER = '{"data":{"viewer":{"name":"Ada"}}}';
/** What Date.now() reads in the page, and what Chrome gives as the time a request left */
const PAGE_CLOCK = 1_700_000_000_000;
const CHROME_CLOCK = 1_700_000_000_123;

/** Lets every message in flight arrive: each hop between two contexts takes a task */
async function settled() {
  for (let hop = 0; hop < 25; hop++) await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A browser with one tab, the extension installed, and nothing loaded yet */
async function browser(baseURI = 'https://example.test/app/') {
  // ── chrome.*, as the background and the content script each see it ──
  const onMessage: Record<'background' | 'content', Listener[]> = { background: [], content: [] };
  const onConnect: Listener[] = [];
  let onBeforeRequest: Listener = () => {};
  /** Whose listeners are being registered: both contexts call the same chrome.runtime.onMessage */
  let loading: 'background' | 'content' = 'background';

  const later = <T>(deliver: () => T) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(deliver()), 0));

  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: { addListener: (listener: Listener) => onMessage[loading].push(listener) },
      onConnect: { addListener: (listener: Listener) => onConnect.push(listener) },
      // content script → background
      sendMessage: (message: unknown) => {
        const sent = structuredClone(message);
        return later(() => {
          let answer: unknown;
          onMessage.background.forEach((listener) =>
            listener(sent, { tab: { id: TAB } }, (response: unknown) => (answer = response))
          );
          return answer;
        });
      },
    },
    tabs: {
      // background → content script
      sendMessage: (_tabId: number, message: unknown) => {
        const sent = structuredClone(message);
        return later(() => onMessage.content.forEach((listener) => listener(sent)));
      },
    },
    webRequest: {
      onBeforeRequest: { addListener: (listener: Listener) => (onBeforeRequest = listener) },
    },
  });

  /** Chrome sees a request leave the tab, whatever the page used to send it */
  function requestLeaves(method: string, url: string, body: string | null) {
    onBeforeRequest({
      method,
      tabId: TAB,
      url: new URL(url, baseURI).href,
      timeStamp: CHROME_CLOCK,
      requestBody: body === null ? undefined : { raw: [{ bytes: new TextEncoder().encode(body) }] },
    });
  }

  // ── the page ──
  /** Everything posted on the page's message bus, by anyone */
  const posted: unknown[] = [];
  const messageListeners: Listener[] = [];

  const page = {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? init.body : request ? await request.clone().text() : null;
      requestLeaves(method, url, body);
      return later(() => new Response(ANSWER, { status: 200, headers: { 'content-type': 'application/json' } }));
    }) as typeof fetch,

    XMLHttpRequest: class {
      status = 0;
      responseType = '';
      responseText = '';
      private method = '';
      private url = '';
      private loadEnd: Array<() => void> = [];

      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }

      send(body?: string) {
        requestLeaves(this.method.toUpperCase(), this.url, body ?? null);
        void later(() => {
          this.status = 200;
          this.responseText = ANSWER;
          this.loadEnd.forEach((listener) => listener());
        });
      }

      addEventListener(_type: 'loadend', listener: () => void) {
        this.loadEnd.push(listener);
      }

      getAllResponseHeaders() {
        return 'content-type: application/json\r\nset-cookie: session=secret\r\n';
      }
    },

    addEventListener: (_type: 'message', listener: Listener) => messageListeners.push(listener),
    postMessage: (data: unknown) => {
      const sent = structuredClone(data);
      posted.push(sent);
      void later(() => messageListeners.forEach((listener) => listener({ source: page, data: sent })));
    },
  };

  vi.stubGlobal('window', page);
  vi.stubGlobal('document', { baseURI });
  vi.spyOn(Math, 'random').mockReturnValue(0.5); // the interceptor mints its ids from it: "i-1", "i-2", …
  vi.spyOn(Date, 'now').mockReturnValue(PAGE_CLOCK);

  // WXT's helpers are globals at build time; each returns its definition.
  // The entry points are imported here because they call them as they load.
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);
  vi.stubGlobal('defineBackground', (main: unknown) => main);
  const interceptor = (await import('../interceptor.content')).default as unknown as { main(): void };
  const content = (await import('../content')).default as unknown as { main(): void };
  const background = (await import('../background')).default as unknown as () => void;

  loading = 'background';
  background();

  return {
    page,
    posted,

    /** The tab loads a page: the interceptor at document_start, then the content script */
    async loadPage() {
      loading = 'content';
      interceptor.main();
      content.main();
      await settled();
    },

    /** DevTools opens the panel on the tab */
    async openPanel() {
      const received: ToPanel[] = [];
      const fromPanel: Listener[] = [];
      const onDisconnect: Listener[] = [];
      const port = {
        name: 'devtools-panel',
        postMessage: (message: ToPanel) => received.push(structuredClone(message)),
        onMessage: { addListener: (listener: Listener) => fromPanel.push(listener) },
        onDisconnect: { addListener: (listener: Listener) => onDisconnect.push(listener) },
      };
      onConnect.forEach((listener) => listener(port));
      fromPanel.forEach((listener) => listener({ type: 'init', tabId: TAB } satisfies FromPanel));
      await settled();

      return {
        received,
        async close() {
          onDisconnect.forEach((listener) => listener());
          await settled();
        },
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const posting = (body: string, headers?: Record<string, string>): RequestInit => ({
  method: 'POST',
  body,
  headers,
});

describe('a GraphQL request the page sends, with a panel open on its tab', () => {
  it('reaches the panel from both sources, with the response the page read at once', async () => {
    const chrome = await browser();
    await chrome.loadPage();
    const panel = await chrome.openPanel();

    // as test.html does: the response is read as soon as it is there
    const response = await chrome.page.fetch(
      'https://api.test/graphql',
      posting(BODY, { 'Content-Type': 'application/json', Authorization: 'Bearer secret' })
    );
    const read = await response.json();
    await settled();

    expect(read).toEqual({ data: { viewer: { name: 'Ada' } } });
    expect(panel.received).toEqual([
      {
        type: 'gql_pending',
        payload: {
          url: 'https://api.test/graphql',
          query: QUERY,
          variables: { id: 1 },
          operationName: 'Viewer',
          timestamp: CHROME_CLOCK,
        },
      },
      {
        type: 'gql_request',
        payload: {
          id: 'i-1',
          url: 'https://api.test/graphql',
          query: QUERY,
          variables: { id: 1 },
          operationName: 'Viewer',
          requestHeaders: [
            { name: 'authorization', value: REDACTED },
            { name: 'content-type', value: 'application/json' },
          ],
          timestamp: PAGE_CLOCK,
        },
      },
      {
        type: 'gql_response',
        payload: {
          id: 'i-1',
          url: 'https://api.test/graphql',
          status: 200,
          responseHeaders: [{ name: 'content-type', value: 'application/json' }],
          body: ANSWER,
        },
      },
    ]);
  });

  it('is reported under the same absolute URL by both sources when the page wrote a relative one', async () => {
    const chrome = await browser('https://example.test/app/');
    await chrome.loadPage();
    const panel = await chrome.openPanel();

    await chrome.page.fetch('/graphql', posting(BODY));
    await settled();

    expect(panel.received.map((message) => [message.type, message.payload.url])).toEqual([
      ['gql_pending', 'https://example.test/graphql'],
      ['gql_request', 'https://example.test/graphql'],
      ['gql_response', 'https://example.test/graphql'],
    ]);
  });

  it('reaches the panel when it goes through XMLHttpRequest, with the response headers redacted', async () => {
    const chrome = await browser();
    await chrome.loadPage();
    const panel = await chrome.openPanel();

    const xhr = new chrome.page.XMLHttpRequest();
    xhr.open('POST', 'https://api.test/graphql');
    xhr.send(BODY);
    await settled();

    expect(panel.received.map((message) => message.type)).toEqual(['gql_pending', 'gql_request', 'gql_response']);
    expect(panel.received[2].payload).toEqual({
      id: 'i-1',
      url: 'https://api.test/graphql',
      status: 200,
      responseHeaders: [
        { name: 'content-type', value: 'application/json' },
        { name: 'set-cookie', value: REDACTED },
      ],
      body: ANSWER,
    });
  });

  it('is captured on a page that loads while the panel is already open', async () => {
    const chrome = await browser();
    const panel = await chrome.openPanel();
    await chrome.loadPage();

    await chrome.page.fetch('https://api.test/graphql', posting(BODY));
    await settled();

    expect(panel.received.map((message) => message.type)).toEqual(['gql_pending', 'gql_request', 'gql_response']);
  });
});

describe('capture, without a panel open on the tab', () => {
  it('is off: the page sends its request and nothing is posted on its message bus', async () => {
    const chrome = await browser();
    await chrome.loadPage();

    await chrome.page.fetch('https://api.test/graphql', posting(BODY));
    await settled();

    expect(chrome.posted).toEqual([]);
  });

  it('goes off again when the panel closes', async () => {
    const chrome = await browser();
    await chrome.loadPage();
    const panel = await chrome.openPanel();
    await panel.close();

    await chrome.page.fetch('https://api.test/graphql', posting(BODY));
    await settled();

    // the page bus only carried the switch, on then off
    expect(chrome.posted).toEqual([
      { __gqlInspectorControl: true, type: 'activate' },
      { __gqlInspectorControl: true, type: 'deactivate' },
    ]);
    expect(panel.received).toEqual([]);
  });
});

describe('what reaches the panel', () => {
  it('leaves out a POST that is not a GraphQL request', async () => {
    const chrome = await browser();
    await chrome.loadPage();
    const panel = await chrome.openPanel();

    await chrome.page.fetch('https://api.test/users', posting('{"name":"Ada"}'));
    await chrome.page.fetch('https://api.test/form', posting('name=Ada'));
    await settled();

    expect(panel.received).toEqual([]);
  });

  it('leaves out what the page forges under the mark of the interceptor, unless it is a well-formed report', async () => {
    const chrome = await browser();
    await chrome.loadPage();
    const panel = await chrome.openPanel();
    const report = {
      id: 'forged',
      url: 'https://api.test/graphql',
      query: '{ viewer }',
      variables: null,
      operationName: null,
      requestHeaders: [],
      timestamp: 1,
    };

    // a pending request, which only the background reports
    chrome.page.postMessage({ __gqlInspector: true, type: 'gql_pending', payload: report });
    // a report with a field of the wrong type
    chrome.page.postMessage({ __gqlInspector: true, type: 'gql_request', payload: { ...report, url: 5 } });
    // a well-formed report, with more than a report has
    chrome.page.postMessage({
      __gqlInspector: true,
      type: 'gql_request',
      payload: { ...report, extra: 'added by the page' },
    });
    await settled();

    expect(panel.received).toEqual([{ type: 'gql_request', payload: report }]);
  });
});
