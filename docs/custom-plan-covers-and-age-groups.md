# Custom plan covers and age groups

Issue: https://github.com/antash-mishra/who-else-is-free/issues/159

## API and client compatibility

`POST /api/events` and `PUT /api/events/:id` accept optional `age_group_ids`.
Valid IDs, in display order, are `all`, `20s`, `20-25`, `25-30`, `30s`,
`30-35`, `35-40`, and `40+`. Their bounds match `eventOptions.ts`, including
`20s` = 18–29. `all` is exclusive. Empty and unknown selections are rejected.
The server derives the canonical inclusive `age_ranges` and the legacy
`min_age`/`max_age` envelope. Event responses include exact ranges; older apps
continue to display the envelope and therefore cannot show excluded gaps.

An old client's update without IDs retains existing exact groups when its
range is unchanged. Changing its range replaces the groups with that legacy
range. Legacy arbitrary ranges remain editable without clamping to preset
bounds. These fields describe audience preferences; they do not restrict joining.
Analytics continues to bucket by the legacy envelope; it does not report exact
preset membership.

Custom cover upload is an authenticated multipart
`POST /api/event-covers`, with one file in the `image` field. The response
contains `cover_upload_id` and a relative `cover_url`. Supply the ID on event
create/update. IDs are owned by the uploader and may only be attached by that
user. The existing host authorization applies to event edits.

Omitting `cover_upload_id` on an update preserves its current value; explicit
`null` returns to the supplied/default catalog cover. Custom uploads never enter
or modify the generated cover catalog. Event and conversation responses include
`cover_url`; notification payloads use `coverUrl` alongside catalog fallback.

Uploads accept JPEG or still PNG (animated PNG is rejected), at most 5 MiB and 20 megapixels. The server applies
JPEG EXIF orientation, resizes the longest edge to at most 1600 pixels, and
re-encodes JPEG at quality 85, dropping source metadata. HEIC, GIF, and other
formats must be converted before upload. No camera capture is provided.
The client offers library selection/cropping, preview, and catalog replacement.
Uploads occur after sign-in, before saving the event. A successful upload is
cached within the session for save retries. Failed guest creation retains the
in-memory draft and exposes an error with a Create retry action. Drafts are not
persisted across app restarts.

## Storage and operations

Production uses `/data/event-covers` beside the existing Fly SQLite volume.
Local development uses ignored `server/.data/event-covers` when launched from
`server/`; `EVENT_COVERS_DIR` overrides the directory for tests or explicit
operations. Store only generated UUID filenames, never user-provided paths.

`GET /api/event-covers/:id` serves a public bearer URL, matching discoverable
plan artwork. It requires existing upload metadata and a generated filename;
there is no directory listing. URLs are cached for one day. Do not treat cover
photos as private attachments. Account deletion removes owned upload metadata,
so new reads stop succeeding; previously cached copies can remain until expiry.

On an authenticated upload, cleanup removes unattached metadata older than seven
days, preserving references from both events and notification history. Old files
without metadata are also removed after a seven-day grace period, recovering
crash/account-deletion leftovers. Cleanup runs on upload traffic; during idle
periods cleanup waits for the next upload. Historical notification references
retain their artwork until those notifications are removed.

Before release, verify the serving machine uses the same persistent volume as
its SQLite database. This implementation does not distribute media between Fly
machines. Do not enable additional independent serving volumes without changing
both database and media architecture. Backup and restore SQLite and the media
directory together. Deploy server support before distributing new app builds.
Retain additive schema/media during rollback and verify the older server can
start against the migrated database before using it.

## Validation still requiring release review

The implementation uses existing components and tokens while Sumit's final
design remains pending. Physical iOS/Android permission, cropping, and upload
checks and staging media durability/topology checks are release requirements.
Local automated tests cannot prove the deployed volume configuration.
