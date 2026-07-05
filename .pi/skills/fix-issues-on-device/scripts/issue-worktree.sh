#!/usr/bin/env bash
#
# issue-worktree.sh — manage per-issue git worktrees for the
# fix-issues-on-device skill. Keeps each issue isolated on its own branch and
# working tree so concurrent issues never conflict.
#
# Usage:
#   issue-worktree.sh start  <N> <slug>   create _worktrees/issue-<N> on fix/issue-<N>-<slug> from HEAD
#   issue-worktree.sh path   <N>          print absolute worktree path (exists or not)
#   issue-worktree.sh ready  <N>          npm install in the worktree (skips if node_modules exists)
#   issue-worktree.sh done   <N> [msg]    commit worktree, merge into current branch, remove worktree + branch
#   issue-worktree.sh abort  <N>          discard: remove worktree + delete branch
#
# Run from anywhere inside the repo. Worktrees live in _worktrees/ (gitignored).
# The main working tree must stay on the integration branch (master/main) and be
# clean of tracked changes before `done` (commit ISSUES.md status updates first).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
	echo "error: not inside a git repository" >&2
	exit 1
fi
WT_DIR="$ROOT/_worktrees"

sanitize_slug() {
	# lowercase, replace non-alnum with hyphens, trim leading/trailing/dup hyphens
	echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g' | sed 's/^-\+//;s/-\+$//' | sed 's/--\+/-/g'
}

issue_vars() {
	local n="$1"
	WT="$WT_DIR/issue-$n"
}

branch_for() {
	local n="$1" slug="$2"
	echo "fix/issue-$n-$(sanitize_slug "$slug")"
}

cmd_start() {
	local n="${1:?usage: start <N> <slug>}" slug="${2:?usage: start <N> <slug>}"
	issue_vars "$n"
	local branch; branch="$(branch_for "$n" "$slug")"
	if [ -d "$WT" ]; then
		echo "$WT already exists (branch $branch) — resuming"
		echo "$WT"
		return 0
	fi
	mkdir -p "$WT_DIR"
	git worktree add "$WT" -b "$branch" HEAD
	echo "$WT"
}

cmd_path() {
	local n="${1:?usage: path <N>}"
	issue_vars "$n"
	echo "$WT"
}

cmd_ready() {
	local n="${1:?usage: ready <N>}"
	issue_vars "$n"
	[ -d "$WT" ] || { echo "error: $WT does not exist; run 'start $n' first" >&2; exit 1; }
	if [ -d "$WT/node_modules" ]; then
		echo "node_modules already present in $WT — skipping install"
		return 0
	fi
	echo "Installing dependencies in $WT (this can take a minute)..."
	( cd "$WT" && npm install --prefer-offline --no-audit --no-fund )
}

cmd_done() {
	local n="${1:?usage: done <N> [msg]}" msg="${2:-fix: issue $n}"
	issue_vars "$n"
	[ -d "$WT" ] || { echo "error: $WT does not exist" >&2; exit 1; }
	local branch; branch="$(git -C "$WT" rev-parse --abbrev-ref HEAD)"

	# Require the main tree to be clean of tracked changes so the merge is safe.
	if ! ( cd "$ROOT" && git diff --quiet && git diff --cached --quiet ); then
		echo "error: main working tree has uncommitted tracked changes." >&2
		echo "       Commit your ISSUES.md status update on the integration branch first, then re-run." >&2
		exit 1
	fi

	# Commit any changes in the worktree.
	if ! ( cd "$WT" && git diff --quiet && git diff --cached --quiet ); then
		( cd "$WT" && git add -A && git commit -m "$msg" )
	else
		echo "warning: no changes in worktree to commit" >&2
	fi

	# Merge the fix branch into the integration branch (main tree).
	local target; target="$( cd "$ROOT" && git rev-parse --abbrev-ref HEAD )"
	( cd "$ROOT" && git merge --no-ff "$branch" -m "merge: issue $n ($branch)" )

	# Clean up the worktree and the merged branch.
	git worktree remove --force "$WT"
	git branch -d "$branch"
	echo "merged $branch into $target and removed $WT"
}

cmd_abort() {
	local n="${1:?usage: abort <N>}"
	issue_vars "$n"
	local branch=""
	if [ -d "$WT" ]; then
		branch="$(git -C "$WT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
		git worktree remove --force "$WT"
	fi
	if [ -n "$branch" ] && git show-ref --verify --quiet "refs/heads/$branch"; then
		git branch -D "$branch"
	fi
	echo "discarded issue $n"
}

case "${1:-}" in
	start) shift; cmd_start "$@" ;;
	path)  shift; cmd_path  "$@" ;;
	ready) shift; cmd_ready "$@" ;;
	done)  shift; cmd_done  "$@" ;;
	abort) shift; cmd_abort "$@" ;;
	*) echo "usage: issue-worktree.sh {start|path|ready|done|abort} <N> [slug|msg]" >&2; exit 2 ;;
esac
