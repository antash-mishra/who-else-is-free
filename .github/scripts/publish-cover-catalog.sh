#!/usr/bin/env bash
# Commits server/covers_catalog.json to master when the sync changed it, then
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
git add -- "$catalog"
{
  printf 'chore(covers): sync from Drive (%s)\n' "$(head -n 1 "$summary")"
  tail -n +2 "$summary"
} | git commit --quiet --file=-

for attempt in 1 2 3; do
  if git push origin HEAD:master; then
    gh workflow run deploy-fly.yml --ref master
    echo "Pushed the cover catalog and started the Fly deploy."
    exit 0
  fi
  # master moved on during the run. A conflicting change to the catalog stops
  # here (set -e) and the next run starts fresh.
  echo "master moved on; rebasing (attempt $attempt)."
  git pull --rebase origin master
done
echo "::error::Could not push the cover catalog to master."
exit 1
