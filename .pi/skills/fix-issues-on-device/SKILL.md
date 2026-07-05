---
name: fix-issues-on-device
description: Fix a list of issues in this React Native Expo app, each on its own isolated git worktree, and verify each fix on a running Android emulator using the mobile-mcp tools (mobile_init, mobile_open_app, mobile_dump_ui, mobile_tap, mobile_screenshot). Implement a fix in a worktree, build/install, navigate to the relevant screen, screenshot it, inspect the screenshot, and retry until visually confirmed fixed. Use when the user asks to fix several issues and verify them on the emulator, or says "fix and verify on device".
---

# Fix Issues on Isolated Worktrees and Verify on Android Emulator

You fix a batch of issues. **Each issue gets its own git worktree + branch** so changes never leak between issues and merges stay conflict-free. For every fix you prove it works by driving the running Android emulator with the `mobile_*` tools (from the `.pi/extensions/mobile-mcp` bridge) and inspecting screenshots with your vision.

## Why worktrees

One worktree per issue = one branch per issue = its own working tree, `node_modules`, and gradle build. Issue A's half-finished code never appears in Issue B's build. Because we merge each fix back before starting the next, branches never diverge and never conflict.

## Inputs

- An issues list. Prefer `ISSUES.md` in the project root. Each issue is a `##` section:

  ```markdown
  ## Issue 1: <short title>
  <what's wrong, which screen, how to reproduce, what "fixed" looks like>
  ```

  If the user gave issues inline, write them to `ISSUES.md` first so progress is durable.

## Preconditions (do once at the start)

1. Confirm `adb` is available and a device/emulator is connected: `bash` `adb devices`. If none, stop and ask the user to start one (`npm run android` or Android Studio AVD).
2. Read `AGENTS.md` / `CLAUDE.md` for project conventions (shared components, theme tokens, API helpers, test commands). Follow them.
3. Identify the app package name for `mobile_open_app`: `bash` `adb shell pm list packages | grep -i <app>` or read `app.json` / `android/app/build.gradle` for `applicationId`. Remember it.
4. Confirm the integration branch (e.g. `master` or `main`) is the current branch in the main tree: `bash` `git rev-parse --abbrev-ref HEAD`. Worktrees branch off it and merge back into it.

## Helper script

All git/worktree plumbing goes through `.pi/skills/fix-issues-on-device/scripts/issue-worktree.sh` (run it from the repo root):

| Command | Effect |
|---------|--------|
| `start <N> <slug>` | create `_worktrees/issue-<N>` on branch `fix/issue-<N>-<slug>` from HEAD; prints the worktree path |
| `path <N>` | print the worktree path |
| `ready <N>` | `npm install` in the worktree (skips if `node_modules` already exists) |
| `done <N> [msg]` | commit worktree changes, merge the branch into the integration branch, remove the worktree + branch |
| `abort <N>` | discard the issue: remove worktree + delete branch |

Do not run raw `git worktree` commands yourself; use the script so cleanup is consistent.

## Per-issue loop (one issue at a time, sequential)

Do issues **sequentially**: finish one (merge it back) before starting the next, so branches stay conflict-free. The emulator is a single shared device — never work two issues in parallel.

Repeat up to **5 attempts** per issue.

### 1. Open the worktree
```bash
bash: .pi/skills/fix-issues-on-device/scripts/issue-worktree.sh start <N> <short-slug>
```
Then get the path and install deps (first time only for that worktree):
```bash
bash: .pi/skills/fix-issues-on-device/scripts/issue-worktree.sh ready <N>
```
All code edits for this issue happen **inside the worktree** (use absolute paths to `_worktrees/issue-<N>/...` for `read`/`edit`/`write`, and `cd _worktrees/issue-<N>` for build/test bash commands).

### 2. Implement the fix
- Use `read`, `grep`, `find`, `ls` (with worktree paths) to locate the code.
- Make the smallest correct change. Prefer existing shared primitives, hooks, theme tokens, and API helpers per `AGENTS.md`.
- No hardcoded colors, no duplicate components, no direct `expo-haptics` imports.

### 3. Static checks (in the worktree)
```bash
bash: cd _worktrees/issue-<N> && npm run typecheck && npx jest <relevant-path> --runInBand --silent
```
If either fails, fix and repeat from step 2. Do not proceed to the device until static checks pass.

### 4. Build and install on the emulator (from the worktree)
```bash
bash: cd _worktrees/issue-<N> && npm run android
```
This builds, installs, and launches the app on the connected emulator. Watch for `BUILD SUCCESSFUL` / `Installed on`. (First build in a fresh worktree is slower; subsequent attempts reuse gradle/metro caches.)

### 5. Initialize mobile control and navigate (from the main repo)
Emulator verification uses the `mobile_*` tools, which are provided by the extension in the **main** repo (the worktree does not need mobile-mcp installed).
- Call `mobile_init` once per session.
- Call `mobile_open_app` with the package name to relaunch the freshly installed build.
- Navigate to the issue's screen: `mobile_dump_ui` to read the UI hierarchy + coordinates, then `mobile_tap` / `mobile_swipe` / `mobile_type` / `mobile_key_press`. Re-dump after each action to confirm where you are.

### 6. Capture evidence and verdict
- Call `mobile_screenshot` and **look at the returned image carefully**. Also `mobile_dump_ui` when text/state matters.
- **Fixed:** Commit the fix and merge it back, then record status:
  1. Commit your `ISSUES.md` status update on the integration branch in the **main** tree (the `done` step requires a clean main tree):
     ```bash
     bash: git add ISSUES.md && git commit -m "chore: mark issue <N> fixed in ISSUES.md"
     ```
     (Append `[FIXED on attempt <K>] <one-line evidence>` under that issue first.)
  2. Merge the worktree:
     ```bash
     bash: .pi/skills/fix-issues-on-device/scripts/issue-worktree.sh done <N> "fix: <issue title>"
     ```
  3. Move to the next issue (its worktree will branch off the now-updated integration branch).
- **Not fixed:** Describe precisely what's still wrong, feed the screenshot observations back into your reasoning, and loop to step 2 with a **concrete different change**. Do not repeat an identical fix.
- **After 5 failed attempts:** Discard or leave the worktree and move on:
  ```bash
  bash: .pi/skills/fix-issues-on-device/scripts/issue-worktree.sh abort <N>
  ```
  Mark the issue `[UNRESOLVED after 5 attempts] <what's left>` in `ISSUES.md`, commit that status update on the integration branch, and continue with the next issue.

## Rules

- One worktree + one issue at a time. Always merge (`done`) or discard (`abort`) before starting the next issue's worktree.
- Keep the main working tree on the integration branch and clean of tracked changes whenever you call `done` (commit `ISSUES.md` updates first).
- Worktree code edits use absolute paths under `_worktrees/issue-<N>/`; builds/tests run with `cd _worktrees/issue-<N>`.
- Emulator verification (`mobile_*`) happens from the main repo; the worktree only needs the app's `node_modules`.
- Always `mobile_dump_ui` before tapping — don't guess coordinates.
- Take a fresh `mobile_screenshot` after every state change you want to verify. Trust the screenshot over the code.
- `ISSUES.md` is the live status board. Update and commit it after every attempt outcome.

## When to stop

When every issue is marked `[FIXED ...]` or `[UNRESOLVED after 5 attempts]` in `ISSUES.md`, print a final summary table (Issue | Status | Attempts | Evidence) and stop.
