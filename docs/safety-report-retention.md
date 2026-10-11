# Safety Report Retention

## Purpose

Who Else Is Free gets strangers to meet in person, so safety reports are our main safety record.
Before issue #184 a reported person could erase that record by deleting their account or the plan,
because either one deleted the report. Reports now outlive the accounts and the plan they refer to,
for a fixed 18 months, so a report keeps its evidence and a repeat offender can be recognised.

Code: `server/repository_report_retention.go`, `server/identity_hash.go`,
`server/report_retention_job.go`, the schema and migration in `server/repository_schema.go`, and the
tests in `server/event_report_retention_test.go`.

## What is kept

The **subject** of a report is the reported member for a member report, or the plan's host for a
plan report. `insertReportWithSnapshot` writes the report and its copies in one transaction, so a
report never exists without its snapshot:

- `event_reports`: the reason, status, `created_at` and `reviewed_at`, a copy of the plan title
  (`event_title`), the subject (`subject_user_id`, `subject_name`) and `retention_hold`. The links
  to the plan (`event_id`), the reporter (`user_id`), the reviewing admin (`reviewed_by`) and, for a
  member report, the reported member (`reported_user_id`) are kept while those rows exist.
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
in conversations the reporter was still a member of. References to plans or accounts that were
already gone were set to NULL instead of failing the migration, and anything already deleted could
not be recovered. Identity hashes are not part of that copy: they attach later, when the subject's
hashes are recorded, so a legacy report about an account that was already deleted has none.

## Retention

Reports are kept for **18 months** from `event_reports.created_at` (UTC). The period is the
constant `eventReportRetentionMonths` and is not configurable. Reports that exist when this change
is deployed are covered too, counted from their original date, so the first purge after the deploy
removes any existing report that is already older than 18 months.

`startReportRetentionJob` runs `PurgeExpiredEventReports` at startup and then every 24 hours. It
deletes each report older than 18 months whose `retention_hold` is 0, and the report's
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
next purge removes a released report that is already older than 18 months. The column exists only
once this change is deployed, so holds can be set at any time after that and must be set before a
report reaches 18 months. There is no admin UI yet; see [Follow-ups](#follow-ups).

## Deploying

The first start of this version rebuilds `event_reports` once, inside `Init`. Work through these
steps around the deploy:

1. **Back up** the production SQLite database (`/data/event.sqlite` on the Fly volume).
2. **Look for views and triggers.** Run this on production:

   ```sql
   SELECT type, name FROM sqlite_master WHERE type IN ('view', 'trigger');
   ```

   The app creates none, so any row was added by hand. Drop any view or trigger that references
   `event_reports` first. The one-time table rebuild cannot rename the table while one exists: it
   fails with `no such table: main.event_reports`, and `Init` then fails at every start. A failed
   rebuild rolls back and leaves the database as it was.

3. **Check the time budget.** `Init` must finish inside the 5-second context created in
   `server/main.go`, which also covers seeding and admin bootstrap. The rebuild copies every report
   and up to 50 messages per report, so its cost grows with the report count. Rehearsal timings:
   - A copy of the local development database (24 users, 38 plans, 76 messages, 0 reports): 16 to
     20 ms for the migrating start (four runs) and 2 to 3 ms for a repeat start.
   - Synthetic legacy databases on an Apple Silicon Mac: about 0.1 s for 1,000 reports (10,000
     messages copied), 1.2 s for 3,000 (150,000 copied) and 4.3 s for 10,000 (500,000 copied).

   Fly runs on a shared CPU, which is likely slower. Count production's reports with
   `SELECT count(*) FROM event_reports;`. Above roughly 1,000, rehearse on a copy of the backup
   first: open the copy with `openDB` and call `NewEventRepository(db).Init(ctx)` from a throwaway
   test, never against the live file.

4. **Set `REPORT_IDENTITY_HMAC_KEY` before or with the deploy.** Generate it with
   `openssl rand -hex 32` (the command to set it is under [Identity hashes](#identity-hashes)).
   Never use a short or guessable key: a copy of the database holds each live account's email next
   to its `email` hash, so a weak key can be brute-forced offline. Without the key everything works
   but no hashes are recorded.
5. **Run the age check.** `event_reports` was introduced on 2025-12-28, so the oldest possible
   report reaches 18 months on 2027-06-28 and the first purge cannot delete anything at this
   deploy. Confirm it before deploying:

   ```sql
   SELECT count(*) FROM event_reports WHERE created_at < datetime('now', '-18 months');
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
   ran:

   ```sql
   SELECT "from", on_delete FROM pragma_foreign_key_list('event_reports');
   ```

   It must list `event_id`, `user_id` and `reviewed_by` as `SET NULL` and nothing for
   `reported_user_id` or `subject_user_id`. Then update the privacy policy (below).

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
  not the reported person's. The match is on `event_id` and `user_id`, so it no longer applies once
  the plan or the host's account is gone.
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

The privacy policy is not changed on this branch: the issue asks for it to change when this ships,
not before. When the server change is deployed, update `src/content/privacyPolicyMarkdown.ts` at
the same time. The in-app copy ships in the app bundle, so this needs an app or OTA release. The
same text also appears in the tracked Notion export at the repository root
(`Privacy Policy 3702ef2fbf48809782a1c5b89f71b3f3.md`) and in any hosted copy; update those too.

- The retention paragraph currently says "No purpose in this notice will require us keeping your
  personal information for longer than the period of time in which users have an account with
  us." This change contradicts that sentence, so it must be removed or reworded.
- Add: "Reports made about you, including relevant chat messages, are kept for up to 18 months to
  protect other users, even after you delete your account."

## Operational rules

Reports hold the same kind of sensitive content as support submissions, so the handling rules in
`docs/support-data-retention.md` apply:

- Only administrators with database access read reports.
- Do not paste report content (reasons, names, plan titles, message copies, hashes) into logs,
  analytics, Slack or issue trackers.
- Do not export the production SQLite database as the normal review workflow.
- The server logs counts only (the purge job and the identity backfill), never report content.

## Follow-ups

- An admin UI flag for new accounts that match a report (the issue marks it optional; use the
  lookup above until then).
- An admin UI for `retention_hold`. Holds are set in SQL for now, the same way reports are
  reviewed today: nothing in the app sets `reviewed_by`.
- Redact the existing sign-in error logs in `server/auth_handler.go`, which print emails, Apple
  subjects and the Google claims map. They predate this change and break the "never log" rule
  above, so they belong in a separate change.
