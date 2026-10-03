# Camera badge correction — issue #167, item 2

The Android blur captured the foreground camera SVG and painted a blurred copy
under the sharp icon. This made the camera look muddy even though its color was
already the same as iOS. Earlier fixes enabled blur and corrected shadows but
left the capture scope wrong.

The badge now gives `FrostedSurface` an explicit Android backdrop. Existing Skia
renders the avatar plus the white/Edit Profile or radial/Onboarding page, blurs
that source, applies the calibrated tint, and then React Native draws the sharp
camera separately. The shadow remains outside the source. iOS retains the exact
native intensity-15 material, glyph, size, position and shadow. No dependency or
native SDK upgrade is required.

The 120dp avatar and 40dp badge share the existing seed palette, image URI decoder
and cover crop. Android data URLs require explicit Skia base64 decoding; URI
loading alone produced a blank source in native testing. The decoder retains one
loaded image while mounted, ignores stale asynchronous loads and handles failures
without drawing an old photo or logging image data. It does not capture the screen
or decode images on animation frames. Geometry changes need matching source and
fixture updates; do not move/resize the badge independently.

## Native evidence

All PNGs are original, unedited captures with synthetic profile data. Both native
clients use Expo 54, RN 0.81.5, expo-blur 15.0.7 and existing Skia 2.2.12. Android
uses the rebuilt first-fix debug APK; iOS reuses an existing simulator development
client with matching native dependencies. This change is JavaScript-only.

- iOS: isolated iPhone 15 Pro, iOS 17.4, 393x852dp / 1179x2556px.
- Android: isolated `WEIF_ISSUE_167`, API 36, 393x852dp / 1179x2556px,
  density 480, host GPU, three-button navigation.
- The reference fixture uses the actual shared badge with seed 5 and name Tester.
- Actual Onboarding/Edit Profile screenshots use the production screen components.
  Android exercised native photo selection/crop, onboarding completion against a
  disposable local backend, and removal on Edit Profile. iOS exercised removal
  on Edit Profile, then Onboarding's gradient case. Both photo screenshots load
  the same synthetic PNG artwork after Android's JPEG crop from the local backend.
- The reused iOS client's SecureStore write stalled during synthetic sign-in.
  Its screen captures therefore inject the synthetic profile through a temporary
  exported AuthContext; this was restored afterward. These verify rendering and
  removal, not iOS authentication or profile persistence. No auth bypass is shipped.
- `reference-fixture.tsx.txt` and the screen fixture sources preserve reproduction
  recipes; they are not registered in production. The iOS fixture needs a temporary
  AuthContext export and the disposable local backend. Restore exports and index
  immediately after testing. Do not use a real account or production backend.

## Measured consistency

`compare.py` only reads original PNGs. It normalizes badge origins, samples 3,596
interior pixels, and excludes the camera bounding rectangle and external shadow.
Differences are per RGB channel on the 0–255 scale.

| Comparison                                   | Mean absolute difference | 95th percentile | Maximum |
| -------------------------------------------- | -----------------------: | --------------: | ------: |
| Gradient reference, Android vs unchanged iOS |                    0.480 |               2 |       5 |
| Actual Onboarding gradient                   |                    0.680 |               2 |       5 |
| Actual Edit Profile photo                    |                    1.437 |               4 |      10 |

The cold-start Android control also passes at 720x1600px/280dpi (1.75x): compare
explicit-source camera against foreground-only reference, no shadow. Outside the
expanded glyph mask, all 3,741 pixels have zero extra darkening (old native blur:
598 pixels >10/255). `android-halo-fixed.png` and `halo-fixture.tsx.txt` preserve
this test. Live emulator density changes retain Skia's cached PixelRatio until a
cold JS process; the intermediate live-resize capture was discarded. This is not
an excuse to skip cold runs at different densities.

The iOS reference badge before/after is pixel-identical: zero changed RGB channels
in its 120x120px region. Both foreground cameras use exactly `#707070`, 20dp, inside a 40dp circular badge.
The lens remains transparent; the camera-shaped blur halo is removed. These
results demonstrate closely matched material on the tested simulators. They do
not establish exact whole-screen pixel equality: system bars, safe areas, font
metrics, antialiasing, and native shadows differ. Do not loosen measurements to
claim universal parity or change iOS to match Android.

The calibrated Android material separates sigma 4.5dp, white tint alpha 0.62 and
saturation 1.1. The values were fitted to the frozen iOS reference; the old Android
native radius 7.5 was not a portable specification.

## Coverage and release limits

Regression testing first failed because Android still rendered native BlurView;
iOS's existing material test passed. Final tests cover explicit source/foreground
separation, iOS preservation, base64 decoding, stale image loads, removal and
failure. TypeScript and the full Jest suite pass (123 suites / 1,449 tests).
Repository lint passes with 724 warnings (existing warning debt); changed files pass format
checks and `git diff --check`. No backend production code changed.

The caller audit found two remaining native `blur` users: Create/Edit cover chip
and Cover Picker check badge. Their Android capture is a migration risk; this
change does not claim to repair unmeasured symptoms there. Tint-only callers and
EventCard's mask/crash restriction remain intact. The shared guide, AGENTS and
CLAUDE now distinguish native capture from explicitly composed sources.

Physical iOS/Android (including the reporter's phone), older Android, accessibility
settings, release APK/IPA and physical-device performance are not verified here.
Keep the PR in draft until those release checks pass. The implementation uses the
existing Skia dependency rather than Android's RenderEffect/RenderScript branch,
but that architectural choice is not a substitute for older-device testing.

Validation commands run from the repository root:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --ext .ts,.tsx,.js,.jsx
node node_modules/jest/bin/jest.js --runInBand --silent
node node_modules/jest/bin/jest.js src/components/__tests__/AvatarEditBadge.test.tsx --runInBand --silent
node node_modules/prettier/bin/prettier.cjs --check .
git diff --check
```

Full formatting reports 218 pre-existing files; changed production files and new
reports pass their focused formatting checks. No Python backend or Go changes
were made, so no backend test suite was required for this rendering correction.
