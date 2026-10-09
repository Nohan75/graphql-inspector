## Language

Everything committed is in English, whatever the language of the conversation: code, comments, interface labels, documentation, commit messages, pull requests and issues.

## Skills

The skills in `.claude/skills/` describe this repo: its commands, ports, file paths, interface labels and steps. A change to anything a skill describes updates that skill in the same pull request. Done when a search of `.claude/skills/` for every name the change touched finds nothing the change made false.

## Navigation

**Architecture**: the four extension contexts a captured request crosses, and what each folder holds, are in `README.md` under "Project structure". Read it before changing `src/entrypoints/` or `src/hooks/useRequests.ts`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `Nohan75/graphql-inspector`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels are used as is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
