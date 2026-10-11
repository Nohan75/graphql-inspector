#!/bin/sh
# Keeps node_modules in step with package-lock.json at the start of a session.
#
# The lockfile changes when a pull request adds or bumps a dependency, and
# node_modules does not follow by itself: commands then fail in ways that do
# not name the cause. This runs `npm ci` when the lockfile is not the one
# node_modules was last installed from, and says so; otherwise it is silent.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f package-lock.json ] || exit 0

# The lockfile node_modules was installed from, as git hashes it
stamp=node_modules/.package-lock.hash
current=$(git hash-object package-lock.json)

[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$current" ] && exit 0

# No stamp yet: an install made before this script existed. When nothing is
# missing, take it as it is and remember the lockfile.
if [ ! -f "$stamp" ] && npm ls --depth=0 >/dev/null 2>&1; then
  echo "$current" > "$stamp"
  exit 0
fi

if npm ci --no-audit --no-fund >/dev/null 2>&1; then
  echo "$current" > "$stamp"
  echo "node_modules was out of date with package-lock.json: npm ci has been run."
else
  echo "node_modules is out of date with package-lock.json and npm ci failed: run it by hand."
fi
