import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageCaptureSwitch, readPageReport, type InterceptorReport } from '../../utils/captureProtocol';

type MessageListener = (event: { source: unknown; data: unknown }) => void;

const BODY = JSON.stringify({ query: '{ me }' });
const ANSWER = '{"data":{"me":null}}';

/**
 * The page's own XMLHttpRequest: it answers as soon as it is sent. A class
 * per page, since the interceptor patches its prototype.
 */
function pageXHR() {
  return class {
    status = 0;
    responseType = '';
    responseText = '';
    private loadEnd: Array<() => void> = [];

    open(_method: string, _url: string) {}

    send(_body?: string) {
      this.status = 200;
      this.responseText = ANSWER;
      this.loadEnd.forEach((listener) => listener());
    }

    addEventListener(_type: 'loadend', listener: () => void) {
      this.loadEnd.push(listener);
    }

    getAllResponseHeaders() {
      return 'content-type: application/json\r\n';
    }
  };
}

/**
 * Loads the interceptor into a stand-in for the page, the way the browser
 * does at document_start, then turns capture on as the content script would.
 * `reports` collects what the interceptor posts on the page bus.
 */
async function loadPage(baseURI: string) {
  const reports: InterceptorReport[] = [];
  const listeners: MessageListener[] = [];
  const page = {
    fetch: (async () => new Response(ANSWER, { status: 200 })) as typeof fetch,
    XMLHttpRequest: pageXHR(),
    addEventListener: (_type: 'message', listener: MessageListener) => listeners.push(listener),
    postMessage: (data: unknown) => {
      const report = readPageReport(data);
      if (report) reports.push(report);
    },
  };

  vi.stubGlobal('window', page);
  vi.stubGlobal('document', { baseURI });
  // WXT's helper is a global at build time; it returns its definition
  vi.stubGlobal('defineContentScript', (definition: unknown) => definition);

  // Imported here: the entry point calls defineContentScript as it loads
  const { default: interceptor } = await import('../interceptor.content');
  (interceptor as { main(): void }).main();
  listeners.forEach((listener) => listener({ source: page, data: pageCaptureSwitch(true) }));

  return { page, reports };
}

/** Each report with the URL it carries, once the request and its response are both in */
async function reportedUrls(reports: InterceptorReport[]) {
  await vi.waitFor(() => expect(reports).toHaveLength(2));
  return reports.map((report) => [report.type, report.payload.url]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the URL the interceptor reports', () => {
  it('is absolute when the page fetches a relative URL', async () => {
    const { page, reports } = await loadPage('https://example.test/app/');

    await page.fetch('/graphql', { method: 'POST', body: BODY });

    expect(await reportedUrls(reports)).toEqual([
      ['gql_request', 'https://example.test/graphql'],
      ['gql_response', 'https://example.test/graphql'],
    ]);
  });

  it('is resolved against the base URL of the document', async () => {
    const { page, reports } = await loadPage('https://example.test/app/index.html');

    await page.fetch('api/graphql', { method: 'POST', body: BODY });

    expect(await reportedUrls(reports)).toEqual([
      ['gql_request', 'https://example.test/app/api/graphql'],
      ['gql_response', 'https://example.test/app/api/graphql'],
    ]);
  });

  it('is absolute when the page sends to a relative URL through XMLHttpRequest', async () => {
    const { page, reports } = await loadPage('https://example.test/app/');

    const xhr = new page.XMLHttpRequest();
    xhr.open('POST', '/graphql');
    xhr.send(BODY);

    expect(await reportedUrls(reports)).toEqual([
      ['gql_request', 'https://example.test/graphql'],
      ['gql_response', 'https://example.test/graphql'],
    ]);
  });

  it('is the one the page gave when that one is absolute', async () => {
    const { page, reports } = await loadPage('https://example.test/app/');

    await page.fetch('https://api.test/graphql', { method: 'POST', body: BODY });

    expect(await reportedUrls(reports)).toEqual([
      ['gql_request', 'https://api.test/graphql'],
      ['gql_response', 'https://api.test/graphql'],
    ]);
  });
});
