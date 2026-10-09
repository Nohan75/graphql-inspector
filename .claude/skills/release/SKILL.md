---
name: release
description: "Publish a new version of the extension."
disable-model-invocation: true
---

A release is a version bump that reaches `main`. The workflow in `.github/workflows/release.yml` does the publishing; `README.md`, section "Releases", says how it behaves.

## Steps

1. **Choose the bump**: `patch` for fixes, `minor` for a new capability, `major` for a breaking change. Ask the maintainer when they have not said. Done when the bump is named.
2. **Bump the version** on the branch that carries the change, or on a new branch from an up-to-date `main` when the change is already merged: `npm version <bump>`. Done when `package.json` and `package-lock.json` both read the new version and `git status` shows only those two files changed.
3. **Run the checks**: `npm run typecheck`, `npm run lint`, `npm test`, `npm run zip`. Done when all four pass and `.output/chrome-mv3/manifest.json` reads the new version.
4. **Commit and push**: `chore: bump version to <version>`, then open a pull request to `main`, or push to the one already open. State in its description that merging publishes `v<version>`.
5. **Hand over the merge.** `main` is protected: the maintainer merges. Done when the pull request is merged.
6. **Confirm the release.** Done when the workflow run on `main` succeeded and `gh release view v<version>` lists `gql-network-<version>-chrome.zip`.

## The tag belongs to the workflow

The workflow creates the tag `v<version>` on the merged commit. Leave tagging to it: a tag that already exists without a release makes the publish job fail. `.npmrc` already keeps `npm version` from creating one.

A push that leaves the version unchanged publishes nothing, so a merged pull request without a bump is never a release.
