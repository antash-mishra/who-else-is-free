# Local-First Discover Events Decision Record

## Goal

Discover should prioritize events that are actually relevant to the viewer's location. A user in Bangalore should not primarily see events created in Dublin, while the app should still avoid looking empty when there are not enough nearby events.

## Decisions

- Use the viewer's current device location for v1, not a saved profile/home city.
- Request foreground location permission when the Discover screen loads.
- If location permission is denied, unavailable, or still unresolved, keep the existing all-events behavior.
- Treat events within `50 km` of the viewer as nearby.
- Do not show an `Unknown distance` section in the location-aware Discover feed.
- Events with missing coordinates are still visible when viewer location is unavailable, because Discover falls back to the old all-events behavior in that case.
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
- `Nearest` shows events with known distance from nearest to farthest.
- `Newest` shows nearby events first, sorted by creation time.

## Event Buckets

Events are split into two location-aware buckets:

- `Nearby`: event has coordinates and distance is `<= 50 km`.
- `Farther away`: event has coordinates and distance is `> 50 km`.

Events missing `latitude` or `longitude` cannot be ranked by distance. They are omitted from the location-aware Discover lists and remain visible only when the app is in the no-viewer-location fallback mode.

## Fallback Rules

- If there are at least `5` nearby events, keep the main feed focused on nearby events.
- If there are fewer than `5` nearby events, append fallback sections:
  - `Farther away`
- Missing-coordinate events are not added as fallback because the manual-location option has been removed and new events should store coordinates.

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
- Users must select a location from search suggestions. Manual/free-text location entry is no longer available.
- Event submission requires a selected place with stored `placeId`, `latitude`, and `longitude`.

## Known Data State

Existing events may have text locations but null coordinates. These are not shown in the location-aware Discover feed because they cannot be ranked locally. They still appear when viewer location is unavailable, and they can return to local discovery after they are edited with a selected place or backfilled by geocoding their saved location text.

Example observed issue:

- Event `353` was created after a logged-out flow.
- Its text location was stored.
- `place_id`, `latitude`, and `longitude` were null.
- The queued-event flow was updated to prevent this for future logged-out creates.

## Future Improvements

- Backfill coordinates for existing events with null coordinates.
- Move distance filtering/sorting server-side if event volume grows.
- Show a small distance label on event cards once the ordering behavior feels stable.
