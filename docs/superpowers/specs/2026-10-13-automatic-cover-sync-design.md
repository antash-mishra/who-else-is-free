# Automatic Cover Sync — Design

Date: 2026-10-13
Status: Approved; implementation requested directly after the design review

## Goal

Covers added to, replaced in or removed from the team Drive folder reach the app
without anyone running scripts, committing or merging.

Success: someone drops a PNG into the Drive covers folder, and it appears in Choose
Cover after an app restart, within about 12 hours or about 15 minutes after pressing
**Run workflow**, with no developer involved. An automatic sync never changes the
picture on an existing plan unless that picture was deliberately replaced.

## Decisions

- A scheduled GitHub Actions job runs twice a day (09:00 and 21:00 IST), plus a
  manual **Run workflow** button for urgent changes.
- The job commits `server/covers_catalog.json` straight to `master` (no PR) and starts
  the existing Fly deploy itself.
- A removed cover disappears from Choose Cover. Plans that used it show a similar cover
  (same folder, else same category) and hosts can still edit them.
- The Drive layout stays as it is: `<Category>/<Tag folder>/file.png`, or files placed
  directly in a category folder.

## Non-goals

- Client changes. Phones that already cached a replaced picture may keep showing the
  old one for a while; busting that cache needs an app update (possible follow-up).
- Drive webhooks, server-side polling, Drive API credentials.
- Keeping the original image of a removed cover.

## Problems with the current process

1. Every Drive change needs a developer: run `covers-sync`, commit, open a PR, merge.
2. Keys are positional (`<category>-<tag>-<N>`, with N from the file's position in the
   name-sorted folder), so adding or removing a file changes other plans' pictures.
3. At startup `ensureValidEventCoverKeys` resets every plan whose key is no longer in the
   catalog to `sports-badminton-1`.
4. Drive's "Replace existing file" keeps the file ID. The catalog does not change, so no
   deploy runs, and the cached Docker `-fetch` layer keeps serving the old image.
5. Local `covers-sync -fetch` skips files that already exist, so replaced images stay
   stale on developer machines.

## Design

### 1. Catalog format

Each cover entry gains three fields:

- `drive_name`: the file's name in Drive, used to recognise replacements.
- `sha256`: hex SHA-256 of the image bytes, used to detect replacements that keep the
  Drive ID and to refresh stale local files.
- `retired`: `true` once the file is gone from Drive (omitted otherwise).

Retired entries stay in `covers`, after the active ones and sorted by key, so their keys
are never reused and plans that use them keep working.

### 2. Stable keys (`covers-sync` discovery)

The sync reads the previous catalog and the Drive tree. A cover's *group* is its category
slug plus its first tag's slug, or just the category slug for files placed directly in a
category. Each listed Drive file, in listing order, gets a key as follows:

1. Its Drive ID matches a previous entry: keep that key. Renaming or moving a file keeps
   its key; the entry's label, category, tags and `drive_name` follow the file.
2. Otherwise, a previous entry in the same group with the same file name (ignoring case)
   whose Drive file is no longer listed: reuse that key. This covers delete-and-upload
   replacement and restoring a removed cover.
3. Otherwise, a new key `<group>-<n>`, where `n` is one more than the highest number any
   key of that form uses (active or retired).

Each rule is applied to every listed file before the next rule runs, and a previous entry
is matched at most once. Previous entries that match no listed file become retired,
keeping their last metadata.
Active covers keep today's display order: categories in taxonomy order, tag folders and
files sorted by name.

### 3. Checks (all or nothing)

The sync downloads every listed image on each run (needed for the fingerprints) and
checks, before writing anything:

- Every image is a PNG (signature and header decode) of at most 1 MB. Today's covers are
  600×600 and at most 334 KB; the limit stops an accidental full-size export.
- No more than 10 covers become retired in one run, unless `-allow-removals` is passed.
  A run that would remove more is usually a Drive glitch.
- Drive lists at least one cover.
- `sports-badminton-1` stays active, because the app shows it before the catalog loads.

Removal and default-cover checks run before downloading. Bad images are reported
together. Any failure exits non-zero without touching the catalog or the images. Messages
name the Drive path and the fix, and are printed as GitHub `::error::` annotations when
running in Actions.

### 4. Change summary

`-summary <file>` writes a Markdown summary: a first line of counts (for example
`1 added, 1 replaced, 1 removed`, or `No cover changes`), then lists of added, replaced,
restored, removed and updated (metadata only) covers with their keys and Drive paths. On
failure the file holds the error instead. The workflow shows it on the run page and uses
it as the commit message.

### 5. Fetch mode (deploy and local)

`covers-sync -fetch` downloads only active covers, keeps a local file only when its
SHA-256 matches the catalog (or it is a PNG and the catalog has no hash), and prunes files
that belong to no active cover. If a downloaded image's hash differs from the catalog
(Drive changed after the last sync), it logs a warning and keeps the download; the next
sync records the change. A hash mismatch never fails a deploy.

### 6. Server

- The catalog loader keeps active covers for `/api/covers`, and treats active and retired
  keys as known.
- `isValidCoverKey` accepts known keys, so creating or editing a plan with a retired key
  succeeds.
- `ensureValidEventCoverKeys` resets only unknown keys; plans with retired keys are left
  alone.
- Each retired key gets a stand-in at startup: the lowest-numbered active cover in the
  same group, else in the same category, else the default cover. New covers always get
  higher numbers, so adding covers never changes a stand-in.
- A `/assets/covers/:file` handler replaces `r.Static`. It serves the file when present,
  serves the stand-in's image for a retired key with no file, and returns 404 otherwise.
  File names must match `^[a-z0-9-]+\.png$`.
- Nothing requires the default cover to be first in the catalog any more; it must be
  active.

### 7. Workflow `.github/workflows/sync-covers.yml`

- Triggers: `schedule: '30 3,15 * * *'` (09:00 and 21:00 IST) and `workflow_dispatch`
  with a boolean `allow_removals` input ("Allow removing many covers").
- Runs only on `master`. Concurrency group `covers-sync` without cancelling, so a manual
  run waits for a running one.
- Permissions: `contents: write` (push the catalog) and `actions: write` (dispatch the
  deploy). Pushes made with `GITHUB_TOKEN` do not trigger `deploy-fly.yml`, so the job
  runs `gh workflow run deploy-fly.yml --ref master` itself.
- Steps: checkout, set up Go from `server/go.mod`, run the sync with `-summary`, show the
  summary (always), run `go test ./...` in `server`, then commit and deploy only if
  `covers_catalog.json` changed. Commits are authored by `github-actions[bot]`. A rejected
  push rebases onto `master` and retries up to three times; a conflicting rebase fails the
  run, and the next run starts fresh.
- Failure: the run fails and GitHub emails the account that last changed the schedule
  (scheduled runs) or whoever pressed the button (manual runs).

## Testing

- `covers-sync` unit tests: key kept by Drive ID across rename and move; replacement by
  file name; restore; new numbers skip retired numbers; retirement; the removal limit;
  the default-cover check; validation (not a PNG, too large); summary text; fetch skips
  retired covers and refreshes files whose hash differs.
- Server tests: loader with retired entries; `/api/covers` hides them; validation accepts
  them; stand-in choice (same group, same category, default); the asset handler (file
  present, retired stand-in, unknown 404, rejected names); `ensureValidEventCoverKeys`
  keeps retired keys and still resets unknown ones.
- Content-dependent tests are relaxed or moved to fixtures so a routine Drive change
  cannot fail the job: the default must be active rather than first, and tag exposure is
  tested with a fixture catalog.
- Real Drive: the new sync run against the committed catalog keeps every key and Drive ID
  (only `drive_name` and `sha256` are added), and a second run reports no changes. `-fetch`
  into an empty directory reproduces the deploy download.

## Rollout

1. The PR includes the one-time catalog update (adds `drive_name` and `sha256`; no key,
   Drive ID or picture changes).
2. After merge, press **Run workflow** once; it should report no changes unless Drive
   changed in the meantime.
3. Add a real cover to Drive, press **Run workflow**, and check `/api/covers` and Choose
   Cover after an app restart.
4. Update `AGENTS.md` and `CLAUDE.md` with the new rules.

## Known limits

- Phone image caches (see Non-goals).
- GitHub may start scheduled runs late or skip them under load, and turns off schedules
  in public repositories after 60 days without activity. The button still works.
- The Drive folder must stay publicly viewable; listing depends on Drive's embedded folder
  page.
