# Critique - Feature 1: Event Discovery

## Findings
- Events never expire: the API stores only the relative label `Today`/`Tmrw` and returns every row with no date-based filtering, so “Today” events remain visible days later (`server/models.go:109-118`, `server/handler.go:34-45`, `server/repository.go:196-201`, `server/repository.go:699-734`).
- Sections are ordered by event creation time, not the actual schedule, because `selectEvents` sorts by `created_at` and `buildSections` preserves that order (`server/repository.go:196-201`, `src/screens/HomeScreen.tsx:34-68`), so a 10pm event can appear before a 7pm event for the same day.
- Group badge metadata (Single/Group) is never persisted; it lives only in the in-memory `metaRef`, so a fresh load or another device will render all events without the intended badge (`src/context/EventsContext.tsx:118-137`, `src/context/EventsContext.tsx:255-261`).

## Recommendations
- Store and filter events by an absolute date/time (e.g., ISO date) and drop or hide past events so the “Today/Tomorrow” groupings stay accurate.
- Sort sections by event start time within each date instead of `created_at` to reflect the user’s schedule.
- Persist the group/audience badge on the server (and return it in `/api/events`) so EventCard renders consistent metadata across sessions.
