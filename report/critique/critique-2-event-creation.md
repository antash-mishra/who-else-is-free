# Critique - Feature 2: Event Creation

## Findings
- Event creation is unauthenticated: `POST /api/events` sits in the public route group and trusts the client-provided `user_id`, so anyone can create or spoof events for any user (`server/router.go:26-33`, `server/handler.go:24-71`). Updates/deletes are protected, but creates are not.
- Date handling is purely relative (`Today`/`Tmrw`) with no real date stored, so events never expire and cannot be scheduled beyond tomorrow; the label becomes incorrect the next day (`server/models.go:109-118`, `server/repository.go:569-628`).
- Group type (Single/Group) is only stored in a client-side memo (`badgeLabel` in `metaRef`) and is never written to the backend, so a “Group” event reloaded later appears without that badge (`src/screens/CreateEventScreen.tsx:137-190`, `src/screens/CreateEventScreen.tsx:360-389`, `src/context/EventsContext.tsx:255-261`).
- Time validation is UI-only: past times are merely disabled in the picker, but the submission path and backend accept any string, so users can publish events in the past (`src/screens/CreateEventScreen.tsx:257-277`, `server/models.go:109-118`).

## Recommendations
- Move event creation under the authenticated router and derive the host ID from the session instead of trusting `user_id` from the payload.
- Persist an absolute event date/time (or compute the label on the server) and filter out past events so schedules stay accurate across days.
- Add a persisted field for group/audience type and return it from `/api/events` to keep badge data consistent after reloads.
- Reject past start times server-side and revalidate the selected slot when toggling “Today”/“Tomorrow.”
