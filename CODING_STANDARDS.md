# Coding standards

Read at review. These are the judgement calls a reviewer makes on a diff. Anything a tool can decide lives in the tools instead: `npm run lint`, `npm run typecheck` and `npm test`, which CI runs on every pull request.

## Language

Everything committed is in English: code, comments, interface labels, documentation, commit messages, pull requests and issues. The language of the conversation that produced the change does not carry over.

## Where logic lives

- Components and hooks render and wire. Logic that can run without rendering lives in `src/utils`, behind a small interface, the way `queryDocument` holds everything about a query document.
- A rule has one home. A change that needs an existing rule, a message name or a limit reaches for the place that already holds it.

## Tests

- A test crosses a module's interface and sits next to the module as `*.test.ts`.
- Expected values are written out by hand. A fix starts from a test seen failing.

## Documentation follows behaviour

- A change to what the user sees or to what leaves the browser updates `README.md` in the same pull request: "Features", "Privacy" and "Known limits".
- A domain concept is named with its term from `GLOSSARY.md`. A new concept adds its term there.

## Pull requests

- The description says what was checked and what was not. A change to the interface is seen in the panel preview (the `panel` skill); a change to the capture says whether a person loaded the extension in a browser.
- A pull request that bumps the version says that merging it publishes a release.
