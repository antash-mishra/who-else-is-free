# Issue #127 follow-up — point 1 as the design meant it

Testers reported that section 1 of [issue #127](https://github.com/antash-mishra/who-else-is-free/issues/127) was not implemented by
commit `6dc762f`. They were right: that commit routed notification taps to a new full-page
`JoinRequestScreen`, which is the same full-page request list the issue asked to remove, while the
Requests overlay (then `PendingRequestsScreen`) was never opened from a notification.

## What changed

| Area | Now |
| --- | --- |
| Notification tap (group) | `ChatThread` for the group conversation, then the `JoinRequest` sheet rises over it once the push transition settles. |
| Notification tap (1:1) | `OneToOneHub` for the plan (negative event id key when no conversation exists), then the `JoinRequest` sheet over it with `includeApproved`. |
| Route/file names | `PendingRequests` → `JoinRequest` (`src/screens/JoinRequestScreen.tsx`, `JoinRequestSheet`); the full-page screen and its tests are deleted; `OneToOneHubScreen` loses its unreachable group mode. |
| Server | `NotificationActionResolution.group_type` tells the client which chat screen to land on. |
| Legacy chat copy | `backfillSystemMessageCopy` rewrites `joined the chat` / `Updated Event Detail` system rows idempotently on startup. |
| Report sheet parity | `useSingleEventMemberActions`: menu → `Report & block {name}?` confirm → prompt with `Tell us why you're reporting {name}`; errors come from `getMemberReportError`, never raw messages. |
| Chat errors | `ChatContext.error` (Messages list) and `ChatContext.threadError` (thread) are separate; a send failure can no longer sit on the Messages list. |

## Evidence (WEIF_API_36 emulator, 2026-09-10)

Screens under `report/issue-127-assets/followup/`:

1. `01-host-inbox.png` — host inbox with the two seeded requests.
2. `02-group-notification-thread-with-sheet.png` — group row → `Issue 127 Group Hike / Group • 1 member` behind the Requests sheet.
3. `03-group-thread-under-sheet.png` — the thread after closing the sheet.
4. `04-inbox-row-lightened.png` — opened row rendered read.
5. `05-single-notification-hub-with-sheet.png` — 1:1 row → `Issue 127 Coffee 1:1 / 1:1 • 0 Accepted` behind the Requests sheet.
6. `06-hub-after-accept.png` — `1:1 • 1 Accepted`, preview `Tester joined the plan`.
7. `07-single-thread-subtitle-time.png` — `Issue 127 Coffee 1:1 • 10 Sep, Thu`, `3:39 AM`.
8. `08-member-menu.png`, `09-report-confirm.png`, `10-report-prompt-placeholder.png` — the Event Details-parity report flow.
9. `11-messages-host.png` — Messages list.

Migration check on a copy of the local database: 20 `joined the chat` and 6 `Updated Event Detail`
system rows became 0 and 0 on first start (23 `joined the plan`, 15 `Plan details updated`).

See the matching entry in `TEST_RUNS.md` for the automated results.
