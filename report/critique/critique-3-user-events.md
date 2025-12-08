# Critique - Feature 3: User Events Management

## Findings
- “Requested” state goes stale: `markEventRequested` adds IDs locally and they are only removed when `refreshRequestedEvents` runs; approvals/denials from the host don’t clear the flag, and a fetch error wipes the set entirely (`src/context/EventsContext.tsx:175-205`, `src/context/EventsContext.tsx:206-217`, `src/context/EventsContext.tsx:425-430`).
- Timeline accuracy suffers from the relative `date_label` and creation-order sorting—past events stay in “Today/Tomorrow,” and sections ignore actual event times (`server/repository.go:196-201`, `server/repository.go:699-734`, `src/screens/MyEventsScreen.tsx:34-80`).
- Within each filter, events are not time-ordered; `buildSections` preserves API order, so a later-night event can precede an early-evening one (`src/screens/MyEventsScreen.tsx:45-80`).

## Recommendations
- Track request state from the server (or WebSocket events) and clear/add IDs based on actual approvals/denials instead of permanent local flags; surface errors instead of silently emptying the list.
- Persist absolute event dates and sort sections by start time so “Created/Joined/Requested” views reflect the real schedule and hide outdated events.
- When refreshing “Requested,” also refresh the event list to avoid stale event details for those IDs.
