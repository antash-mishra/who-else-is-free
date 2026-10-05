# Issue #167 — Android onboarding background cutoff

2026-10-05 scope correction: this report records the earlier global contrast setting.
The current candidate restores default contrast on other routes and overrides it only during
onboarding. See [onboarding-only screenshots and signed APK](issue-167-onboarding-only.md).

Status: implemented and verified on Android 16 emulators; release and affected-phone verification pending.
Scope: the first reported problem only, across all three onboarding steps.

2026-10-05 follow-up: the reporter's cutoff through Continue is a separate background-sizing
case that the equal-window/page Android 16 test below did not cover. See
[window/page reproduction and fix](issue-167-window-background.md). The contrast fix remains
necessary, but does not make a short SVG fill its page. Source configuration also does not
prove a previously compiled or installed APK includes the native setting.

## Measured diagnosis and selected fix (2026-10-03)

The original sizing hypothesis below was not observed on the Android 16 emulator.
The root and window both measured 914.286dp high by 411.429dp wide; bottom safe
area was 48dp. The physical display was 720x1600px, and the pale strip began at
y=1516px, exactly the start of the system navigation region.

Android's default three-button contrast scrim covers the gradient that is already
drawn underneath. Expo SDK 54 enables it unless
`androidNavigationBar.enforceContrast` is explicitly false. The implementation
sets that field in `app.config.js`; it leaves onboarding layout and CTA padding
unchanged. The setting affects Android navigation globally, so other routes and
system-button legibility must be checked. It requires prebuild and a new Android
binary; a Metro reload or OTA JavaScript update is insufficient.

References: [Expo config](https://docs.expo.dev/versions/v54.0.0/config/app/#enforcecontrast)
and [Android system-bar guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge).

The regression test executes Expo's actual edge-to-edge prebuild mods against
the repository app config and an existing app theme. It failed with generated
`android:enforceNavigationBarContrast=true`, then passed with exactly one false
entry, the unrelated input theme item preserved, and edge-to-edge still enabled.
The focused native-config and onboarding tests passed: 3 suites, 66 tests.

The sections below retain the original implementation plan; the native-bar branch
of step 3 is the selected implementation.

## Automated verification

- Baseline onboarding rendering suite: 33 tests passed before the production change.
- Red: `node node_modules/jest/bin/jest.js src/__tests__/androidNavigationBar.test.ts --runInBand --silent`
  failed because Expo generated `android:enforceNavigationBarContrast=true`.
- Green: the native-config test and both onboarding modules passed (66 tests).
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx,.js,.jsx`: exit 0,
  with the existing warning baseline (724 warnings, no errors). The changed
  config and new test also passed a targeted lint run without warnings.
- `node node_modules/jest/bin/jest.js --runInBand --silent`: passed,
  122 suites and 1,443 tests.
- Prettier checks passed for the new test/report and the touched agent/component
  references. `app.config.js` and the historical #131 report still fail their
  pre-existing formatting baseline; checks against their unchanged HEAD versions
  failed too. Avoided unrelated whole-file formatting churn.
- `git diff --check`: passed during implementation; repeat before commit.
- Expo Android prebuild completed and generated the false native theme setting.
  The dependency install used pnpm, with a local hoisted layout to match Jest;
  dependency versions and committed lockfile remain unchanged. The first isolated
  install failed its build-script policy, and the initial isolated-layout Jest
  attempt failed before tests ran. The successful hoisted setup and direct script
  invocations above are the reported validation results.

## Native and visual verification

- Android prebuild succeeded; generated `styles.xml` contains
  `android:enforceNavigationBarContrast=false`.
- `:app:assembleDebug` succeeded (682 tasks), targeting arm64-v8a. The initial
  parallel build was cancelled under memory pressure; the successful run used
  `--max-workers=2 --no-parallel` and compiler parallelism limited locally.
- Baseline: `WEIF_API_36`, Android 16, 720x1600px at 280dpi, three-button
  navigation. The pale strip starts at y=1516px.
- Candidate: isolated `WEIF_ISSUE_167` / emulator-5556 with the same OS, size,
  density, and navigation configuration, rebuilt debug APK, Metro port 8183,
  local Go backend port 8090, and synthetic onboarding preset. Initial emulator
  startup stalls were resolved by a headless software-rendering launch with 3GB
  RAM. No production account or database was used.
- All three steps pass in three-button and gesture navigation: the gradient
  reaches the bottom and controls remain clear of the system navigation region.
  Back/Continue navigation and gender selection work. The name keyboard opens,
  and dismissal restores the full background. Cold process restart re-enters
  onboarding without a persistent bottom band. First-frame flash was not measured.
- Synthetic onboarding submission succeeds and reaches the main app. Discover,
  My Plans, Messages, Profile, and Create Plan were inspected with three-button
  navigation. System controls remain visible. Create Plan's local empty gray
  background has weaker contrast than the white routes; dynamic backgrounds
  should also be checked on the release candidate.
- Screenshots are unmodified captures in `report/issue-167/`: before/after,
  remaining steps, gesture mode, keyboard shown/dismissed, cold launch, and
  representative main routes. The baseline and candidate use separate emulator
  instances to avoid interfering with another active task.
- Affected physical Android device and iOS visual checks were not run. iOS
  rendering code is unchanged. Event Details/chat-thread content was not exercised
  because this synthetic backend has no plans or conversations.

This fixes the reproduced background cutoff in the candidate binary. The fix is
not deployed: merge, prebuild, and a new Android release are still required.

## Required outcome

The onboarding gradient must cover the entire visible page, including the area
below Continue and behind Android navigation controls where edge-to-edge drawing
is supported. The button must retain its safe bottom clearance. Preserve the
existing gradient colors, opacity, header placement, pager, and iOS appearance.

## Evidence and unresolved cause

- [Issue #167](https://github.com/antash-mishra/who-else-is-free/issues/167):
  Sumit's annotated screenshot shows a horizontal gradient cutoff behind the
  button and a white region underneath.
- [Earlier explanation, point 6](https://github.com/antash-mishra/who-else-is-free/issues/131#issuecomment-5488993354):
  interpreted the complaint as a button overlapping the navigation bar.
- Commit `f32556243d7a210bb2bea018c26f7120757ab6eb` added bottom CTA padding,
  without changing background sizing. The fix remains on current master.
- `OnboardingScreen.tsx` sizes its SVG and painted rectangle from
  `useWindowDimensions().height`; the containing view uses `flex: 1` and has a
  white background. A mismatch with the actual layout could expose that white.
- The earlier report called its explanation plausible, without reproducing the
  affected OEM behavior. Existing onboarding tests do not assert background coverage.

The size mismatch is a hypothesis. An opaque system-bar background, parent
clipping, or window configuration must also be checked before choosing the fix.
The reporter's installed build/version is unknown; record it if available.

## 1. Reproduce and measure before editing

1. Check git status and read repository instructions, the shared-components guide,
   `report/issue-131-fix-plan.md`, the screen, nearby tests, `App.tsx`,
   `AppNavigator.tsx`, `app.config.js`, and `bottomObstruction.ts`.
2. Build current master against a local test backend. Enter onboarding with the
   existing development-only onboarding preset and synthetic profile data.
3. Start with Android three-button navigation, then repeat with gesture navigation.
   Capture each step with the keyboard hidden and step 1 before/after keyboard use.
4. Temporarily measure root layout dimensions, SVG bounds, window dimensions,
   safe-area insets, button bounds, and the system navigation region. Record only
   geometry and build/device metadata. Inspect generated native window configuration
   if the cutoff coincides with an opaque system bar.
5. Identify exactly which layer paints the white strip. Capture a baseline with
   its boundary marked. If the emulator does not reproduce it, retain an explicit
   unverified verdict and verify on the affected device before declaring resolution.

## 2. Add the regression test and prove it fails

Extend `src/screens/__tests__/OnboardingScreen.rendering.test.tsx` with a layout
case matching the measured failure. If the root is taller than the reported
window, simulate that root layout and assert the background reaches its full
height. Simulate a subsequent size change and assert coverage updates. Exercise
the real screen boundary; do not test only a new arithmetic helper.

Run the focused test against unchanged production code and confirm an expected
coverage failure. If measurement instead identifies an opaque native system bar,
use a reproducible device screenshot check as the regression evidence; a mocked
JS rendering test cannot prove native system-bar transparency.

## 3. Implement the smallest correction supported by measurement

For a background sizing mismatch:

- Make the decorative background fill the outer screen independently of padded
  content. Prefer a fill wrapper and measured root dimensions when the SVG needs
  numeric gradient coordinates; use root layout rather than physical-screen
  constants or an added navigation-bar height.
- Use consistent dimensions for the SVG viewport, rectangle, and gradient.
  Avoid a white first frame while layout is measured, and avoid stretching the
  gradient differently on iOS. Compare the existing and candidate iOS captures.
- Keep header and pager geometry independent of the background dimensions so
  extending the background does not move the content or change slide distance.
- Keep `getBottomBarClearance()` and existing button padding during this fix.
  Increasing button clearance cannot extend the painted background.

If native system-bar opacity is the measured cause, use the existing Expo/native
configuration path and the narrowest supported correction. Document its impact
on other routes and verify those routes before adopting a global change. Do not
disable edge-to-edge drawing or introduce device-specific spacing guesses.

Keep this screen-specific unless an existing suitable shared primitive exists.
Remove temporary diagnostics after verification. The camera badge is a separate
follow-up and must not be bundled into this change.

## 4. Verify behavior and visual coverage

Run the focused regression test, both onboarding test modules, then the frontend
typecheck, lint, full Jest suite, and formatting check for touched files using the
repository's configured scripts. Review the complete diff and run `git diff --check`.
Record exact commands, outcomes, pre-existing failures, and unrun checks.

Verify on-device with before/after screenshots from the same configuration:

| Configuration                         | Required checks                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Android three-button navigation       | All three steps; full bottom coverage; safe CTA clearance                        |
| Android gesture navigation            | All three steps; no white bottom band; readable system controls                  |
| Affected physical Android device      | Reproduce original symptom, then verify candidate on the same device             |
| Android keyboard shown then dismissed | Background recovers fully; name input and Continue remain usable                 |
| Cold launch and re-entry              | No persistent white band or new first-frame flash                                |
| iOS                                   | Gradient appearance, header placement, CTA position, and pager remain consistent |

Also complete onboarding with synthetic data to verify submission and navigation.
Inspect background pixels outside the button and system glyphs for a hard seam;
allow intentional OS contrast treatment rather than claiming pixel identity there.

## Acceptance and handoff

- [x] Measured cause is recorded, separately from the earlier hypothesis.
- [x] The focused regression fails before the fix and passes afterward, or native
      screenshot evidence establishes the before/after failure and correction.
- [x] The gradient covers all three steps through the bottom drawable region.
- [ ] CTA clearance, input, pager, and submission work; iOS visual checks pass.
- [x] Android navigation-mode checks and affected-device verdict are recorded.
- [x] Quality checks and complete diff review are recorded honestly.
- [x] Update this report and `TEST_RUNS.md` with build, device, navigation mode,
      and evidence. Explain the corrected diagnosis alongside the old #131 report.

If the affected device is unavailable, report the verified configurations and
leave affected-device verification pending. The user has explicitly authorized
implementation and a screenshot update in #167. Keep the issue open because its
camera-badge item is outside this change; publish the candidate status honestly.
