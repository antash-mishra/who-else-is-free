# Issue #159 — updated design implementation plan

Date: October 6, 2026 (Asia/Kolkata).
Status: implemented on `codex/issue-159-new-design`; native evidence and validation are in
`report/issue-159-new-design-validation.md`. Screenshots were reviewed by the user and posted to [issue #159](https://github.com/antash-mishra/who-else-is-free/issues/159#issuecomment-6021657473).

## Design sources and scope

- [Photo-picker design comment](https://github.com/antash-mishra/who-else-is-free/issues/159#issuecomment-5971790541).
- [Age-picker design comment](https://github.com/antash-mishra/who-else-is-free/issues/159#issuecomment-6000714040).
- [Suggested slider](https://github.com/antash-mishra/who-else-is-free/issues/159#issuecomment-5971273547).
- [Previous implementation report](https://github.com/antash-mishra/who-else-is-free/issues/159#issuecomment-5924842360).

The new age design supersedes the multiple-chip interaction: new selections use
one continuous range. Custom photo storage and upload behavior remain reusable.

The photo reference shows the existing Cover sheet, search, horizontal category
chips and three-column grid, with a black pill **Choose from library** button
pinned over the bottom of the grid. The age reference shows an **Age** sheet,
**Age range** label with a live value on the right, a black selected track, gray
unselected track, white circular handles, close control, and black pill **Done**.

The age annotations specify bounds 18–99, integer values, and a minimum five-year
gap. Full bounds display **All ages**; changing either bound displays the actual
numeric range throughout the app. The middle mockup says `24-99` while its note
uses `20 - 99`: treat these as examples, and always render the selected numbers.
Use consistent `min - max` spacing for new range labels.

## Verified starting point

Current checkout: `master` at `623caae`, clean before this plan. Previous feature
branch: `codex/issue-159-visual-report` at `bc1ffd3`.

The feature branch contains photo selection/cropping, upload ownership and
storage, retry caching, cover propagation, exact age-group persistence and tests.
Its photo button is currently above `CoverPickerContent` in
`CreateEventSheetContent.tsx`; `AgeGroupsContent.tsx` implements multi-select chips.
Master still has the original cover catalog and single-choice age chips.

Start implementation on a `codex/issue-159-new-design` branch based on current
master. Integrate the earlier feature commits, resolving against current master
rather than replacing newer files with old branch copies. In particular,
preserve date-picker readiness/preparation, keyboard handoff, creation navigation,
and long-text fixes. Reuse the feature branch's API, upload hook and cover
rendering work; replace its age UI.

## 1. Cover sheet

- The dimmed overlay/backdrop must extend to the very top of the screen,
  including behind the status bar and over the Create plan header. This is
  full-screen backdrop coverage; the white sheet retains its bottom-sheet
  position. Keep safe-area padding on sheet content, not on the backdrop.
  Verify the shared `BottomSheet`/host covers the full native window and does
  not leave an undimmed top strip on either platform. It already uses an
  absolute-fill backdrop and `statusBarTranslucent` for native modals; confirm
  the actual Create/Edit presentation rather than assuming those props prove
  coverage. Prefer correcting the shared presentation boundary over adding a
  second screen-local overlay. Apply the same coverage to the Age sheet.
- Move the library action into the cover content layout with an optional action
  callback, busy state and error. Remove the above-grid button from
  `CreateEventSheetContent`.
- Keep search and categories above a virtualized three-column grid. Anchor a
  shared `AppButton` labeled **Choose from library** inside the sheet bottom,
  matching the reference's pill shape and horizontal inset.
- Reserve grid bottom padding for the button and safe-area clearance so the last
  row can scroll fully above it. Use the actual available sheet layout; avoid
  adding another fixed-height wrapper around the existing grid. Apply the shared
  bottom-obstruction rules once.
- Keep the button visible with search results, empty results and any selected
  cover. Do not mark a catalog tile selected when a custom cover is active.
- Preserve `usePickEventCover`: image-library selection, native crop, preview and
  blurred background update, replace-photo flow, and catalog fallback. Do not add
  camera capture or custom crop UI; neither is in the supplied design.
- Coordinate sheet dismissal and native picker presentation through the existing
  sheet lifecycle. Canceling selection/cropping or denying permission preserves
  the previous cover and leaves a usable form; prevent duplicate launches and
  surface actionable errors on the restored surface.
- Preserve authenticated upload before save, guest draft through sign-in,
  ownership checks, and reuse of a successful upload after event-save failure.

Primary files: `src/components/CoverPickerModal.tsx` and its styles,
`src/screens/create-event/CreateEventSheetContent.tsx`, `CreateEventScreen.tsx`,
and `src/hooks/usePickEventCover.ts` from the earlier branch.

## 2. Age sheet and slider

- Add feature-level `AgeRangeContent.tsx` and styles; use shared sheet header,
  `AppText`, `AppButton`, theme colors, radii, spacing and shadow tokens.
- Replace `AgeGroupsContent` in the Create/Edit sheet switch. Keep gender/group
  selection on `SelectionModalContent`.
- Use 18 and 99 as endpoints, step 1, no crossing, and `max - min >= 5`.
  Clamp the moving handle against the stationary one; do not push the other
  handle unexpectedly. Reaching both endpoints restores **All ages**.
- Dragging updates only the temporary selection. Done commits; close, backdrop
  dismissal and hardware Back discard changes. Reopening hydrates the last
  confirmed selection, including after switching sheets.
- Use the linked library first, behind a narrow adapter, with a pinned version
  after checking the published package against the reviewed source. Prove it
  works inside the sheet on Expo 54 / React Native 0.81 / Reanimated 4 before
  committing to integration.

The reviewed [slider source](https://github.com/amitpdev/react-native-fast-range-slider/blob/main/src/RangeSlider.tsx)
uses pixel-based `minimumDistance`, initial-value props, and adjustable roles
without adjustment handlers. Convert the five-year gap using measured track
width (`width * 5 / 81`) and enforce the integer gap after rounding. Validate
resizing, reopened values, canceled drags and screen-reader increment/decrement.
Disable thumb lines and use token styling. If required behavior cannot be supplied
through props, use a minimal documented `patch-package` patch; do not ship broken
adjustability. Peer ranges accept the installed libraries, but native compatibility
still needs testing.

Keep motion optional with reduced-motion support; avoid per-frame haptics and
rerendering the full form during dragging.

## 3. Persistence and previous-plan compatibility

Changing `AGE_MAX` from 60 to 99 alone is insufficient. The prior server's `all`
and `40+` presets are defined as 18–60 and 40–60, and supplied group IDs override
the submitted numeric bounds. Preserve those legacy preset definitions.

Proposed additive contract: optional `age_selection_mode: "range"` for new
slider-confirmed selections. This explicitly distinguishes new 18–60 from the
old **All ages** sentinel, and distinguishes replacing exact groups from an old
client's unrelated edit. Implement this contract before the new app ships.

- Range-mode writes validate integer bounds 18–99 and a gap of at least five,
  persist the mode plus `min_age`/`max_age`, and clear stale preset IDs. Reject
  contradictory range-mode/group-ID payloads. Responses return one exact range.
- Requests without the new mode retain existing legacy behavior, including exact
  group unions. Do not impose the new gap/bounds rule on unchanged historical
  selections or old-client requests.
- Hydration preserves saved numeric ranges and exact unions. A known legacy
  All-ages selection may be presented at 18–99 in the slider draft, but merely
  opening/closing the sheet or editing another field must not rewrite it.
- A legacy selection with gaps cannot be represented by one slider. Keep its
  exact label and payload until an explicit replacement. In the age sheet show
  the existing groups plus clear guidance that applying a range replaces them;
  require a deliberate range change/replacement before committing that conversion.
- Apply the same explicit replacement handling to historical selections outside
  18–99 or narrower than five years. Never silently clamp saved data on hydration.
- Old clients may omit the mode. Preserve it on unrelated updates; define and
  test clearing it when an old client actually replaces the audience selection.
- This remains an audience preference; do not introduce join eligibility gates.
  Profile/onboarding age bounds remain separate.

Update `createEventForm.ts`, `useCreateEventForm`, guest drafts, EventsContext
transport, event/chat mappers, server request models, normalization, repository
storage and response serialization together. Reuse existing migration patterns.

## 4. Consistent display

Centralize mode-aware age formatting in `eventDisplay.ts` and the existing age
helpers. New full-range selections show **All ages**, including card metadata
where the old implementation omits unrestricted ages; this follows the new
annotation's “everywhere” requirement. Bounded selections show the actual
`min - max`, without preset names or `40+`.

Audit Create/Edit summaries, Discover, My Plans, Past Plans, Event Details,
chat plan summaries and any notification copy that includes ages. Keep exact
legacy union labels until replacement. Update list mapping and tests together;
confirm card wrapping/ellipsis with the added All-ages text. Preserve existing
metadata separators, gender copy and stored historical notification content.

## 5. Validation and delivery

1. Integrate prior work and establish a baseline on current master.
2. Prove the slider adapter's gap, reset, resize and accessibility behavior.
3. Implement the additive age contract and compatibility tests.
4. Complete age composition/formatting, then cover-sheet layout and picker handoff.
5. Update `AGENTS.md`, `CLAUDE.md`, the shared-component guide, and
   `docs/custom-plan-covers-and-age-groups.md` with the final implemented contract.
6. Run targeted Jest suites for form mapping, formatting, slider confirmation,
   cover/picker states and EventsContext; run relevant Go API/repository tests.
   Then typecheck, full frontend suite, lint, full Go suite, touched-file Prettier
   and `git diff --check`. Record the current warning baseline, not the old count.
7. Capture fresh Android and iOS screenshots matching both supplied references.
   Confirm the backdrop reaches the top edge and dims the status-bar region and
   Create plan header, with no uncovered strip during entry, exit or reopening.
   Verify publish/edit/reload for 1:1 and Group, guest sign-in, photo cancellation,
   permissions/limited access, crop orientation, offline/retry, keyboard-open
   cover entry, safe areas, large text and screen readers.
8. Verify age examples: 18–99 → All ages; 24–99 → 24 - 99; 20–60 → 20 - 60;
   40–45 → 40 - 45; attempted 40–44 stays at a five-year minimum. Test legacy
   exact unions and unchanged edits across old/new clients.
9. Retain earlier release checks: physical devices, deployed media/database volume
   durability and backup/restore. Deploy additive server support before the app.
   Publish a new visual report without presenting draft screenshots as proof of
   saved-plan persistence.

Acceptance: both sheets match the new visual references, saved/reloaded labels
match confirmed values, historical audiences survive unrelated edits, and custom
cover persistence/display behavior continues to pass the earlier feature tests.
