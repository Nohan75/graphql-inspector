---
name: panel
description: "Run this project's app: the DevTools panel, served in an ordinary page with a simulated chrome API. Use to see, screenshot or click through a change to src/components or src/styles."
---

The panel only runs inside DevTools, where nothing scripted can reach it. The **preview** serves the same `App` component and stylesheet in an ordinary page, fed by fixtures.

## A visible choice comes first

An icon, a label or the place of a control is the maintainer's to choose. Before building one, draw two or three options on a single sheet: a static page at the size of the panel and in its colours, the `--color-*` of `src/styles/globals.css`. Take a picture of it with headless Chrome, send it and ask which one. Done when the maintainer has picked an option.

## Steps

1. **Write the steps that reach the state to check**: one `click=<label>` per click and one `type=<text>` per text to type, in order (syntax below). They are written as they read, without encoding.
2. **Read the panel as text.**

   ```bash
   npm run panel:dump -- click=Response "click=Collapse all"
   ```

   Done when the lines show the change. The command fails, and names the step, when a step matched nothing.
3. **Look at it**, when the change is about how something looks:

   ```bash
   npm run panel:shot -- <file.png> click=Response --size=1100x640
   ```

   Done when the picture has been read and shows the change.

Both commands start the preview for the run and stop it afterwards, and use the one already running when `npm run panel` is up. After `npm run panel`, kill the process listening on port 5183: stopping the npm task leaves it running, and the port is fixed.

## Reading the text

One line per line on screen, top to bottom. What a picture shows by a colour is spelled out:

- `[Label]` is a button, followed by its tooltip when that says more: `[⊕ "Add to compare"]`.
- `[Label]*` is a button that is on, or the tab that is open.
- `[x]` and `[ ]` are a checkbox; `[field: "text"]` is a field and what it holds, `[field: (placeholder)]` when it is empty.
- `> …` is the selected request, or the current search match. `«text»` is a search match.
- `Would open: …` is the URL of the tab a sandbox button would have opened.

It also has what a picture hides: the per-field `↗` buttons, which only appear on hover, and the state a picture can catch halfway through a transition, such as which tab is open.

## Clicks

`click=<label>` clicks the first element whose own text, `title`, `aria-label` or placeholder is `<label>`. `#n` picks the nth match, counting from 1. A click on a field gives it the focus.

- `click=Response`: the Response tab.
- `click=Broken`: the request named Broken in the list.
- `click=Mutations click=Errors`: the list narrowed to the mutations that went wrong. The type filters answer to their tooltip, `Queries`, `Mutations`, `Subscriptions`; `Errors` and `Pending` to their text.
- `"click=Open this field in sandbox#3"`: the per-field button of the third field.
- `"click=Add to compare#2" "click=Add to compare#2"`: rows 2 and 3 in compare mode. A row leaves the matches once selected, so the second `#2` is the next row.

## Typing

`type=<text>` replaces the text of the field that has the focus.

- `click=Settings type=https://sandbox.test/graphiql click=Save`: saves another sandbox URL. The settings modal gives the focus to its **Sandbox URL** field when it opens.
- `"click=Filter requests…" type=Character`: filters the list.

## Where to change it

- `preview/fixtures.ts`: the requests replayed into the panel. Add a fixture when a change needs a case that is not there.
- `preview/fakeChrome.ts`: the simulated `chrome` API. Extend it when the panel starts using a new part of `chrome`.
- `preview/outline.ts`: how the panel is read as text. It reads the page as laid out, not as built, so a change of structure or of class names leaves it working.
- `preview/preview.css`: the `@source "../src"` line is what makes Tailwind see the panel's classes. Without it the panel renders unstyled.

## Outside the preview

The capture itself: the in-page interceptor, the content script and the background worker. A change there is checked by a person, with the extension loaded in a browser as the README describes. Say so in the pull request.
