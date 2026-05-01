# Analytics Implementation Plan

GitHub issue: https://github.com/antash-mishra/who-else-is-free/issues/38

## Goals

- Add product analytics for app usage, auth conversion, event creation, join requests, chat engagement, retention, and operational failures.
- Use Firebase Analytics for client-side behavior and app/session reporting.
- Use backend-derived reporting for facts that already live in SQLite, such as created events, approved joins, declined joins, messages, event timing, and API failures.
- Keep analytics privacy-safe: no email addresses, message bodies, report reasons, raw auth tokens, or other free-form user text in Firebase event params.

## Non-Goals

- Average fill rate is out of scope because events currently do not have capacity.
- User home/current location analytics are out of scope because users do not currently have a location field.
- Building a full admin dashboard inside the mobile app is out of scope for the first implementation pass.

## Implementation Checklist

### 1. Firebase Analytics Foundation

- [x] Add `@react-native-firebase/analytics` to `package.json`.
- [x] Verify `@react-native-firebase/analytics` does not require a separate Expo config plugin for this library version.
- [x] Create `src/services/analytics.ts` as the only app-facing analytics API.
- [x] Add a no-op fallback for tests, web, and environments where Firebase Analytics is unavailable.
- [x] Add typed event names and typed params so instrumentation stays consistent.
- [x] Set common default params where useful, such as `platform`, `app_version`, and `build_channel`.
- [x] Add Jest mocks for analytics so existing screen/context tests do not need Firebase native modules.

### 2. Screen And Session Tracking

- [x] Add React Navigation screen tracking from `src/navigation/AppNavigator.tsx`.
- [x] Track route names only; do not include user text or event titles in screen names.
- [ ] Confirm Firebase automatic events are flowing for app opens and sessions.
- [ ] Use Firebase DebugView during development to validate events before relying on aggregate reports.

### 3. Auth Funnel

- [x] Change backend auth helper from `getOrCreateUserByEmail(...) (*User, error)` to return `(*User, bool, error)`, where the boolean is `isNewUser`.
- [x] Return `is_new_user` from `/api/google-login` and `/api/apple-login`.
- [x] For Google auth, set `is_new_user=true` only when `CreateUserWithPassword` inserts a new `users` row.
- [x] For Apple auth, set `is_new_user=false` when `GetUserByAppleSubject` succeeds.
- [x] For Apple auth with an email but no Apple subject link, set `is_new_user=true` only if a new `users` row is created; linking Apple to an existing email should be counted as login/account-link, not signup.
- [x] Update `AuthContext` to read `is_new_user`.
- [x] Log `login_started` when the user taps Google or Apple sign-in.
- [x] Log `signup_succeeded` when auth succeeds and `is_new_user=true`.
- [x] Log `login_succeeded` when auth succeeds and `is_new_user=false`.
- [x] Log `login_failed` for rejected/cancelled/errored sign-in attempts, with safe params like `provider` and `failure_stage`.
- [x] Log `profile_completed` after successful profile update.

### 4. Event Creation Funnel

- [x] Log `event_create_started` when `CreateEventScreen` starts a new event flow.
- [x] Log `event_create_submitted` immediately before the POST to `/api/events`.
- [x] Log `event_create_succeeded` after the POST returns the new event ID.
- [x] Log `event_create_failed` when create fails.
- [x] Include safe params: `group_type`, `gender_preference`, `age_range_bucket`, `scheduled_day_of_week`, `scheduled_hour_bucket`, and `source`.
- [x] Do not send event title, description, or raw location to Firebase.
- [ ] Use the delta between `event_create_started` and `event_create_succeeded` to understand abandonment.

### 5. Join Request Funnel

- [x] Log `join_request_started` when the invite prompt opens or when the user starts the join action.
- [x] Log `join_request_submitted` before POST `/api/events/:id/chat/requests`.
- [x] Log `join_request_succeeded` after request creation succeeds.
- [x] Log `join_request_failed` for failed join attempts, with safe params like `status_code` and `reason_category`.
- [x] Log `join_request_cancelled` after DELETE `/api/events/:id/chat/requests/me` succeeds.
- [x] Log `guest_join_requires_auth` when a guest attempts to join and the sign-in sheet opens.
- [x] Treat "joined" as approved membership, not request submitted.

### 6. Host Decision And Chat Engagement

- [x] Log `join_request_approved` after approve succeeds.
- [x] Log `join_request_denied` after deny succeeds.
- [x] Log `member_reported` after member report succeeds.
- [x] Log `event_reported` after event report succeeds.
- [x] Log `message_sent` only after the server confirms a message, not when the optimistic UI adds it.
- [x] Log `message_send_failed` when the socket is unavailable or the server rejects a send.
- [x] Keep message body and conversation text out of analytics.

### 7. Backend Analytics And Reporting

- [x] Add lightweight request/error logging middleware around API routes to count errors by endpoint and status code.
- [x] Add backend reporting queries for event counts by day/time, group type, gender preference, and age range.
- [x] Add backend reporting queries for join requests by status: pending, approved, denied, cancelled/deleted.
- [x] Add backend reporting queries for time from signup to first event created.
- [x] Add backend reporting queries for time from signup to first approved join.
- [x] Add backend reporting queries for messages per event.
- [x] Add backend reporting queries for events with zero approved joins.
- [x] Decide whether backend reporting is exposed through a protected admin API, scheduled report, direct database query, or BigQuery/Looker dashboard.

Implemented backend surface:

- `GET /api/admin/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Protected by normal bearer-token session auth and `ADMIN_USER_IDS`.
- Returns aggregate counts only, not user-level records.
- API failure counts are in-memory since server start.
- Cancelled/deleted join request counts are marked unavailable because pending join-request rows are deleted on cancellation today.

### 8. Admin Visibility

- [ ] Product/admin users can view client analytics in Firebase Console under the project Analytics area.
- [ ] Use Firebase Analytics Dashboard for high-level active users, engagement, retention, and app usage.
- [ ] Use Firebase Events reports for custom events like `signup_succeeded`, `event_create_succeeded`, and `join_request_succeeded`.
- [ ] Use Firebase DebugView during development and QA to inspect raw events from debug devices near real-time.
- [ ] Use Google Analytics/GA4 Explore for funnels and custom breakdowns after Firebase Analytics is linked to a GA4 property.
- [ ] Mark important events as GA4 key events: `signup_succeeded`, `profile_completed`, `event_create_succeeded`, `join_request_succeeded`, and `join_request_approved`.
- [ ] Use GA4 Audiences for cohorts such as browsers who never signed in, signed-up users who never created an event, and hosts with zero joins.
- [ ] Enable Firebase BigQuery export for raw event analysis and custom SQL reporting when Firebase dashboards are not enough.
- [x] For backend-only metrics, expose a protected admin reporting surface or send scheduled reports until a dedicated dashboard exists.

## Event Taxonomy

| Event | Source | Key Params | Notes |
| --- | --- | --- | --- |
| `login_started` | Client | `provider` | Tap on Google/Apple sign-in. |
| `login_succeeded` | Client | `provider` | Auth succeeded for existing account. |
| `signup_succeeded` | Client | `provider` | Auth succeeded and backend returned `is_new_user=true`. |
| `login_failed` | Client | `provider`, `failure_stage`, `status_code` | Do not log raw error strings if they may contain sensitive text. |
| `profile_completed` | Client | `provider` | Successful profile update. |
| `event_create_started` | Client | `source` | Start of create flow. |
| `event_create_submitted` | Client | `group_type`, `scheduled_day_of_week`, `scheduled_hour_bucket` | Before POST. |
| `event_create_succeeded` | Client | `group_type`, `scheduled_day_of_week`, `scheduled_hour_bucket` | After server returns event ID. |
| `event_create_failed` | Client | `group_type`, `status_code`, `reason_category` | Failure category only. |
| `join_request_started` | Client | `event_group_type`, `source` | User starts join flow. |
| `join_request_submitted` | Client | `event_group_type` | Before request POST. |
| `join_request_succeeded` | Client | `event_group_type` | Request created. |
| `join_request_failed` | Client | `event_group_type`, `status_code`, `reason_category` | Request failed. |
| `join_request_cancelled` | Client | `event_group_type` | User cancels own request. |
| `guest_join_requires_auth` | Client | `event_group_type`, `source` | Guest attempted join and sign-in was required. |
| `join_request_approved` | Client + backend reporting | `event_group_type` | Host decision. |
| `join_request_denied` | Client + backend reporting | `event_group_type` | Host decision. |
| `message_sent` | Client + backend reporting | `event_group_type` | Count only confirmed messages. |
| `message_send_failed` | Client | `failure_stage` | Socket unavailable or send rejected. |
| `event_reported` | Client + backend reporting | `event_group_type` | No free-form reason text. |
| `api_request_failed` | Backend | `endpoint`, `method`, `status_code` | Backend operational metric. |

## Metric Ownership

| Metric | Owner | Reason |
| --- | --- | --- |
| Session length and frequency | Firebase Analytics | App/session behavior is captured by the SDK. |
| Browse but never sign in | Firebase Analytics / GA4 funnel | Client can track anonymous browsing and auth conversion. |
| Sign-up vs sign-in | Backend signal + Firebase event | Backend can distinguish created user vs existing user. |
| Time from sign-up to first event created | Backend reporting | Requires authoritative `users.created_at` and `events.created_at`. |
| Time from sign-up to first event joined | Backend reporting | "Joined" means approved membership, not request sent. |
| Event created vs abandoned | Firebase Analytics | Client can compare create start/submitted/succeeded. |
| Events with zero joins | Backend reporting | Requires authoritative membership/join state. |
| Popular event types | Backend reporting | Event attributes already live in SQLite. |
| Events by time/day | Backend reporting | Scheduled event data already lives in SQLite. |
| Join request accepted/declined rate | Backend reporting | Server owns join request status. |
| Messages per event | Backend reporting | Server owns persisted messages. |
| Retention D1/D7/D30 | Firebase Analytics / GA4 | App activity and cohorts are built into Analytics. |
| Churn after signup | Firebase Analytics + backend signup event | Needs signup event plus app activity. |
| Event creation geography | Backend reporting | Current event location is free-form; use cautiously until location is normalized. |
| API errors by endpoint | Backend middleware/reporting | Server should count failures regardless of client behavior. |

## Admin Reporting Surfaces

### Firebase Console

Admins with Firebase project access can use the Firebase Console for client-side analytics:

- Analytics Dashboard: high-level app usage, active users, engagement, retention, and demographics where available.
- Events: aggregate reporting for custom events logged by the app.
- DebugView: near real-time validation for development devices.
- Audiences: user cohorts based on events and user properties.

Firebase aggregate dashboards update periodically, so they are not the right tool for immediate QA. DebugView is the right QA tool.

### Google Analytics / GA4

Firebase Analytics is backed by Google Analytics. Admins can use GA4 for:

- Explore reports for funnels, paths, retention, and custom breakdowns.
- Key events for important product actions.
- Audiences for cohorts such as unsigned browsers, new signups, active hosts, and hosts with no joins.

Recommended key events:

- `signup_succeeded`
- `profile_completed`
- `event_create_succeeded`
- `join_request_succeeded`
- `join_request_approved`

### BigQuery And Looker Studio

For deeper reporting, enable Firebase BigQuery export from Firebase Console > Project Settings > Integrations > BigQuery.

Use BigQuery for:

- Raw Firebase event SQL.
- Joining Firebase events with backend exports.
- Custom dashboards in Looker Studio.
- Long-term historical analysis beyond built-in Firebase reports.

Firebase notes that BigQuery export is useful when Firebase Console reports are not enough, exports run on a daily sync, and the first export can take time to appear.

### Backend Admin Reporting

Several issue metrics are backend facts, not Firebase facts. Until a dedicated admin dashboard exists, the practical choices are:

- Protected admin API endpoints in the Go server.
- Scheduled reports generated from SQLite.
- A backend export job into BigQuery.
- A Looker Studio dashboard backed by BigQuery or a reporting database.

Recommended first backend reporting surface:

- Add a protected `/api/admin/analytics/summary` endpoint for authenticated admins.
- Return aggregated counts only, not user-level records.
- Keep the first version read-only and time-window based, for example `?from=2026-05-01&to=2026-05-31`.

## Backend Signup Signal Design

Current auth already has the branch needed for signup vs login:

- `AuthHandler.getOrCreateUserByEmail` calls `GetUserByEmail`.
- If the user exists, it returns the existing user.
- If `ErrUserNotFound`, it creates a new user with `CreateUserWithPassword`.

Implementation detail:

```go
func (h *AuthHandler) getOrCreateUserByEmail(parentCtx context.Context, email, displayName string) (*User, bool, error) {
    name := strings.TrimSpace(displayName)
    if name == "" {
        name = fallbackNameFromEmail(email)
    }

    ctx, cancel := context.WithTimeout(parentCtx, requestTimeout)
    defer cancel()

    user, err := h.repo.GetUserByEmail(ctx, email)
    if err == nil {
        return user, false, nil
    }
    if !errors.Is(err, ErrUserNotFound) {
        return nil, false, err
    }

    user, err = h.repo.CreateUserWithPassword(ctx, name, email, uuid.NewString())
    if err != nil {
        return nil, false, err
    }
    return user, true, nil
}
```

`respondWithIssuedSession` should include this in the auth response:

```json
{
  "user": { "...": "..." },
  "token": "...",
  "expires_at": 123,
  "is_new_user": true
}
```

## Validation Checklist

- [ ] Run `npm test`.
- [ ] Run `cd server && go test ./...`.
- [ ] Verify Firebase DebugView receives auth, event creation, and join events from a development device.
- [ ] Verify debug events are not counted in aggregate reports.
- [ ] Verify sign-up creates `signup_succeeded`, while returning auth creates `login_succeeded`.
- [ ] Verify Apple account-link to an existing email is not counted as a new signup.
- [ ] Verify backend metrics match SQL counts for a seeded test dataset.
- [ ] Verify analytics calls never include email, message body, event title, description, report reason, or raw location.

## References

- Firebase Analytics overview: https://firebase.google.com/docs/analytics
- Firebase custom events: https://firebase.google.com/docs/analytics/events
- Firebase DebugView: https://firebase.google.com/docs/analytics/debugview
- Firebase BigQuery export: https://firebase.google.com/docs/projects/bigquery-export
- GA4 key events: https://support.google.com/firebase/answer/6317518
- GA4 audiences: https://support.google.com/firebase/answer/6317509
