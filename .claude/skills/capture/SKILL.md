---
name: capture
description: "Check a change to the capture without a browser: the in-page interceptor, the content script and the background, run together by tests. Use when changing src/entrypoints or src/utils/captureProtocol.ts."
---

The capture only runs in a browser, with the extension loaded. Two tests run it without one, from the entry points themselves, with a stand-in for the page and for `chrome`:

- `src/entrypoints/__tests__/captureChain.test.ts`: the interceptor, the content script and the background together. A test plays the page and Chrome, and reads what a panel receives.
- `src/entrypoints/__tests__/interceptor.test.ts`: the interceptor alone, and what it posts on the page's message bus.

## Steps

1. **Write the scenario the change is about** as a test: in the first file when it is about what reaches the panel, in the second when it is about one thing the interceptor reports. Have the page behave as a real one: `test.html` reads a response as soon as it has it, and most pages send to a relative URL. Done when a test fails without the change. For a change meant to alter nothing, done when the scenarios it touches are there and pass before and after.
2. **Run every check**: `npm run check`. Done when it passes.
3. **Hand over what the tests cannot reach** (below). Run `npm run build`, which rewrites the folder the maintainer loads in the browser, and say which branch that build is and what to try on `test.html`. Done when the pull request says what the tests ran and what a person has to check.

## What the tests cannot reach

- The DevTools side: the `chrome.devtools.network` events and the panel's port in a real DevTools. `src/utils/requestLog.ts` pairs what arrives there and has its own tests, on reports whose order and times were written by hand. That goes for the duration and the response size DevTools gives too: `src/hooks/useRequests.ts` reads them from `time` and `response.content.size` of a finished request, and no test plays a real one. When comparing by hand, `time` starts when the page issued the request: it is longer than the **Time** column of the Network panel by what its **Timing** tab shows as **Queueing**. `response.content.size` is the response body alone, where the **Size** column counts the headers too.
- Chrome itself: the stand-ins answer the way `fetch`, `XMLHttpRequest`, `window.postMessage` and `chrome.runtime` are documented to. A service worker going to sleep, a page with a strict content security policy or a request sent from a worker are not played.

A trace brings the DevTools side back within reach, once someone has recorded it in a browser: the README says how, under "Traces". It holds what the background, the interceptor and DevTools reported and when, the clock's ticks, and each time the list was cleared. `replay` in `src/utils/trace.ts` plays it into a request log in a test.

## Where to change it

Both tests build their stand-ins themselves, at the top of the file.

- In `captureChain.test.ts`, `browser()` is a browser with one tab. `requestLeaves` is Chrome seeing a request leave, which is what feeds `chrome.webRequest`; the page's `fetch` and `XMLHttpRequest` call it, then answer in a later task, as a network does. Extend it when the capture starts using a new part of `chrome`.
- The interceptor times a request with `performance.now()`, which both tests replace by a timer of their own. It only moves when the stand-in for the network answers: by `NETWORK_TIME` in `captureChain.test.ts`, by the time a test gives to `answers` or to `pageXHR` in `interceptor.test.ts`. That is the duration a response report then carries.
- Every hop between two contexts takes a task, so a test awaits `settled()` before reading what the panel received.
