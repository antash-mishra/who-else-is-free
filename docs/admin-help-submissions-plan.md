# Admin Help Submissions Plan

## Goal

Give approved administrators a secure, consistent Support Inbox for Contact Us and Feedback
submissions. Keep the production database as the source of truth, use persistent database-backed
admin membership, and preserve the existing user submission flow.

## Current State

- `POST /api/help-submissions` stores both form types in `help_submissions`.
- `submission_type` distinguishes `contact` from `feedback`.
- The table already stores message text, urgency, reply preference/address, status, optional user ID,
  and creation time.
- There is no read or management API and no admin UI.
- `adminMiddleware` exists, but the current `/api/admin` route group does not apply session or admin
  middleware. The analytics endpoint under that group is currently public. Sensitive endpoints must
  not be added until the group is protected.

## Admin Identity Model

Admin authorization will use a persistent `admin_users` table keyed by immutable `users.id`:

```sql
CREATE TABLE admin_users (
    user_id INTEGER PRIMARY KEY,
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    granted_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
);
```

Runtime authorization always checks the authenticated session's user ID against this table. Email
addresses are never accepted from a request as proof of admin access.

The first administrators are bootstrapped with the `ADMIN_BOOTSTRAP_EMAILS` Fly secret. On server
startup and after a successful verified Google/Apple login, matching existing users are inserted into
`admin_users`. Matching uses the exact trimmed email stored on the verified account, while the
persisted role remains attached to the immutable user ID. Missing bootstrap accounts are logged without exposing the configured email
list. Once the initial accounts have signed in and been granted, the bootstrap secret can be removed.

This solves the initial provisioning problem without making email the long-term authorization key.
Future grants can be added through a separately authorized role-management workflow without changing
the inbox or middleware.

## Phase 1: Secure Admin Foundation

1. Add and migrate `admin_users`.
2. Add repository operations to check and grant admin membership.
3. Bootstrap configured verified accounts by email into the table.
4. Replace the environment-ID check in `adminMiddleware` with the repository-backed check.
5. Apply session authentication and admin authorization to `/api/admin`.
6. Add `GET /api/admin-access` under normal session authentication. It returns only
   `{ "is_admin": boolean }` and never returns submission data or the bootstrap list.
7. Update analytics tests so its admin endpoint requires authorization.

All security decisions remain server-side. Hiding the client menu is presentation only.

## Phase 2: Admin Help API

Add these routes under the protected admin group:

```text
GET /api/admin/help-submissions
GET /api/admin/help-submissions/:id
PUT /api/admin/help-submissions/:id/status
```

The list route supports validated, bounded filters:

```text
?type=contact|feedback
&status=new|reviewed|closed
&urgent=true|false
&limit=25
&cursor=<opaque-cursor>
```

Responses use a separate admin model and may include a nullable submitter object containing account
ID, name, and email. Repository queries use a `LEFT JOIN` because anonymous submissions and deleted
accounts have no available user identity.

The default ordering is new urgent submissions first, then other new submissions, followed by
reviewed/closed submissions; each group is newest first with ID as a deterministic tie-breaker.

The status route accepts only `new`, `reviewed`, or `closed`. The initial release deliberately has no
delete operation so safety-related records cannot be removed accidentally.

## Phase 3: Admin Support Inbox UI

- Add a typed `AdminSupportInbox` route and expose it from Profile only when the access endpoint says
  the current account is an admin.
- Put admin transport and response mapping in `src/api`, using `requestJson` and `ApiError`.
- Keep fetching, refresh, filtering, pagination, and status mutation in a screen-specific hook rather
  than a global context.
- Reuse shared screen, header, segmented-control, button, badge, empty-state, separator, typography,
  spacing, color, and motion primitives described in `report/shared-components-refactor-guide.md`.
- Show type, state, urgency, message, submitter/reply information, and creation time.
- Support pull-to-refresh, pagination, filters, retry, optimistic-safe status changes, and access
  revocation.
- Show Reply only when a reply address exists; open the device mail client with a safe `mailto:`
  subject and do not automatically close the submission.

## Phase 4: Release Hardening

- Enforce the same maximum message length on client and server.
- Rate-limit anonymous help submissions by client IP with a bounded in-memory limiter suitable for
  the current single-machine Fly deployment.
- Never send message bodies, reply addresses, or other free-form support content to analytics.
- Never log support message bodies or reply addresses.
- Document a support-data retention decision before production launch.
- Keep direct Fly/SQLite access restricted to operators; it is not the normal admin workflow.
- Optional email/Slack alerts remain best-effort future integrations unless a provider is configured.
  If added, alerts should contain only submission ID, type, and urgency, not the full message.

## Testing and Validation

### Backend

- Admin access and sensitive routes return `401` without a session and `403` for a non-admin.
- Database-granted admins can access analytics and help submissions.
- Bootstrap email matching grants the correct immutable user ID.
- List/detail/status routes validate input, paginate deterministically, and handle anonymous/deleted
  users.
- Urgent/new ordering is correct.
- Message length and anonymous rate limits are enforced.
- Existing submission creation remains compatible.
- Run `cd server && go test ./...`.

### Frontend

- Only admins see and can open Support Inbox.
- Loading, empty, filtered, error, refresh, pagination, and status states render correctly.
- Reply only appears when an address exists.
- Run targeted Jest tests, `npm run typecheck`, `npm run lint`, and Prettier on touched files.

### Device Verification

- Start the documented dev-login backend and Android environment.
- Grant the dev account through the bootstrap mechanism.
- Submit Contact Us and Feedback records, open Support Inbox, verify content, filters, reply behavior,
  and status changes.
- Verify a non-admin account cannot see or call the admin surface.
- Capture screenshots and record the verdict in `TEST_RUNS.md`.

## Deployment Order

1. Deploy the protected admin foundation and database migration.
2. Set `ADMIN_BOOTSTRAP_EMAILS` for the initial approved accounts.
3. Have each administrator sign in once and verify their database-backed grant.
4. Remove the bootstrap secret if no further bootstrap grants are needed.
5. Verify unauthenticated and non-admin production requests are rejected.
6. Release the client Support Inbox.
7. Monitor submissions and define the production retention period.

## Acceptance Criteria

- Admin access is stored by immutable user ID in the database.
- Bootstrap email is used only to create the initial persistent grant.
- Only authenticated database-granted admins can read or change submissions.
- Contact Us and Feedback appear in one consistent inbox with useful filters.
- Existing records are visible without copying data.
- Anonymous/deleted-user submissions render safely.
- Submission creation keeps its current behavior apart from explicit length/rate-limit protection.
- No sensitive support content is added to analytics or routine logs.
