#!/usr/bin/env bash
# Commits server/covers_catalog.json to main when the sync changed it, then
# starts the Fly deploy: pushes made with GITHUB_TOKEN don't trigger
# deploy-fly.yml on their own.
# Usage: publish-cover-catalog.sh <summary.md>
set -euo pipefail

summary="$1"
catalog="server/covers_catalog.json"

if git diff --quiet -- "$catalog"; then
  echo "No cover changes to publish."
  exit 0
fi

git config user.name 'github-actions[bot]'
git config user.email '41898283+github-actions[bot]@users.noreply.github.com'
base=$(git rev-parse HEAD)
git add -- "$catalog"
{
  printf 'chore(covers): sync from Drive (%s)\n' "$(head -n 1 "$summary")"
  tail -n +2 "$summary"
} | git commit --quiet --file=-

deploy() {
  gh workflow run deploy-fly.yml --ref main
  echo "Started the Fly deploy."
  exit 0
}

for attempt in 1 2 3; do
  if git push origin HEAD:main; then
    deploy
  fi
  git fetch --quiet origin main
  if git diff --quiet HEAD FETCH_HEAD -- "$catalog"; then
    # An earlier attempt already pushed this exact catalog, e.g. a re-run
    # after its deploy didn't start.
    echo "main already has this catalog."
    deploy
  fi
  if ! git diff --quiet "$base" FETCH_HEAD -- "$catalog"; then
    # Merging two catalog edits could pass git yet produce an untested catalog
    # (two edits can add the same key), so never push a merge.
    echo "::error::main changed $catalog during this run, so nothing was pushed. Run Sync covers again; it starts from the latest catalog."
    exit 1
  fi
  echo "main moved on; rebasing (attempt $attempt)."
  git rebase --quiet FETCH_HEAD
done
echo "::error::Could not push the cover catalog to main."
exit 1
