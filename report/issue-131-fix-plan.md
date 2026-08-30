# Issue #131 — Onboarding / Edit Profile Fix Plan

Source: https://github.com/antash-mishra/who-else-is-free/issues/131
Status: **Phase 1 (reproduction) complete — see Debug Findings below.**
Platform note from reporter: issues #1, #2, #4, #6 are **Android-only** (not visible on iOS); the Save-button width issue (#3b) affects **both** platforms.

## Bug Inventory And Root-Cause Hypotheses

| # | Issue | Location | Hypothesis |
|---|-------|----------|------------|
| 1 | No blur behind camera icon | `src/screens/OnboardingScreen.tsx:275` | `BlurView` exists but Android `expo-blur` without `experimentalBlurMethod` renders only a flat translucent tint |
| 2 | White polygon on camera icon | `OnboardingScreen.tsx:274`, styles 561–582 | `cameraBadgeShadow` wrapper has `elevation: 3` but no `overflow: 'hidden'`; Android draws elevation shadow on the un-clipped outline → rounded-rect artifact |
| 3a | Same badge bugs in Edit Profile | `src/screens/EditProfileScreen.tsx:141–165` | Badge is a duplicated copy of onboarding's (drift: hardcoded `#000`/`#9CA3AF`) |
| 3b | Save button should be full width | `EditProfileScreen.tsx:193–215, 296–318` | Local `ScalePressable` button instead of shared `AppButton` (`fullWidth`); both platforms |
| 4 | Caret at end, should be at "Your name" | `OnboardingScreen.tsx:96–122, 296–309` | Controlled `selection` prop (`nameSelection`) fights Android caret with `textAlign="center"` |
| 5 | Black crop button in picker | picker options at `OnboardingScreen.tsx:140–146` | OS-level Android crop UI from `expo-image-picker` `allowsEditing` — no app fix |
| 6 | Continue button misaligned / gradient cut off | `OnboardingScreen.tsx:313–322` | `AppButton` has no gradient; needs visual repro to pin down (likely background/clip issue) |
| 7 | Disabled button opacity looks off | `src/components/ui/AppButton.tsx:102–104` | **Skipped — owned by Sumit per issue** |

## Phase 1 — Reproduce (complete)

1. Environment: emulator `WEIF_API_36`, backend `DEV_LOGIN_ENABLED=1 go run .`, Metro with `10.0.2.2` env, launch `com.whoelseisfree.app/.MainActivity`.
2. Onboarding step 1 (pre-auth): screenshots of camera badge (#1, #2), focused name input caret (#4), Continue button (#6).
3. Dev-login → Edit Profile: badge bugs (#3a), Save button width (#3b).
4. Image picker: confirm crop button is OS-level (#5).

## Debug Findings (Phase 1 complete)

Reproduced on emulator `WEIF_API_36` (Android 16, dev build via Metro) on 2026-08-31.
Evidence: `report/` screenshots captured during the session (badge zoom, button area, Edit Profile).

1. **#1 + #2 (camera badge) — CONFIRMED on Android.** Zoomed capture of Onboarding step 1 badge shows:
   - A **white octagonal polygon** rendered inside/behind the badge circle. Cause: the `cameraBadgeShadow` wrapper (`elevation: 3`, no `overflow: 'hidden'`) lets the Android elevation outline + `BlurView` fallback layer draw an un-clipped rounded-rect/octagon behind the circular badge.
   - **No real blur** — Android `expo-blur` without `experimentalBlurMethod` renders only a flat translucent tint (left half over the avatar = tinted yellow, right half = flat white).
   - Same artifact visible on Edit Profile (duplicated badge markup).
2. **#4 (caret) — PARTIALLY CONFIRMED + found an ANR.** With the empty name field focused (keyboard shown, `mInputShown=true`), no caret renders anywhere in the row (4 frames across blink phases). Worse: **typing into the field triggered an ANR** ("who-else-is-free isn't responding") — the controlled `selection` prop (`nameSelection` state) round-trips through JS on every keystroke/focus on Android and can wedge the field. Fix must remove/repair the `selection` plumbing, not just reposition the caret.
3. **#3b (Save button width) — CONFIRMED on both platforms.** Edit Profile renders the Save action as a local `ScalePressable` disabled pill with side margins and a light-gray style; Onboarding's Continue is a full-width black `AppButton`. Replace with shared `AppButton` (keeps loading/disabled states, tokens instead of hardcoded `#E5E5E5`/`#9CA3AF`).
4. **#6 (Continue button overlapping system nav bar on some phones) — CONFIRMED AS PLAUSIBLE (reporter's screenshot explained).** Reporter hypothesis: on some phones the fixed Continue button overlaps the phone's bottom navigation bar. Verified the mechanics:
   - Expo SDK 54 → targetSdk 36 + `edgeToEdgeEnabled: true` → the app draws **behind** the system nav bar on Android 15+.
   - Onboarding's bottom CTA clearance is **100% safe-area dependent**: `paddingBottom: insets.bottom + 16` (`OnboardingScreen.tsx:314/380/460`). Edit Profile pins its Save button via `ScreenContainer` → `SafeAreaView edges=['top','bottom']` + `justifyContent: 'space-between'` — also 100% insets dependent. There is **no defensive minimum clearance** anywhere.
   - Emulator measurement (insets working): Edit Profile Save button bottom = y2274 = **exactly the nav-bar top** (126px / 48dp), zero buffer. Any device under-reporting `insets.bottom` (documented OEM bugs — several Samsung One UI builds report 0 bottom inset with 3-button nav; also `initialWindowMetrics` can serve empty frames on first cold launch, and Onboarding is the first screen after splash) drops the button behind a ~48dp nav bar → the button is cut/overlapped. Matches the reporter's "gradient cuts off" screenshot (bottom of the dark pill hidden behind the nav bar) and the "few phones" symptom.
   - Fix (new **Fix E**): defensive bottom clearance for fixed bottom CTAs — shared helper (extend `src/utils/bottomObstruction.ts`): `Math.max(insets.bottom, MIN_NAV_BAR_CLEARANCE)` (e.g. 24dp Android fallback) used by Onboarding's three `buttonSection`s; Edit Profile is covered by ScreenContainer but the same minimum should apply there (screen-level padding or container change). Verify on emulator with 3-button nav; can't repro a misreporting OEM locally, verify by geometry + code.
5. **#5 (black crop button) — OS-level.** The crop UI comes from `expo-image-picker` `allowsEditing` system UI. No app fix; will note on the issue.
6. **Tooling gap found during repro:** dev-login always sends `profile_complete: true`, so the Onboarding screen was unreachable via dev-login. Added a 4th preset (`dev-login-button-onboarding`, email `onboarding@who-else-is-free.test`) that signs in with an incomplete profile to land on Onboarding (`DevLoginButton.tsx`, `AuthContext.signInWithDevUser` now takes `{ profileComplete }`). Dev-only; keep.

### Phase 2 — Fixes (each: fix → verify on emulator)

- **Fix A (#1, #2):** restructure the badge so the elevation shadow layer is properly clipped (`overflow: 'hidden'` + matching circular radius), and enable real Android blur via `experimentalBlurMethod="dimezisBlurView"` on the `BlurView`. Verify no iOS regression (badge already correct on iOS).
- **Fix B (#4):** remove the controlled `selection`/`handleNameFocus` plumbing in `OnboardingScreen` (it both misplaces the Android caret and caused the ANR); keep plain `textAlign="center"` behavior; verify caret sits at the centered placeholder and typing is smooth.
- **Fix C (#3a):** extract a shared `AvatarEditBadge` (badge markup + styles) used by both `OnboardingScreen` and `EditProfileScreen`; apply Fix A once; replace Edit Profile's hardcoded `#000`/`#9CA3AF` with theme tokens.
- **Fix D (#3b):** replace Edit Profile's local Save button with shared `AppButton` (`fullWidth`), preserving the loading spinner and disabled behavior; verify width matches Onboarding on Android (iOS parity by design). Bonus finding: measured Save button is 912px wide vs Onboarding Continue 996px — double side padding (ScreenContainer 16dp screen padding + `buttonSection` 16dp) — the concrete "not full width" bug on both platforms.
- **Fix E (#6):** defensive bottom clearance for fixed bottom CTAs (see Debug Findings #4) — shared helper in `src/utils/bottomObstruction.ts` with a minimum Android nav-bar clearance; apply to Onboarding's three `buttonSection`s; keep Edit Profile consistent via ScreenContainer.

### Phase 3 — Documented, no code

- #5 crop button: OS-level, note on issue.
- #7 disabled opacity: skipped (Sumit).

## Phase 4 — Validation

- `npm run typecheck`, targeted Jest (`OnboardingScreen*`, `EditProfileScreen*`), lint touched files.
- Final emulator pass: onboarding flow + Edit Profile save flow (badge, caret, Save width).
- Update `TEST_RUNS.md` verdicts.
