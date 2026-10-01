# Issue #159: custom plan covers and multiple age groups

Status: implemented on `codex/issue-159-create-plan`; final design and release verification pending.
Prepared: September 30, 2026.
Source: https://github.com/antash-mishra/who-else-is-free/issues/159
Baseline: `master` at `1ea1a89404fe286bccca7707cec324d16373b1aa`.

## Requested outcome

Hosts can choose their own photo as a plan cover and select multiple age groups
in the age picker. Both choices must survive submission, reload, and editing.
The issue comment says Sumit will provide the design and requests preparation
on another branch. Future implementation should start on
`codex/issue-159-create-plan`; this document does not imply implementation or
design approval. Do not publish or deploy as part of planning.

## Existing behavior and affected boundaries

- `src/screens/CreateEventScreen.tsx` composes both Create and Edit. Form state,
  temporary picker selections, and payload conversion live in
  `src/screens/create-event/useCreateEventForm.ts`, `createEventForm.ts`, and
  `CreateEventSheetContent.tsx`.
- The age sheet uses single-select `SelectionModalContent`. `eventOptions.ts`
  defines overlapping presets, including `20s` as **18–29**, `20-25`, `25-30`,
  `30s`, and `40+`. Keep their current bounds until an explicit product change.
  A single `[min, max]` pair currently travels through form, API, and SQLite.
- Covers come from `CoverPickerContent`, `CoversContext`, and a generated
  catalog. Server create/update validation accepts catalog keys only.
  `ensureValidEventCoverKeys` also resets unknown keys during startup.
  Custom uploads therefore need a separate reference, not a fabricated key.
- `expo-image-picker` is already installed. `EditProfileScreen.tsx` offers a
  permission/picker reference, but its base64 avatar transport should not become
  the event-cover persistence format.
- Event mapping/display is shared through `src/api/mappers/events.ts`,
  `src/utils/eventDisplay.ts`, and `src/components/events/eventListSections.ts`.
  Chat summaries, notification cover payloads, Event Details, and the new
  `server/past_events_pagination.go` must also carry the new fields.
- The server uses SQLite and a Fly volume mounted at `/data`. Catalog images
  are build assets served by `server/router.go`; there is no custom-cover
  upload boundary today. Deployment topology must be checked before selecting
  volume storage for user uploads.
- Age fields currently describe the audience; inspection found validation and
  display/storage uses, but no age-based joining restriction. This issue should
  not introduce a new joining restriction.

## Proposed contracts and decisions to settle

These are implementation defaults, not additional requirements from the issue.
Settle them before changing the API or finalizing the UI.

### Age selection

- Multiple presets represent their union. Selecting `20-25` and `40+` must
  preserve the gap **26–39**, rather than silently storing **20–60**.
- Keep stable preset IDs for exact edit round-tripping, plus canonical inclusive
  ranges for display/domain use. Deduplicate IDs and merge overlapping or
  adjacent integer ranges. For example, `20-25` plus `25-30` covers **20–30**.
  Derive ranges from validated IDs server-side rather than trusting two
  independently supplied representations.
- Proposed additive wire fields are `age_group_ids` and `age_ranges` (response
  ranges have `min` and `max`). Retain `min_age`/`max_age` as a legacy envelope;
  new clients use the exact ranges. Explicitly document that older clients
  cannot display gaps correctly. If that limitation is unacceptable, gate
  publishing disjoint groups until supported app versions are available.
- `All ages` is exclusive: selecting it clears other presets, selecting a
  specific preset clears it. Keep at least one selection, or disable Confirm
  for an empty selection with visible guidance. Default remains All ages.
- Preserve temporary selections until Confirm; dismissing the sheet discards
  them. Reopening starts from the confirmed selection.
- Preserve legacy arbitrary ranges, including bounds above the current UI's
  `AGE_MAX=60`, when hydrating/editing old plans. Do not clamp existing data or
  guess a preset that broadens it. Show an exact legacy range until the host
  deliberately replaces it.
- Omitted new fields on an unrelated legacy-client edit preserve stored exact
  groups when the envelope is unchanged. A changed legacy range intentionally
  replaces the exact groups with that range. Test both cases explicitly.

### Custom covers

- Retain catalog selection and offer photo-library selection, preview,
  replacement, and return to a catalog cover. Camera capture and a redesign of
  the catalog are outside this issue unless requested.
- Proposed API: authenticated multipart `POST /api/event-covers` returns an
  opaque owned `cover_upload_id` and a server-generated `cover_url`. Create/Edit
  accepts the ID; clients cannot supply arbitrary remote URLs or filesystem
  paths. Responses include the resolved URL. Catalog keys remain valid.
- Make catalog and custom cover choices mutually exclusive in client state.
  On update, omission means preserve the custom cover; explicit `null` clears
  it and selects the supplied/default catalog key. Validate ownership whenever
  an upload ID is attached. Preserve the existing host-only event update rules.
- Use local URIs only for draft preview. Upload after sign-in and before event
  creation/update; block duplicate submissions and keep the draft on failure.
  Reuse a successful upload ID on a failed event-save retry. Guest creation must
  retain a readable draft asset through sign-in without uploading anonymously.
- Proposed limits to finalize: one still image, at most 5 MiB input, at most
  20 megapixels decoded, output longest edge at most 1600 pixels. Validate actual
  file content, cap request/decode resources, normalize orientation, re-encode
  to a supported format, and remove metadata. Define handling for HEIC and
  animated images explicitly; do not rely only on extensions or MIME headers.
- Simplest storage candidate: generated files in `/data/event-covers` and
  upload metadata in SQLite, with ignored local development storage. Confirm
  all serving instances share the required media before adopting this. If
  volume topology cannot support durable serving, select shared object storage
  as a separate explicit decision; do not add a provider speculatively.
- Decide whether covers are public bearer URLs, consistent with discoverable
  plans, or require authenticated reads. Align that decision with notifications
  and image caches. Serve only generated media names; never expose directories.
- Account for abandoned uploads, replaced covers, deleted plans/accounts, and
  historical notification references. Define bounded retention and reference
  checks before cleanup; a replacement must not break media still in use.
  File and database failures must not leave committed plans pointing to missing
  files. Backup/restore must include both media and metadata.

## Implementation sequence

### 1. Contracts and failing tests

Create the feature branch from updated `master`. Resolve the decisions above
and obtain Sumit's design for upload entry, selected rows, summary, loading,
error, and empty-selection states. Domain/API work can proceed against agreed
contracts while final visual integration waits for the design.

Add focused production-boundary tests before implementing each behavior:
age gaps/overlaps/All ages, legacy edits, cover ownership, and upload failure.
Prove failures arise from missing behavior, then implement minimally and rerun.
Existing `CoverPickerModal.test.tsx` mostly asserts local literals; add real
render/interaction tests rather than relying on those assertions.

### 2. Exact age groups end to end

Add focused normalization/selection helpers and typed contracts. Add an
idempotent SQLite migration for nullable exact selection data, preserving old
rows without lossy preset inference. Follow existing startup migration patterns
in `server/repository_schema.go` and verify database reopening.

Update `server/models.go`, create/update handlers, event repository SQL and
scanners, chat event reads, and paginated past-event reads together. Update
EventsContext create/edit/guest payloads and event mappers. Reuse the original age
sheet chip layout through `SelectionModalContent` with multiple selection,
shared confirmation guards, theme, and haptic behavior; keep gender/group selection single-select.

Update shared card/detail audience labels for exact range unions, preserving
metadata separators and unrestricted-age omission. Review
`server/repository_analytics.go`: its age buckets currently use the envelope;
document the compatibility meaning or update that aggregation with tests.

Acceptance: adjacent, overlapping, and separated selections survive create,
refresh, edit, guest sign-in completion, and past-plan reads. Legacy plans retain
their exact original range when unrelated details change.

### 3. Upload persistence and API

Introduce focused upload handler/storage modules rather than expanding event
handlers with image processing. Add owned upload metadata and nullable event
references. Implement bounded multipart parsing, format validation,
normalization, generated file names, durable writes, safe serving, and the
agreed retention policy. Keep uploads separate from the generated catalog.

Test unauthenticated access, another user's ID, invalid/non-image input,
oversized bytes/dimensions, missing files, storage failure, repeat attachment,
catalog/custom switching, delete cleanup, and restart persistence. Use temporary
storage and synthetic images. Confirm catalog startup normalization leaves
custom-cover references intact.

Acceptance: a saved custom cover is available after a server restart and can
only be attached by its owner; invalid uploads produce stable client errors.

### 4. Photo selection and full display propagation

Add a typed upload API helper and a focused picker/upload hook. Reuse the
installed image picker and existing permission behavior. Compose preview and
upload/error states into Create/Edit without moving transport into the screen.
Preserve sheet coordination, prepared hidden-form behavior, caching/blur,
keyboard dismissal, guest drafts, and successful creation navigation.

Propagate resolved custom URLs through event lists/details, chat summaries,
notification payload parsing and image resolution, and paginated Past Plans.
Prefer a valid custom cover URL, then catalog artwork, then the existing
fallback. Keep notification payloads small; never include photo bytes or local
URIs. Audit all cover-key consumers, including server notification producers,
so custom covers do not disappear outside the form.

Acceptance: picker cancellation/permission failure preserves the prior cover;
upload/save retries preserve the draft; a plan's cover agrees across Create,
Edit, Discover, My Plans, details, messages, notifications, and Past Plans.

### 5. Design integration and release verification

Apply Sumit's final design using existing primitives/tokens. Check Android and
iOS photo permissions (including limited library access), cropping/orientation,
large photos, canceled selection, slow/offline uploads, sheet dismiss/reopen,
keyboard/back gestures, reduced motion, font scaling, and signed-out creation.
Exercise create/edit for both 1:1 and Group plans, plus old catalog-only plans.
Record mobile verdicts in `TEST_RUNS.md`.

Deploy additive server support before enabling new client submissions. Verify
SQLite backup/restore and media durability in staging. Keep old clients working
within the documented envelope limitation. A rollback must retain new schema
and uploaded files; old-server compatibility must be verified before rolling
back a server that encounters new data. Deployment/release approval is separate
from implementing this issue.

## Verification gates

During implementation, run focused Jest and Go tests after each behavior, then:

```sh
npm test -- --runInBand --silent
npm run typecheck
npm run lint
cd server && go test ./...
```

Check touched-file Prettier formatting and `git diff --check`. Preserve the
documented existing lint/format baseline; do not hide new failures. Update
`AGENTS.md`, `CLAUDE.md`, and the shared-components guide if implementation adds
a shared primitive or architectural contract.

## Implementation verification

- Focused API tests proved red for missing exact age ranges and the missing
  upload endpoint before production implementation, then passed after changes.
- Focused form/mapper tests proved red for lost age selections and custom cover
  URLs, then passed. A guest-error test also proved red before adding retained
  drafts and visible retry guidance.
- Full frontend suite: 125 suites, 1,450 tests passed. Typecheck passed. Full lint
  exits successfully with the repository's existing warning baseline; the new
  upload/picker/age modules are checked separately.
- Full Go suite, touched-file Prettier/gofmt checks, and tracked/new-file
  whitespace review passed. Lint exits green with 689 existing warnings;
  new upload/picker/age modules introduce no warnings.
- Android production JavaScript/Hermes export passed to ignored
  `.data/issue159-qa/export`. Emulator interaction verification could not complete:
  the installed app was unresponsive before loading the new bundle, including
  after restart. Attempts and release follow-ups are recorded in `TEST_RUNS.md`.
- Final design from Sumit, physical-device/iOS checks, and staging
  topology/durability verification remain release requirements. No deployment,
  GitHub issue update, or release action is part of this implementation.

Chosen contracts are documented in `docs/custom-plan-covers-and-age-groups.md`:
public bearer cover URLs, existing persistent volume storage, JPEG/PNG inputs,
exact preset unions with legacy envelopes, and seven-day abandoned-upload cleanup
while retaining event/notification references. Analytics retains envelope buckets.

## October 1 visual review follow-up

The implementation and a six-screenshot design report are prepared on
`codex/issue-159-visual-report`. Android emulator recovery allowed targeted
native library/crop/preview and age-picker captures without clearing saved data.
See [the visual report](issue-159-design-report.md) and the October 1 entry in
`TEST_RUNS.md`. Complete native publish/edit/reload, physical Android/iOS, final
design, and staging storage verification remain pending. Full frontend tests,
typecheck, lint (existing warnings), and the Go suite were rerun successfully.

## October 1 age-picker design correction

Per user feedback, the age picker retains the original wrapping chips and Done
button. `AgeGroupsContent` now composes `SelectionModalContent`, keeping multiple
selection, exclusive All ages, exact ranges, and the empty-selection guard.
The three age screenshots in the visual report were replaced with fresh native
captures of this design. The custom-cover design and data contracts are unchanged.
