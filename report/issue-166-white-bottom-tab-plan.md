# Issue #166: white bottom tab bar — history and fix plan

Source: [Bottom tab #166](https://github.com/antash-mishra/who-else-is-free/issues/166).
Status: investigation and planning complete; implementation pending.
Branch: `codex/issue-166-white-bottom-tab`, based on `origin/master` at `1ea1a89404fe286bccca7707cec324d16373b1aa`.
Investigated: 3 October 2026. All times below are IST.

## When it happened

Full Git history was fetched before drawing conclusions; the original local checkout was shallow.
The issue screenshot shows sharp event text and cover imagery through the bar, rather than only a tinted white surface.

| When | Change | Evidence |
| --- | --- | --- |
| Before 12 December 2025 | The tab bar base used `colors.background`, defined as opaque `#FFFFFF`. | Parent of `5e30bd7`, `src/navigation/AppNavigator.tsx` and `src/theme/colors.ts`. |
| 12 December 2025, 9:36:54 PM | Replaced the opaque background with `transparent`, made the bar absolute, and added blur plus a white gradient with 88–92% opacity. This is the first change away from solid white. | [Commit 5e30bd7](https://github.com/antash-mishra/who-else-is-free/commit/5e30bd7). |
| 16 December 2025, 8:51:10 PM | Changed the gradient's bottom color to `#FBFBFB99` (60% opacity). | [Commit 1d0ebc7](https://github.com/antash-mishra/who-else-is-free/commit/1d0ebc7). |
| 13 January 2026, 10:02:09 PM | Added a 94% white overlay, making the bar appear almost white while remaining translucent. | [Commit 30129c4](https://github.com/antash-mishra/who-else-is-free/commit/30129c4). |
| 23 January 2026, 1:57:48 AM | White overlay reduced from **94% to 60% opacity** (`rgba(255, 255, 255, 0.94)` to `rgba(251, 251, 251, 0.6)`), and the inset gradient was removed. This is the explicit reduction from nearly white to visibly translucent. | [PR #1](https://github.com/antash-mishra/who-else-is-free/pull/1), [commit 07232c2](https://github.com/antash-mishra/who-else-is-free/commit/07232c2). GitHub displays its merge date in UTC as 22 January. |
| 8 June 2026, 4:40:58 AM | Moved the same 60% overlay into `colors.tabBarFrostedOverlay`; no opacity change. | [Commit 7534ac6](https://github.com/antash-mishra/who-else-is-free/commit/7534ac6). |
| 10 September 2026, 8:31:44 PM (merge) | Replaced `BlurView` with `FrostedSurface` without `blur`. The default path paints a flat tint, so underlying text/images stay sharp. | [PR #142](https://github.com/antash-mishra/who-else-is-free/pull/142), [commit 73ea2c8](https://github.com/antash-mishra/who-else-is-free/commit/73ea2c8). |
| 3 October 2026, 2:34:36 PM | Issue #166 opened. | Issue metadata. |

The September change is the strongest code explanation for the sharp content visible in the screenshot. It removed native iOS blur, whereas Android already used a flat fallback on this surface. The screenshot's platform and installed build are not established. Commit/merge dates establish source changes, not when a particular release reached a phone; no device bisect or deployment-history verification has been performed.

## Current cause

`src/navigation/AppNavigator.tsx` sets `tabBarBaseStyle.backgroundColor` to `transparent`. Its custom background contains a tint-only `FrostedSurface` at intensity 54 and the 60% overlay. `src/theme/materials.ts` gives the light tint approximately 9.7% opacity, leaving about 36% of underlying content visible after both layers are composed. Neither layer provides an opaque white backing.

Existing `AppNavigator.test.tsx` tab-background tests assert local constants rather than rendering production navigation, so they would not catch this regression. The shared `FrostedSurface` tests correctly verify translucency; that behavior remains appropriate for its other consumers.

## Fix plan

1. Add a focused rendering regression test that exercises the production Main tab configuration and its effective background. Assert opaque white coverage with bottom safe-area insets of zero and a representative nonzero value. Prove it fails against the current translucent configuration. Avoid another test that merely asserts a locally defined options object.
2. Set the actual bar background to the existing opaque `colors.background` token. Remove its redundant custom frosted background, overlay, and border machinery, retaining scene styles and all bar geometry, insets, icons, badge state, tab presses, haptics, and navigation behavior. Do not restore opacity to 94%: the requested contract is fully white.
3. Remove `tabBarFrostedOverlay` if a repository search confirms it has no remaining consumers. Leave shared material calculations and other frosted surfaces unchanged.
4. Update `AGENTS.md`, `CLAUDE.md`, the shared component/style catalog, and the `FrostedSurface` ownership comment to stop listing the tab bar as a frosted consumer and document its opaque white treatment.
5. Re-run the focused tests, then the full frontend checks. Review the complete diff for accidental layout/navigation changes.
6. Verify on iOS and Android using synthetic event content: scroll dark cover images and text beneath the bar on Discover and My Events, check Messages and Profile, switch tabs, return from Event Details, and open/close Create. Confirm white coverage through the bottom safe area, readable icons/badges, and reachable final list content. Check Android gesture and three-button navigation and iOS home-indicator coverage. Record actual device verdicts in `TEST_RUNS.md`.

## Acceptance criteria

- The full tab bar, including the bottom safe area, is opaque white on iOS and Android.
- No underlying text, images, or gradients show through during scrolling or route transitions.
- Existing bar height, padding, absolute positioning, touch targets, and navigation behavior are preserved.
- Other frosted surfaces retain their current treatment.
- Regression tests exercise production rendering/configuration and fail before the fix.

## Verification

For this documentation-only investigation: inspect the complete added document, run `git diff --check`, and verify branch/base and status. No production code or tests are changed. Frontend checks and device testing are deferred to implementation.

Implementation commands (this Expo repository uses npm):

```sh
npx jest src/navigation/__tests__/AppNavigator.test.tsx --runInBand --silent
npm test -- --runInBand --silent
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Report existing formatting/lint debt separately; do not reformat unrelated files. Backend tests are unnecessary unless backend scope changes.
