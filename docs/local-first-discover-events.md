# Local-First Discover Events Decision Record

## Goal

Discover should prioritize events that are actually relevant to the viewer's location. A user in Bangalore should not primarily see events created in Dublin, while the app should still avoid looking empty when there are not enough nearby events.

## Decisions

- Use the viewer's current device location for v1, not a saved profile/home city.
- Request foreground location permission when the Discover screen loads.
- If location permission is denied, unavailable, or still unresolved, keep the existing all-events behavior.
- Treat events within `150 km` of the viewer as nearby.
- Keep events with missing coordinates visible. They are not considered nearby or far away; they are shown as unknown distance.
- Keep the backend unchanged for v1. The API already returns `place_id`, `latitude`, and `longitude` when they are stored.

## Discover Tabs

When viewer location is unavailable:

- Show only `Upcoming` and `Newest`.
- `Upcoming` behaves like the old feed: grouped by event date and sorted by schedule.
- `Newest` behaves like the old feed: sorted by creation time.
- Hide `Nearest`, because distance cannot be calculated.

When viewer location is available:

- Show `Upcoming`, `Nearest`, and `Newest`.
- `Upcoming` shows nearby events first, grouped by date and sorted by schedule.
- `Nearest` shows all events with known distance from nearest to farthest, then unknown-distance events.
- `Newest` shows nearby events first, sorted by creation time.

## Event Buckets

Events are split into three buckets:

- `Nearby`: event has coordinates and distance is `<= 150 km`.
- `Farther away`: event has coordinates and distance is `> 150 km`.
- `Unknown distance`: event is missing `latitude` or `longitude`.

Unknown-distance events stay visible so old/manual events do not disappear.

## Fallback Rules

- If there are at least `5` nearby events, keep the main feed focused on nearby events.
- If there are fewer than `5` nearby events, append fallback sections:
  - `Farther away`
  - `Unknown distance`
- `Unknown distance` can still appear after nearby events, because those events may be real and useful even though we cannot rank them geographically.

## Event Creation Rules

- When a signed-in user selects a Google place, store:
  - `location`
  - `place_id`
  - `latitude`
  - `longitude`
- When a user creates an event while logged out:
  - Queue the full draft before opening sign-in.
  - Preserve `placeId`, `latitude`, and `longitude` in that queued draft.
  - After sign-in, submit those same place fields with the event.
- When a user manually enters a location, clear `placeId`, `latitude`, and `longitude`; the event will appear under unknown distance.

## Known Data State

Existing events may have text locations but null coordinates. These remain in `Unknown distance` until they are edited/recreated or backfilled by geocoding their saved location text.

Example observed issue:

- Event `353` was created after a logged-out flow.
- Its text location was stored.
- `place_id`, `latitude`, and `longitude` were null.
- The queued-event flow was updated to prevent this for future logged-out creates.

## Future Improvements

- Backfill coordinates for existing events with null coordinates.
- Move distance filtering/sorting server-side if event volume grows.
- Show a small distance label on event cards once the ordering behavior feels stable.
