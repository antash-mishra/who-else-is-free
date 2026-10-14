# Safety Report Retention

## Purpose

Who Else Is Free gets strangers to meet in person, so safety reports are our main safety record.
Before issue #184 a reported person could erase that record by deleting their account or the plan,
because either one deleted the report. Reports now outlive the accounts and the plan they refer to,
for a fixed 12 months, so a report keeps its evidence and a repeat offender can be recognised.

Code: `server/repository_report_retention.go`, `server/identity_hash.go`,
`server/report_retention_job.go`, the schema and migration in `server/repository_schema.go`, and the
tests in `server/event_report_retention_test.go`.

## What is kept

The **subject** of a report is the reported member for a member report, or the plan's host for a
plan report. `insertReportWithSnapshot` writes the report and its copies in one transaction, so a
report never exists without its snapshot:

- `event_reports`: the reason, status, `created_at` and `reviewed_at`, a copy of the plan title
  (`event_title`), the subject (`subject_user_id`, `subject_name`) and `retention_hold`. The links
  to the plan (`event_id`), the reporter (`user_id`) and the reviewing admin (`reviewed_by`) become
  NULL when that plan or account is deleted. A member report's `reported_user_id` holds the reported
  member's id and, like `subject_user_id`, keeps it after that account is deleted, until the report
  is purged.
- `event_report_messages`: up to 50 of the subject's most recent `user` messages in the plan
  (system messages are skipped), copied when the report is filed, with their timestamps, attachment
  URLs and original message and conversation ids. Only conversations the reporter belonged to are
  read, so a one-to-one plan's other private chats never enter the record. The copies have no
  foreign key to the chat, so they stay when the messages, the chat or the accounts are deleted.
- `event_report_identities`: the subject's identity hashes; see
  [Identity hashes](#identity-hashes).

No other profile data is kept.

Reports filed before this change got a one-time copy during the migration, taken from whatever
still existed at that moment: the plan title, the subject's id and name, and the subject's messages
in conversations the reporter was still a member of. References to plans, reporters or reviewers
that were already gone were set to NULL instead of failing the migration. `reported_user_id` kept
its id even when that account was already gone, and `subject_user_id` was taken from it (for a plan
report, from the plan's host while the plan still existed). Anything already deleted could not be
recovered. Identity hashes are not part of that copy: they attach later, when the subject's
hashes are recorded, so a legacy report about an account that was already deleted has none.

## Retention

Reports are kept for **12 months** from `event_reports.created_at` (UTC). The period is the
constant `eventReportRetentionMonths` and is not configurable. Reports that exist when this change
is deployed are covered too, counted from their original date, so the first purge after the deploy
removes any existing report that is already older than 12 months.

`startReportRetentionJob` runs `PurgeExpiredEventReports` at startup and then every 24 hours. It
deletes each report older than 12 months whose `retention_hold` is 0, and the report's
`event_report_messages` and `event_report_identities` rows are deleted with it
(`ON DELETE CASCADE`). The job logs counts only.

Throughout this document, "deleted" and "purged" mean removed from the live database, not scrubbed
from storage. SQLite does not overwrite freed pages (`secure_delete` is off), so removed rows can
remain in free pages of the database file and in volume snapshots and backups until those are
overwritten or expire.

**Holds.** A report under active review (an investigation or a legal request) is exempt from the
purge while `retention_hold = 1`:

```sql
UPDATE event_reports SET retention_hold = 1 WHERE id = ?;
```

Replace `?` with the report id. Release the hold with `retention_hold = 0` when the review ends; the
next purge removes a released report that is already older than 12 months. The column exists only
once this change is deployed, so holds can be set at any time after that and must be set before a
report reaches 12 months. The oldest possible report reaches 12 months on 2026-12-28 (see step 5
of [Deploying](#deploying)).

A hold protects a report only from the purge. The host's unblock action still withdraws the host's
own member report, held or not (see [What deletion does](#what-deletion-does)).

There is no hold tool yet, and production has no shell to run this SQL in, so setting or releasing
a hold currently needs stop-the-machine work (see
[Running SQL against production](#running-sql-against-production)). A hold tool is a follow-up due
before 2026-12-28; see [Follow-ups](#follow-ups).

## Running SQL against production

The production image's final stage is `gcr.io/distroless/base-debian12` (`server/Dockerfile`): it
has no shell and no `sqlite3`, so none of the SQL in this document can run on the server itself. The
database is `/data/event.sqlite` on the Fly volume `data` (`server/fly.toml`).

- **Back up** with a Fly volume snapshot: find the volume id with
  `fly volumes list -a who-else-is-free-server`, then run `fly volumes snapshots create <volume-id>`.
- **Read-only queries** (the deploy checks below and the
  [lookup](#recognising-a-returning-account)) run on a pulled copy:
  `fly ssh sftp get /data/event.sqlite <local-path> -a who-else-is-free-server`. A copy taken while
  the server is writing can be torn, so run `PRAGMA quick_check;` on it first and pull again unless
  it prints `ok`.
- **Writes** (setting or releasing a hold, dropping a view or trigger) need stop-the-machine work.
  Never write an edited copy back while the server runs: the running server keeps its own handle on
  the file, so writes can be lost or the database corrupted. Take a volume snapshot, stop the app's
  machine, make the change from a temporary machine that has `sqlite3` and the `data` volume
  mounted, then start the app's machine again.

These commands are the suggested method and were not run while writing this document: confirm each
one against the team's Fly setup before relying on it, and rehearse the write procedure before the
first real hold. A pulled copy holds every account's email and every report, so it falls under the
[operational rules](#operational-rules).

## Deploying

The first start of this version rebuilds `event_reports` once, inside `Init`. Work through these
steps around the deploy. Steps 2, 3 and 5 only read, so they run on a pulled copy (see
[Running SQL against production](#running-sql-against-production)).

1. **Back up** the production database (`/data/event.sqlite` on the Fly volume `data`) with a volume
   snapshot, then pull a copy for the checks.
2. **Look for views and triggers.** Run this on the pulled copy:

   ```sql
   SELECT type, name FROM sqlite_master WHERE type IN ('view', 'trigger');
   ```

   The app creates none, so any row was added by hand. A view or trigger that references
   `event_reports` must be dropped on production before the deploy, which is stop-the-machine work.
   The one-time table rebuild cannot rename the table while one exists: it fails with
   `no such table: main.event_reports`, and `Init` then fails at every start. A failed rebuild rolls
   back and leaves the database as it was.

3. **Check the time budget.** `Init` must finish inside the 5-second context created in
   `server/main.go`, which also covers seeding and admin bootstrap. The migrating start reads the
   whole `messages` table once and copies up to 50 messages per report, so its cost grows with both
   tables, and every start, migrating or not, also scans `messages`. Count both on the pulled copy:

   ```sql
   SELECT count(*) FROM event_reports;
   SELECT count(*) FROM messages;
   ```

   Rehearsal timings on an Apple Silicon Mac, median of three runs, on synthetic databases built by
   the pre-#184 server (so its indexes already existed):

   | Messages  | Reports | Messages copied | Migrating start | Repeat start |
   | --------- | ------- | --------------- | --------------- | ------------ |
   | 200,000   | 1,000   | 3,600           | 0.14 s          | 0.07 s       |
   | 1,000,000 | 1       | 20              | 0.46 s          | 0.24 s       |
   | 1,000,000 | 1,000   | 18,000          | 0.55 s          | 0.24 s       |
   | 1,000,000 | 1,000   | 45,000          | 1.15 s          | 0.40 s       |
   | 2,500,000 | 10,000  | 450,000         | 3.8 s           | 0.57 s       |

   A copy of the local development database (24 users, 38 plans, 76 messages, 0 reports) took 16 to
   20 ms for the migrating start and 2 to 3 ms for a repeat start.

   Fly runs the app on one shared CPU (`server/fly.toml`), which is likely slower. Above roughly
   1,000 reports or 200,000 messages, rehearse on the pulled copy first: open it with `openDB` and
   call `NewEventRepository(db).Init(ctx)` from a throwaway test, never against the live file. If
   the migrating start takes more than about 1 s there, raise the 5-second `Init` timeout in
   `server/main.go` before deploying. Otherwise the deadline can expire during the rebuild:
   `Init` fails with `context deadline exceeded`, the server exits with
   `failed to run migrations: …`, and restarts keep failing while the rebuild takes longer than the
   budget. The data stays intact, because the rebuild is one transaction that rolls back.

4. **Set `REPORT_IDENTITY_HMAC_KEY` before or with the deploy.** Generate it with
   `openssl rand -hex 32` (the command to set it is under [Identity hashes](#identity-hashes)).
   Never use a short or guessable key: a copy of the database holds each live account's email next
   to its `email` hash, so a weak key can be brute-forced offline. Without the key everything works
   but no hashes are recorded.
5. **Run the age check.** `event_reports` was introduced on 2025-12-28, so the oldest possible
   report reaches 12 months on 2026-12-28 and the first purge cannot delete anything at this
   deploy. Confirm it on the pulled copy before deploying:

   ```sql
   SELECT count(*) FROM event_reports WHERE created_at < datetime('now', '-12 months');
   ```

   It must return 0. Anything else is unexpected data that the first purge would delete within
   seconds of the first start, before a hold could be set. Find out why before deploying.

6. **Never start a pre-#184 build against a migrated database without first restoring the
   backup.** That build's startup cleanup deletes the reports this change keeps: every report
   whose plan reference is NULL and, among plan reports on one plan whose reporter reference is
   NULL, all but the oldest. It can also fail to start on a report about a deleted account.
7. **After deploying**, check that the server started. With the key set, the first start logs
   `backfilled N identity hash(es)`: one email hash per account plus one Apple hash per linked
   Apple account. Later starts log it only if some account still lacks a hash. Confirm the rebuild
   ran on a copy pulled after that start:

   ```sql
   SELECT "from", on_delete FROM pragma_foreign_key_list('event_reports');
   ```

   It must list `event_id`, `user_id` and `reviewed_by` as `SET NULL` and nothing for
   `reported_user_id` or `subject_user_id`. Then delete every pulled copy and update the hosted
   privacy policy (below).

## What deletion does

| When                                                                    | What happens to the report                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| The reporter deletes their account                                      | Kept; `user_id` becomes NULL.                                             |
| The reported member deletes their account (the host, for a plan report) | Kept; `reported_user_id` and `subject_user_id` keep the old id.           |
| A reviewing admin deletes their account                                 | Kept; `reviewed_by` becomes NULL.                                         |
| The plan is deleted, by the host or with the host's account             | Kept; `event_id` becomes NULL and `event_title` stays.                    |
| Either account is deleted                                               | `user_blocks` rows involving it are still deleted.                        |
| The host unblocks a member                                              | The host's own member report is still withdrawn (deliberately unchanged). |

- The old id is never reused (`users.id` is `AUTOINCREMENT`) and neither column has a foreign key,
  which keeps reports about one person together. The subject's name, message copies and identity
  hashes stay with the report, although their own chat messages are still deleted.
- Unblocking withdraws only the host's own report, with its copies. That is the reporter's choice,
  not the reported person's. It withdraws a held report too: a hold protects a report only from the
  purge. The match is on `event_id` and `user_id`, so it no longer applies once the plan or the
  host's account is gone.
- Startup cleanups never delete a report because a reference is NULL. The orphan cleanup only
  nulls a dangling `event_id`, the duplicate cleanup skips reports with a NULL `event_id` or
  `user_id`, and the block backfill (`backfillUserBlocksFromMemberReports`) only uses reports on
  live plans with live accounts. A report kept after its plan was deleted therefore never
  re-creates a block the host removed, and a report about a deleted account cannot break startup.

## Identity hashes

A hash lets an admin recognise a returning account without keeping the real identifier. Each hash
is an HMAC-SHA256 of `<provider>:<value>`, keyed with `REPORT_IDENTITY_HMAC_KEY` and stored as
lowercase hex, so a stored value cannot be checked against a known identifier without the key. The
providers are `apple` (Apple subject), `google` (Google subject) and `email` (the account email,
trimmed and lowercased). A raw Google subject is never stored.

The `email` hash exists because accounts are keyed by email and the Google subject was never
stored: without it an existing Google account would have no hash until its next sign-in, and one
deleted right after being reported might never get one.

How hashes reach a report:

- `user_identity_hashes` holds the hashes of live accounts and is deleted with the account.
- Each Google or Apple sign-in records the sign-in provider's hash and the `email` hash
  (`recordIdentityHashes` in `server/auth_handler.go`). A failure is logged without values and
  never fails the sign-in.
- At startup `BackfillIdentityHashes` adds the missing `email` hashes for every account and the
  `apple` hashes from `apple_accounts`; it is safe on every start. Google hashes arrive with the
  account's next Google sign-in (sessions last 24 hours, so active accounts are covered within a
  day).
- Filing a report copies the subject's hashes into `event_report_identities`. A hash recorded later
  is also attached to earlier reports about the same live account (`RecordUserIdentityHash`),
  which is how reports filed before the key existed pick theirs up. Hashes never change a report's
  other data.

Generate the key with `openssl rand -hex 32` and set it with:

```bash
fly secrets set REPORT_IDENTITY_HMAC_KEY=<value> -a who-else-is-free-server
```

`fly secrets list` does not reveal the value, so keep a copy in the team's approved secret store:
without the key, retained hashes can no longer be matched. Never rotate it casually: hashes made
with the old key no longer match, and hashes already stored on reports are never recomputed.
Without the key the server logs `REPORT_IDENTITY_HMAC_KEY not set` at start, reports carry no
hashes and everything else works. Never log subjects, emails or hashes.

## Recognising a returning account

This is a manual admin lookup; nothing flags or bans accounts automatically. For a live account
(`?` is its user id), list the retained reports about someone else whose identity hashes it shares:

```sql
SELECT r.id, r.created_at, r.status, r.reason
FROM user_identity_hashes h
JOIN event_report_identities i
  ON i.provider = h.provider AND i.identity_hmac = h.identity_hmac
JOIN event_reports r ON r.id = i.report_id
WHERE h.user_id = ?
  AND (r.subject_user_id IS NULL OR r.subject_user_id <> h.user_id);
```

A row means the account shares an Apple account, a Google account or an email address with the
subject of that report. Treat it as a lead for a person to review, not as proof.

## Privacy policy

The issue asks for the policy to change when this ships, not before. Merging to `master` deploys
the server (`.github/workflows/deploy-fly.yml`), so the in-app copy
(`src/content/privacyPolicyMarkdown.ts`) and the tracked Notion export at the repository root
(`Privacy Policy 3702ef2fbf48809782a1c5b89f71b3f3.md`) change in the same merge. Section 6 no longer
says "No purpose in this notice will require us keeping your personal information for longer than
the period of time in which users have an account with us." It now says:

> If another user reports you, we keep the report, the name you used, your recent messages in that
> plan's chat and a pseudonymised (one-way hashed) form of your sign-in identifiers, such as your
> email address, for up to 12 months, even after you delete your account. We do this to protect
> other users and to recognise a reported person who signs up again. We keep a report for longer
> only while it is still under review. Reports you make are kept for the same period, without a
> link to your account once you delete it.

- The in-app copy ships in the app bundle, so users see it after the next app or OTA release.
- Update the hosted copy (the Notion page the export comes from) with the same text and date on
  the day the server deploys.
- Change all three together if the retention period or what a report keeps changes.

## Operational rules

Reports hold the same kind of sensitive content as support submissions, so the handling rules in
`docs/support-data-retention.md` apply:

- Only administrators with database access read reports.
- Do not paste report content (reasons, names, plan titles, message copies, hashes) into logs,
  analytics, Slack or issue trackers.
- Do not export the production SQLite database as the normal review workflow.
- Until admin tools exist, the read-only SQL in this document runs on a pulled copy, so pull one
  only for a specific check or rehearsal. It holds every account's email and every report: keep it
  on an administrator's own encrypted machine, never commit, upload or share it, and delete it, with
  any copy made from it, as soon as the work is done.
- The server logs counts only (the purge job and the identity backfill), never report content.

## Follow-ups

- An admin UI flag for new accounts that match a report (the issue marks it optional; use the
  lookup above until then).
- **A hold tool, due before 2026-12-28**, when the oldest possible report reaches 12 months. Holds
  are SQL-only for now, the same way reports are reviewed today (nothing in the app sets
  `reviewed_by`), and production has no shell, so each hold needs stop-the-machine work. Options:
  an admin endpoint, or a server subcommand run with `fly ssh console -C` (confirm that this works
  without a shell in the distroless image). The tool should also stop the host's unblock action
  from withdrawing a held report, and the startup block backfill
  (`backfillUserBlocksFromMemberReports`) should then skip held reports so the unblock still takes
  effect after a restart.
- Redact the existing sign-in error logs in `server/auth_handler.go`, which print emails, Apple
  subjects and the Google claims map. They predate this change and break the "never log" rule
  above, so they belong in a separate change.
