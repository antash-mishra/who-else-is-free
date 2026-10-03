# Issue #166: frosted bottom tab bar — history and restoration

Source: [Bottom tab #166](https://github.com/antash-mishra/who-else-is-free/issues/166).
Status: implemented and tested; device verification pending.
User clarification: restore the second historical change (23 January 2026), with the 60% overlay and blur, rather than an opaque white bar.
Branch: `codex/issue-166-white-bottom-tab`, based on `origin/master` at `1ea1a89404fe286bccca7707cec324d16373b1aa`.
Investigated: 3 October 2026. All times below are IST.

## When it happened

Full Git history was fetched before drawing conclusions; the original local checkout was shallow.
The issue screenshot shows sharp event text and cover imagery through the bar, rather than only a tinted white surface.

| When                                  | Change                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before 12 December 2025               | The tab bar base used `colors.background`, defined as opaque `#FFFFFF`.                                                                                                                                                     | Parent of `5e30bd7`, `src/navigation/AppNavigator.tsx` and `src/theme/colors.ts`.                                                                                                                           |
| 12 December 2025, 9:36:54 PM          | Replaced the opaque background with `transparent`, made the bar absolute, and added blur plus a white gradient with 88–92% opacity. This is the first change away from solid white.                                         | [Commit 5e30bd7](https://github.com/antash-mishra/who-else-is-free/commit/5e30bd7).                                                                                                                         |
| 16 December 2025, 8:51:10 PM          | Changed the gradient's bottom color to `#FBFBFB99` (60% opacity).                                                                                                                                                           | [Commit 1d0ebc7](https://github.com/antash-mishra/who-else-is-free/commit/1d0ebc7).                                                                                                                         |
| 13 January 2026, 10:02:09 PM          | Added a 94% white overlay, making the bar appear almost white while remaining translucent.                                                                                                                                  | [Commit 30129c4](https://github.com/antash-mishra/who-else-is-free/commit/30129c4).                                                                                                                         |
| 23 January 2026, 1:57:48 AM           | White overlay reduced from **94% to 60% opacity** (`rgba(255, 255, 255, 0.94)` to `rgba(251, 251, 251, 0.6)`), and the inset gradient was removed. This is the explicit reduction from nearly white to visibly translucent. | [PR #1](https://github.com/antash-mishra/who-else-is-free/pull/1), [commit 07232c2](https://github.com/antash-mishra/who-else-is-free/commit/07232c2). GitHub displays its merge date in UTC as 22 January. |
| 8 June 2026, 4:40:58 AM               | Moved the same 60% overlay into `colors.tabBarFrostedOverlay`; no opacity change.                                                                                                                                           | [Commit 7534ac6](https://github.com/antash-mishra/who-else-is-free/commit/7534ac6).                                                                                                                         |
| 10 September 2026, 8:31:44 PM (merge) | Replaced `BlurView` with `FrostedSurface` without `blur`. The default path paints a flat tint, so underlying text/images stay sharp.                                                                                        | [PR #142](https://github.com/antash-mishra/who-else-is-free/pull/142), [commit 73ea2c8](https://github.com/antash-mishra/who-else-is-free/commit/73ea2c8).                                                  |
| 3 October 2026, 2:34:36 PM            | Issue #166 opened.                                                                                                                                                                                                          | Issue metadata.                                                                                                                                                                                             |

The September change is the strongest code explanation for the sharp content visible in the screenshot. It removed native iOS blur, whereas Android already used a flat fallback on this surface. The screenshot's platform and installed build are not established. Commit/merge dates establish source changes, not when a particular release reached a phone; no device bisect or deployment-history verification has been performed.

## Cause before this fix

`src/navigation/AppNavigator.tsx` sets `tabBarBaseStyle.backgroundColor` to `transparent`. Its custom background contains a tint-only `FrostedSurface` at intensity 54 and the 60% overlay. `src/theme/materials.ts` gives the light tint approximately 9.7% opacity, leaving about 36% of underlying content visible after both layers are composed. Neither layer provides an opaque white backing.

Existing `AppNavigator.test.tsx` tab-background tests assert local constants rather than rendering production navigation, so they would not catch this regression. The shared `FrostedSurface` tests correctly verify translucency; that behavior remains appropriate for its other consumers.

## Implemented restoration

- Extracted the existing background into `src/navigation/TabBarBackground.tsx` without changing its geometry, overlay color, or border.
- Enabled the existing shared `FrostedSurface` real-blur path at intensity 54 beneath `rgba(251, 251, 251, 0.6)`, restoring the January frosted treatment. iOS uses native blur; Android uses the shared Android blur opt-in. Historical Android used a flat fallback, so this preserves the intended frosted appearance across platforms rather than restoring that platform discrepancy.
- Kept the transparent base, absolute placement, safe-area height/padding, icons, tab presses, and route behavior.
- Added rendering tests against the actual background on iOS and Android. Both failed before the behavior change because no `BlurView` was rendered; both must pass with the existing 60% overlay still covering the full background.
- Updated the navigation/background ownership references in `AGENTS.md`, `CLAUDE.md`, and the shared component catalog.

## Acceptance criteria

- The tab background uses real blur at intensity 54 and the historical 60% white overlay.
- Sharp content beneath the bar is softened during scrolling.
- Bar geometry, safe-area coverage, icons, and navigation behavior are preserved.
- Other frosted surfaces retain their current treatment.

## Validation

- Red: `npx jest src/navigation/__tests__/TabBarBackground.test.tsx --runInBand --silent` failed both cases because the production background did not render a blur.
- Green: targeted background, navigator, and shared frosted-surface tests passed (3 suites, 33 tests).
- `npm test -- --runInBand --silent`: passed (122 suites, 1,444 tests). The first full run exposed an unapplied existing navigation dependency patch in reused local dependencies (2 failures); an isolated copy of the stack package with the repository's patch applied passed both patch-contract tests and the complete rerun. Shared checkout dependencies were not modified.
- `npm run typecheck`: passed, including after applying the dependency patch.
- `npm run lint`: passed with 724 repository warnings and zero errors. Focused ESLint on the three touched TypeScript files passed without warnings.
- `npm run format:check`: failed on 218 files with existing formatting debt. Prettier check on all seven touched files passed after formatting the new test and this report.
- `git diff --check`: passed.
- Backend and device tests were not run; no backend changes were made.

Device rendering is still unverified. Before release, check Discover/My Events with dark cover images and text scrolling beneath the bar, Messages/Profile, tab switching, Event Details returns, and Create open/close on iOS and Android. Confirm home-indicator/Android navigation coverage and reachable final list content. Record device verdicts in `TEST_RUNS.md`.
