import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageCaptureSwitch, readPageReport, type InterceptorReport } from '../../utils/captureProtocol';

type MessageListener = (event: { source: unknown; data: unknown }) => void;

const BODY = JSON.stringify({ query: '{ me }' });
const ANSWER = '{"data":{"me":null}}';

/** What performance.now() reads in the page. A stand-in for the network moves it by the time it takes. */
let pageTimer = 0;

/**
 * The page's own XMLHttpRequest: it answers as soon as it is sent, after
 * `takes` milliseconds on the page's timer. A class per page, since the
 * interceptor patches its prototype.
 */
function pageXHR(takes = 0) {
  return class {
    status = 0;
    responseType = '';
    responseText = '';
    private loadEnd: Array<() => void> = [];

    open(_method: string, _url: string) {}

    send(_body?: string) {
      pageTimer += takes;
      this.status = 200;
      // as a browser does: the text is only there for a response read as text
      this.responseText = this.responseType === '' ? ANSWER : '';
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
 * The page's own fetch: the response arrives in a later task, as from a
 * network, after `takes` milliseconds on the page's timer
 */
const answers = (response: () => Response, takes = 0) => () =>
  new Promise<Response>((resolve) =>
    setTimeout(() => {
      pageTimer += takes;
      resolve(response());
    }, 0)
  );

/**
 * Loads the interceptor into a stand-in for the page, the way the browser
 * does at document_start, then turns capture on as the content script would.
 * `reports` collects what the interceptor posts on the page bus.
 */
async function loadPage(
  baseURI: string,
  pageFetch: () => Promise<Response> = answers(() => new Response(ANSWER, { status: 200 })),
  PageXHR = pageXHR()
) {
  const reports: InterceptorReport[] = [];
  const listeners: MessageListener[] = [];
  const page = {
    fetch: pageFetch as typeof fetch,
    XMLHttpRequest: PageXHR,
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

beforeEach(() => {
  pageTimer = 1_000;
  vi.spyOn(performance, 'now').mockImplementation(() => pageTimer);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The one response report, once it is in */
async function reportedResponse(reports: InterceptorReport[]) {
  await vi.waitFor(() => expect(reports).toHaveLength(2));
  const [, response] = reports;
  if (response.type !== 'gql_response') throw new Error('no response reported');
  return response.payload;
}

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

describe('the response the interceptor reports for a fetch', () => {
  const BASE = 'https://example.test/';
  const URL = 'https://api.test/graphql';

  it('has its body when the page reads the response as soon as it has it', async () => {
    const { page, reports } = await loadPage(BASE);

    const response = await page.fetch(URL, { method: 'POST', body: BODY });
    const read = await response.text();

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: ANSWER });
    expect(read).toBe(ANSWER); // and the page still reads its own
  });

  it('has its body when the page chains the reading on the fetch', async () => {
    const { page, reports } = await loadPage(BASE);

    await page.fetch(URL, { method: 'POST', body: BODY }).then((response) => response.json());

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: ANSWER });
  });

  it('has its body when the page never reads the response', async () => {
    const { page, reports } = await loadPage(BASE);

    await page.fetch(URL, { method: 'POST', body: BODY });

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: ANSWER });
  });

  it('has its body when the request is a Request object', async () => {
    const { page, reports } = await loadPage(BASE);

    const response = await page.fetch(new Request(URL, { method: 'POST', body: BODY }));
    await response.text();

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: ANSWER });
  });

  it('has status 0 and no body when the request fails, and the page gets the failure', async () => {
    const failure = new TypeError('Failed to fetch');
    const { page, reports } = await loadPage(BASE, () => Promise.reject(failure));

    await expect(page.fetch(URL, { method: 'POST', body: BODY })).rejects.toBe(failure);

    expect(await reportedResponse(reports)).toMatchObject({ status: 0, responseHeaders: [], body: '' });
  });
});

describe('what the interceptor measures of a request', () => {
  const BASE = 'https://example.test/';
  const URL = 'https://api.test/graphql';

  it('is how long it took, from when the page sent it to when its response was read', async () => {
    const { page, reports } = await loadPage(BASE, answers(() => new Response(ANSWER), 120));

    await page.fetch(URL, { method: 'POST', body: BODY });

    expect(await reportedResponse(reports)).toMatchObject({ duration: 120 });
  });

  it('is the size of the response body in bytes, not in characters', async () => {
    // 21 characters, of which "ë" takes two bytes
    const { page, reports } = await loadPage(BASE, answers(() => new Response('{"data":{"me":"Zoë"}}')));

    await page.fetch(URL, { method: 'POST', body: BODY });

    expect(await reportedResponse(reports)).toMatchObject({ body: '{"data":{"me":"Zoë"}}', size: 22 });
  });

  it('is the size of the whole body, of which the report only has the first 2 000 000 characters', async () => {
    const { page, reports } = await loadPage(BASE, answers(() => new Response('x'.repeat(2_000_001))));

    await page.fetch(URL, { method: 'POST', body: BODY });

    const response = await reportedResponse(reports);
    expect(response.body).toHaveLength(2_000_000);
    expect(response.size).toBe(2_000_001);
  });

  it('has no size when the response body could not be read', async () => {
    const locked = new Response(ANSWER, { status: 200 });
    locked.clone = () => {
      throw new TypeError('Response body is already used');
    };
    const { page, reports } = await loadPage(BASE, answers(() => locked, 45));

    await page.fetch(URL, { method: 'POST', body: BODY });

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: '', size: null, duration: 45 });
  });

  it('is how long the request took to fail, and a size of 0, when it fails', async () => {
    const failing = () =>
      new Promise<Response>((_resolve, reject) =>
        setTimeout(() => {
          pageTimer += 30;
          reject(new TypeError('Failed to fetch'));
        }, 0)
      );
    const { page, reports } = await loadPage(BASE, failing);

    await expect(page.fetch(URL, { method: 'POST', body: BODY })).rejects.toThrow('Failed to fetch');

    expect(await reportedResponse(reports)).toMatchObject({ status: 0, duration: 30, size: 0 });
  });

  it('is measured the same way for a request sent through XMLHttpRequest', async () => {
    const { page, reports } = await loadPage(BASE, undefined, pageXHR(75));

    const xhr = new page.XMLHttpRequest();
    xhr.open('POST', URL);
    xhr.send(BODY);

    // ANSWER is 20 characters, each of one byte
    expect(await reportedResponse(reports)).toMatchObject({ body: ANSWER, duration: 75, size: 20 });
  });

  it('has no size when an XMLHttpRequest does not give its response as text', async () => {
    const { page, reports } = await loadPage(BASE);

    const xhr = new page.XMLHttpRequest();
    xhr.responseType = 'json';
    xhr.open('POST', URL);
    xhr.send(BODY);

    expect(await reportedResponse(reports)).toMatchObject({ status: 200, body: '', size: null });
  });
});

describe('a POST that is not a GraphQL request', () => {
  /** A response that counts the copies taken of it */
  function countedResponse() {
    const response = new Response('saved', { status: 200 });
    const copies: Response[] = [];
    const clone = response.clone.bind(response);
    response.clone = () => {
      const copy = clone();
      copies.push(copy);
      return copy;
    };
    return { response, copies };
  }

  const settled = () => new Promise((resolve) => setTimeout(resolve, 20));

  it('keeps its response to itself: no copy is taken and nothing is reported', async () => {
    const { response, copies } = countedResponse();
    const { page, reports } = await loadPage('https://example.test/', answers(() => response));

    const got = await page.fetch('https://api.test/form', { method: 'POST', body: 'name=Ada' });
    await settled();

    expect(got).toBe(response);
    expect(copies).toEqual([]);
    expect(reports).toEqual([]);
  });

  it('leaves no copy of its response behind, even when the response came before the request body was read', async () => {
    const { response, copies } = countedResponse();
    // The response is there at once, while the body of a Request is still being read
    const { page, reports } = await loadPage('https://example.test/', async () => response);

    const got = await page.fetch(new Request('https://api.test/form', { method: 'POST', body: 'name=Ada' }));
    await settled();

    expect(await got.text()).toBe('saved'); // the page reads its own response
    // a copy that was cancelled counts as used, and holds nothing
    expect(copies.filter((copy) => !copy.bodyUsed)).toEqual([]);
    expect(reports).toEqual([]);
  });
});
