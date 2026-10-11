## Language

Everything committed is in English, whatever the language of the conversation: code, comments, interface labels, documentation, commit messages, pull requests and issues.

## Git

Commit on the feature branch as each step is done. Push and open the pull request when asked.

`main` is protected: the maintainer merges.

## Checks

`npm run check` runs every check: types, lint, tests and a build in a folder of its own. `.output/chrome-mv3` is the folder the maintainer loads in the browser: run `npm run build` only to hand over a build to try, and say which branch it is.

## Skills

The skills in `.claude/skills/` describe this repo: its commands, ports, file paths, interface labels and steps. A change to anything a skill describes updates that skill in the same pull request. Done when a search of `.claude/skills/` for every name the change touched finds nothing the change made false.

## Navigation

**Architecture**: the four extension contexts a captured request crosses, and what each folder holds, are in `README.md` under "Project structure". Read it before changing `src/entrypoints/`, `src/hooks/useRequests.ts` or `src/utils/requestLog.ts`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `Nohan75/graphql-inspector`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels are used as is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
