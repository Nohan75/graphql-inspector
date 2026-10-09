# GraphQL Inspector

A DevTools extension (Manifest V3) that adds a **GraphQL** tab to the browser's developer tools. It lists the GraphQL requests sent by the page and lets you inspect the query, variables, headers and response of each one.

## Table of contents

- [Installing in developer mode](#installing-in-developer-mode)
  - [1. Get the extension](#1-get-the-extension)
  - [2. Load the extension in the browser](#2-load-the-extension-in-the-browser)
  - [3. Open the panel](#3-open-the-panel)
  - [Updating the extension](#updating-the-extension)
- [Development](#development)
  - [Scripts](#scripts)
  - [Releases](#releases)
  - [Test page](#test-page)
- [Features](#features)
  - [Request capture](#request-capture)
  - [Request list](#request-list)
  - [Request details](#request-details)
  - [Open in a sandbox](#open-in-a-sandbox)
  - [Compare mode](#compare-mode)
  - [Settings](#settings)
  - [Privacy](#privacy)
- [Known limits](#known-limits)
- [Project structure](#project-structure)
  - [Requested permissions](#requested-permissions)

## Installing in developer mode

The extension is not published on the Chrome Web Store. It is loaded as an unpacked extension, from the `.zip` attached to a release or from a local build.

It runs on Chrome 111+ and Chromium-based browsers (Edge, Brave…). Firefox has not been tested.

### 1. Get the extension

#### Option A: from the release archive

This is the shortest path: no Node.js, no build.

1. Open the [latest release](https://github.com/Nohan75/graphql-inspector/releases/latest).
2. Under **Assets**, download `gql-network-<version>-chrome.zip`.
3. Extract the archive into a folder you will keep.

The browser loads the extracted folder, not the `.zip`, and reads it again every time it starts: if that folder is moved or deleted, the extension stops working.

#### Option B: from source

This requires Node.js 20.19+ or 22.12+, with npm.

```bash
git clone https://github.com/Nohan75/graphql-inspector.git
cd graphql-inspector
npm install
npm run build
```

The build is written to `.output/chrome-mv3/`.

### 2. Load the extension in the browser

1. Open `chrome://extensions` (`edge://extensions` on Edge).
2. Turn on **Developer mode** (a toggle in the top-right corner on Chrome, in the left-hand menu on Edge).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json`: the folder extracted from the archive (option A) or `.output/chrome-mv3` (option B).

On macOS, the file picker hides folders whose name starts with a dot, such as `.output`: `Cmd + Shift + .` shows them.

### 3. Open the panel

1. Open the page you want to inspect, then DevTools (`F12`).
2. Click the **GraphQL** tab. If it is not visible, it is behind the `»` chevron in the DevTools tab bar.
3. Reload the page or trigger an action that sends GraphQL requests.

Two things to know:

- Capture only starts once the **GraphQL** tab has been opened. Requests sent before that do not appear.
- Right after installing, pages that were already open must be reloaded, and DevTools closed and reopened.

### Updating the extension

An unpacked extension does not update itself.

1. Option A: download the archive from the new release and replace the contents of the extracted folder. Option B: pull the latest source and run `npm run build` again.
2. In `chrome://extensions`, click the extension's reload icon.
3. Close and reopen DevTools, then reload the page.

## Development

`npm run dev` starts WXT in development mode: it opens a dedicated Chrome instance with the extension already loaded and rebuilds on every change. This development build is written to `.output/chrome-mv3-dev/`.

To test a production build after a change, follow the steps in [Updating the extension](#updating-the-extension).

### Scripts

| Command | Effect |
| --- | --- |
| `npm run dev` | Development build with automatic reload |
| `npm run build` | Production build in `.output/chrome-mv3/` |
| `npm run zip` | Production build, then a `.zip` archive in `.output/`, the one attached to releases |
| `npm test` | Runs the tests once with Vitest |

Tests sit next to the code they cover, as `*.test.ts` files under `src/`.

### Releases

The release archive is published by a GitHub Actions workflow, [`.github/workflows/release.yml`](.github/workflows/release.yml):

- There is one release per version, and the version lives in `package.json` only: WXT copies it into the manifest. To publish, run `npm version patch` (or `minor`, `major`) and commit the result. The next push to `main` creates the release `v<version>`, tagged on that commit, with the zip attached.
- `npm version` only edits `package.json` and `package-lock.json` here: `.npmrc` turns off the commit and tag it would otherwise create, so the workflow is the only thing that creates release tags.
- The tests run before the zip is built. If one fails, the job stops and nothing is published.
- A push that leaves the version unchanged runs the tests and builds the zip but publishes nothing.
- Pull requests targeting `main` run the same tests and build as a check, without publishing anything.

### Test page

`test.html`, at the repository root, has buttons that send queries and mutations to public GraphQL APIs (Rick and Morty, Countries), so you can try the extension without a GraphQL project at hand.

The simplest way to use it is to serve it over local HTTP, for example with `npx serve .`. To open it directly as a `file://` URL, first turn on **Allow access to file URLs** in the extension's details.

The **Run Batch** button adds nothing to the panel: batched requests are not captured (see [Known limits](#known-limits)).

## Features

### Request capture

`POST` requests whose JSON body has a `query` field are captured, whether they go through `fetch` or `XMLHttpRequest`. Each request shows up in the list as soon as it is sent, with a pending indicator, and is completed when its response arrives.

### Request list

- Type badge: `Q` (query), `M` (mutation), `S` (subscription).
- Operation name (`Anonymous` if it has none) and endpoint URL.
- HTTP status, green for 2xx and red from 400 up. `●●●` means the response is pending, `—` that no response was captured after 30 seconds.
- **Filter requests…** filters on operation name or URL.
- **Clear** empties the list.
- **Preserve log** keeps the list across navigations and reloads. Without it, the list is cleared on every navigation.
- The list scrolls to the latest request automatically and keeps the 500 most recent ones.
- Drag the divider to resize the column.

### Request details

Clicking a request opens four tabs:

| Tab | Content |
| --- | --- |
| **Headers** | Request and response headers |
| **Request** | The query, reformatted, with syntax highlighting, line numbers and foldable blocks. Variables shown as a collapsible JSON tree. |
| **Response** | The response as a collapsible JSON tree, with search |
| **Raw** | The response body as received |

The query, the variables, the response and the raw body each have a **Copy** button.

Search in the **Response** tab highlights matches and shows how many there are. `Enter` goes to the next match, `Shift + Enter` to the previous one, and `Esc` clears the search.

### Open in a sandbox

A captured request can be reopened in a GraphQL sandbox (Apollo Sandbox by default) with its query and variables pre-filled. There are three entry points:

- the `↗` button on each row of the list;
- the **Open in Sandbox ↗** button in the **Request** tab;
- the `↗` button that appears when you hover a field in the query. It opens a sub-query reduced to that field, its sub-fields and its parents. The sub-query brings the fragments it uses, declares only the variables it uses, and only the values of those variables are sent. This helps isolate the failing field of a large query.

### Compare mode

The `⊕` button on a row adds that request to the comparison. The first one selected becomes **A** (red), the second **B** (green), and the detail panel is replaced by a line-by-line diff.

- Three tabs: **Query**, **Variables** and **Response**, each with a count of differing lines.
- `−` lines exist only in A, `+` lines only in B.
- Selecting a third request replaces the older of the two.
- Clicking `A` or `B` again removes that request; **✕ Close** exits the comparison.

### Settings

The `⚙` button opens the sandbox settings, which are stored in `chrome.storage.local`:

- **Sandbox URL**: the address of the sandbox, in `http://` or `https://`. Default: `https://studio.apollographql.com/sandbox/explorer`.
- **URL Format**: how the query is passed in the URL.

| Format | Generated parameters | Use case |
| --- | --- | --- |
| Auto-detect | Apollo if the URL contains `apollographql` or `apollo.dev`, GraphiQL otherwise | Default |
| Apollo Studio | `?document=…&endpoint=…&variables=…` | Hosted Apollo Sandbox; the endpoint passed is the one of the captured request |
| Apollo Playground | `?document=…&variables=…` | Sandbox served by your own GraphQL endpoint |
| GraphiQL | `?query=…&variables=…` | GraphiQL instance |

### Privacy

- Interception is off by default. It is only active in the tab whose **GraphQL** panel is open and turns off when the panel closes; nothing is captured on other sites.
- Values of sensitive headers (`Authorization`, `Cookie`, `X-API-Key`, CSRF tokens…) are redacted when captured in the page; only the header name is kept. When the DevTools network API provides the real headers, those are shown instead; they do not leave DevTools.
- Captured requests stay in the panel's memory and are not sent anywhere. The one exception happens at your request: **Open in Sandbox** passes the query and variables to the configured sandbox, in the URL. The per-field `↗` button only passes the variables its sub-query uses.

## Known limits

- Not captured: `GET` requests, batched requests (a JSON body that is an array), persisted queries sent without a `query` field, and subscriptions over WebSocket.
- Response bodies are truncated at 2 MB, and queries over 500 KB are ignored.
- Beyond 300 lines, the compare-mode diff no longer aligns lines: it shows all of A, then all of B.

## Project structure

The extension is built with [WXT](https://wxt.dev), React 19, TypeScript and Tailwind CSS 4.

```
page (MAIN world)          src/entrypoints/interceptor.content.ts   wraps fetch and XHR
   │ window.postMessage
content script (isolated)  src/entrypoints/content.ts               page ↔ extension bridge
   │ chrome.runtime
service worker             src/entrypoints/background.ts            webRequest + per-tab relay
   │ "devtools-panel" port
DevTools panel             src/entrypoints/panel/                   React UI
```

| Folder | Role |
| --- | --- |
| `src/entrypoints/` | Extension entry points: service worker, content scripts, DevTools page, panel |
| `src/components/` | React components of the panel |
| `src/hooks/` | `useRequests` (collection and request/response correlation), `useSettings` |
| `src/utils/` | GraphQL parsing, syntax highlighting, diff, sandbox URL building |

### Requested permissions

| Permission | Usage |
| --- | --- |
| `webRequest` | Detect GraphQL requests as soon as they are sent |
| `tabs` | Turn capture on in the inspected tab and open the sandbox in a new tab |
| `storage` | Save the sandbox settings |
| `<all_urls>` | Work on any inspected site |
