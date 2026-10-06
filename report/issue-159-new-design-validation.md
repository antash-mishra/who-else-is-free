# Issue #159 — new design verification

Date: October 6, 2026. Branch: `codex/issue-159-new-design`.

Implemented the Cover sheet with its pinned **Choose from library** action and the
Age sheet with a continuous 18–99 slider, integer steps, a five-year minimum gap,
live range label, and explicit Done commit. Both backdrops cover the status bar and
Create/Edit header. Only the full 18–99 range reads **All ages** in range mode.
Existing plans retain their legacy preset/range semantics until explicitly changed.

## Automated verification

- TypeScript typecheck: passed.
- Jest: 139 suites / 1,527 tests passed in the final complete run.
- Go: `go test ./...` passed, including range HTTP validation, persistence after
  schema initialization, legacy edits, custom cover upload/ownership, and media serving.
- Lint: passed with 724 existing warnings and no errors. New picker/slider modules
  introduce no lint warnings.
- Formatting: passed for changed files. Source diff whitespace checks passed; the
  generated dependency patch retains required blank context-line prefixes.

The pinned slider package is patched in source and compiled output for accessible
increment/decrement actions, gesture finalization, and width-dependent resets. The
real component test verifies one-year accessible changes and the five-year gap.

## Native evidence

Local Android 16 emulator `WEIF_API_36` and iPhone 15 Pro / iOS 17.4 simulator.
Both ran the development bundle against an isolated SQLite/API on port 8180 and
Metro on port 8095. No production writes. Photos are emulator fixtures and iOS
simulator stock photos, not personal library content.

- Cover sheet: three-column catalog, search/categories, pinned library action,
  safe bottom clearance, and full-screen dimming on both platforms.
- Native library selection and crop: passed on both platforms; custom photo
  replaces the form preview and blurred page background.
- Age: full bounds show All ages; both native handles drag and show live numbers;
  dragging together clamps to a five-year gap on both platforms.
- Android Back cancels the draft; reopening restores the committed value.
- iOS Done commits `40 - 45` to the form.
- Saved synthetic range plan displays `40 - 45` in Android Discover and Details,
  and hydrates the same range in Edit. Editing to `40 - 76` with a custom photo
  saves successfully; an authenticated server read confirms both the exact range
  mode and persisted custom cover URL. Force-stopping and reopening the Android app
  reloads the saved custom cover and `40 - 76` from the server.

Screenshots are unedited native captures in `screenshots/issue-159-new-design/`:

| Evidence                    | iOS                                                                              | Android                                                                 |
| --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Cover sheet and top overlay | [Cover](screenshots/issue-159-new-design/ios-cover-picker.png)                   | [Cover](screenshots/issue-159-new-design/android-cover-picker.png)      |
| All ages                    | [All ages](screenshots/issue-159-new-design/ios-age-all.png)                     | [All ages](screenshots/issue-159-new-design/android-age-all.png)        |
| Minimum five-year gap       | [40 - 45](screenshots/issue-159-new-design/ios-age-minimum-gap.png)              | [40 - 45](screenshots/issue-159-new-design/android-age-minimum-gap.png) |
| Bounded selection           | [Draft](screenshots/issue-159-new-design/ios-age-range.png)                      | [Draft](screenshots/issue-159-new-design/android-age-range.png)         |
| Confirmed form              | [Custom photo + range](screenshots/issue-159-new-design/ios-confirmed-range.png) | See saved-plan evidence below                                           |

[Saved card](screenshots/issue-159-new-design/android-saved-range-card.png) and
[Details](screenshots/issue-159-new-design/android-saved-range-details.png), and
[Custom cover after restart](screenshots/issue-159-new-design/android-custom-cover-reloaded.png).

## Remaining release checks

Physical-device rendering, screen-reader operation with VoiceOver/TalkBack,
permission denial/error matrix, and staging media-volume durability remain release
checks. Emulator evidence does not certify those environments.

## Issue update

Show these screenshots to the user first. The short note and screenshots are pending
that review, as requested; no issue comment has been posted for this implementation.
