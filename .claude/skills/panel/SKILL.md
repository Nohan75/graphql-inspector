---
name: panel
description: "Run this project's app: the DevTools panel, served in an ordinary page with a simulated chrome API. Use to see, screenshot or click through a change to src/components or src/styles."
---

The panel only runs inside DevTools, where nothing scripted can reach it. The **preview** serves the same `App` component and stylesheet in an ordinary page, fed by fixtures.

## Steps

1. **Start the preview.** Run `npm run panel` in the background. Done when `http://localhost:5183/` answers 200.
2. **Reach the state to check.** Add one `?click=` parameter per click, in order (syntax below). Done when the URL leads to the state the change affects.
3. **Capture it** with headless Chrome, as a screenshot, a DOM dump, or both:

   ```bash
   chrome --headless=new --window-size=1100,640 --virtual-time-budget=8000 --screenshot=<file.png> "<url>"
   chrome --headless=new --virtual-time-budget=8000 --dump-dom "<url>" > <file.html>
   ```

   Done when the capture shows the change, and `data-preview-ready="true"` is on `<html>`: every click has been replayed.
4. **Stop the preview.** Kill the process listening on port 5183. Stopping the `npm run panel` task leaves that process running, and the port is fixed, so the next start fails until it is gone.

## Clicks

`?click=<label>` clicks the first element whose own text, `title` or `aria-label` is `<label>`. `#n` picks the nth match, counting from 1.

- `?click=Response`: the Response tab.
- `?click=Broken`: the request named Broken in the list.
- `?click=Open%20this%20field%20in%20sandbox%233`: the per-field button of the third field.
- `?click=Add%20to%20compare%232&click=Add%20to%20compare%232`: rows 2 and 3 in compare mode. A row leaves the matches once selected, so the second `#2` is the next row.

## What a screenshot hides

- The per-field `↗` buttons only appear on hover. Count them in the DOM dump: `aria-label="Open this field in sandbox"`.
- A sandbox opens in a new tab. The preview prints the URL in a strip under the panel instead, `<pre id="opened-tab">`, decoded.

## Where to change it

- `preview/fixtures.ts`: the requests replayed into the panel. Add a fixture when a change needs a case that is not there.
- `preview/fakeChrome.ts`: the simulated `chrome` API. Extend it when the panel starts using a new part of `chrome`.
- `preview/preview.css`: the `@source "../src"` line is what makes Tailwind see the panel's classes. Without it the panel renders unstyled.

## Outside the preview

The capture itself: the in-page interceptor, the content script and the background worker. A change there is checked by a person, with the extension loaded in a browser as the README describes. Say so in the pull request.
