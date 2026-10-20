#!/bin/sh
# Run from a normal local terminal; creates only a local repository, no remote.
set -eu
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
if [ ! -e .git ]; then
  git init -b main
fi
actual_root=$(git rev-parse --show-toplevel)
if [ "$actual_root" != "$project_root" ]; then
  echo 'Unexpected Git root; no files staged.' >&2
  exit 1
fi
git add --all -- .
if ! git diff --cached --quiet; then
  git commit -m "Complete 0.1 design review fixes and track project deliverables"
fi
git status --short
git log -1 --oneline
