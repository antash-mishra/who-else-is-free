# Local-First Discover Events Decision Record

## Goal

Discover should prioritize events that are actually relevant to the viewer's location. For v1, a user in Bangalore should see nearby events within the local radius, plus any events they personally created.

## Decisions

- Use the viewer's current device location for v1, not a saved profile/home city.
- Request foreground location permission when the Discover screen loads.
- If location permission is denied, unavailable, or still unresolved, keep the existing all-events behavior.
- Treat events within `50 km` of the viewer as nearby.
- When viewer location is available, show events within `50 km`.
- Always show events owned by the viewer, even when they are beyond `50 km`.
- Do not show a `Farther away` fallback section in v1.
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
- `Upcoming` shows nearby and viewer-owned events grouped by date and sorted by schedule.
- `Nearest` shows nearby and viewer-owned events from nearest to farthest. Viewer-owned events without coordinates sort last.
- `Newest` shows nearby and viewer-owned events sorted by creation time.

## Event Buckets

Events are filtered into one location-aware set:

- `Nearby`: event has coordinates and distance is `<= 50 km`.
- `Viewer-owned`: event `ownerId` matches the current user.

Events farther than `50 km`, or missing `latitude` / `longitude`, are omitted from the location-aware Discover lists unless they are viewer-owned. Missing-coordinate events from other users remain visible only when the app is in the no-viewer-location fallback mode.

## Filtering Rules

- There is no minimum local-event threshold in v1.
- If no events are within `50 km` and the viewer has created no events, the location-aware Discover tabs show the empty state.
- Farther events are not added as fallback because v1 is intentionally local-only.
- Missing-coordinate events from other users are not added as fallback because the manual-location option has been removed and new events should store coordinates.

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

Existing events may have text locations but null coordinates. These are not shown in the location-aware Discover feed for other users because they cannot be ranked locally. Far-away events from other users are also not shown in the location-aware feed. Viewer-owned events remain visible so the host can find/manage them. Missing-coordinate events can return to local discovery for everyone after they are edited with a selected place or backfilled by geocoding their saved location text.

Example observed issue:

- Event `353` was created after a logged-out flow.
- Its text location was stored.
- `place_id`, `latitude`, and `longitude` were null.
- The queued-event flow was updated to prevent this for future logged-out creates.

## Future Improvements

- Backfill coordinates for existing events with null coordinates.
- Move distance filtering/sorting server-side if event volume grows.
- Show a small distance label on event cards once the ordering behavior feels stable.
