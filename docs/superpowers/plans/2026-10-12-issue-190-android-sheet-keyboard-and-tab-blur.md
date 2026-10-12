# Issue #190: Android Sheet Keyboard Lift and Tab Bar Blur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Android, text-entry bottom sheets (Create Event "Details", the report and invite prompts) rise together with the keyboard instead of jumping ahead of it. The bottom tab bar visibly frosts the list scrolling under it the way iOS does. Both fixes are proven with before/after captures posted to issue #190.

**Architecture:** Two independent, JS-only fixes.

1. `BottomSheet` follows the keyboard frame by frame on Android through react-native-keyboard-controller's `useGenericKeyboardHandler`. That hook already receives the IME animation from inside React Native `Modal` windows. It replaces React Native's single, zero-duration `keyboardDidShow`.
2. `FrostedSurface` gains an Android-only `androidMaterial` (tint intensity plus a density-aware blur sigma), and `TabBarBackground` passes a calibrated `tabBarAndroidMaterial`. A single expo-blur `intensity` cannot reproduce the iOS material on Android.

iOS behaviour does not change.

**Tech Stack:** React Native 0.81 (Fabric), Expo SDK 54, expo-blur 15.0.7 (Dimezis BlurView 2.0.6 on Android), react-native-keyboard-controller 1.18.5, Reanimated 4.1 (mocked in Jest), Jest 29 with React Native Testing Library. Evidence uses adb, ffmpeg and python3.

**Spec:** GitHub issue #190, "Minor improvement in android" (`gh issue view 190`), Android only ("in iOS no problem"):

- (a) "Create event, details sheet, it slides up abruptly, can see the gap. Think it is same in report sheet as well."
- (b) "in bottom tab there is No blur behind (when events are long list)."
- The repo owner's note on (b): "There used to be a blur but now it's not there."

The investigation below is the evidence base.

## Investigation (2026-10-12)

Reproduced on current master `e6f74ba`:

- **Android:** the `WEIF_API_36` emulator (720×1600 override, density 1.75, API 36).
- **iOS reference:** the `WEIF_ISSUE_167_IOS` simulator.

Before captures are already saved, untracked, in `report/screenshots/issue-190/`; Task 0 commits them.

### (a) Sheet "slides up abruptly, can see the gap"

- **Where:** `src/components/sheets/BottomSheet.tsx:143` lifts Android sheets on React Native's `keyboardDidShow`.
- **Why it jumps:** React Native emits that event once, with `duration: 0` (`ReactRootView.java:1059`), as soon as the IME is reported visible. So `withTiming(lift, { duration: event.duration ?? 220 })` jumps in a single frame, before the keyboard has moved.
- **Open path:** `android-before-details-sheet-strip.png` and `android-before-details-sheet.gif` show frames at 1.53 s, 1.58 s, 1.86 s, 1.91 s and the final frame:
  - At 1.58 s the Details sheet snaps up by the full keyboard height.
  - For about 300 ms the Create form ("Date & time", "Location", "Create") shows through underneath (`android-before-details-sheet-gap.png`).
  - The keyboard only arrives at 1.91 s.
- **Close path:** it mirrors the open path (`android-before-details-sheet-hide-gap.jpg`). The keyboard is gone while the sheet is still lifted.
- **Report and invite prompts:** these are the same `BottomSheet`, because `EventActionOverlay` sets `avoidKeyboard` for `invite` and `report`. They share the bug.
- **Not a regression:** Android has lifted on `keyboardDidShow` with `duration ?? 220` since b9c0211 (June 2026).

### (b) Tab bar "No blur behind"

- **History:** 567638b (3 Oct, issue #166) moved the Android bar to `FrostedSurface blur`, which means expo-blur `dimezisBlurView` at `intensity` 54 with `blurReductionFactor` 2. Its report (`report/issue-166-white-bottom-tab-plan.md`) says device rendering was never verified.
- **Two expo-blur Android behaviours bury the list:**
  1. **Tint:** the LIGHT tint is rgb(249, 249, 249) at 0.78 × 54 / 100 = 42% under our 60% overlay, so only 23% of the backdrop survives. The iOS material is about 10%, which leaves 36%.
  2. **Radius:** Dimezis blurs a capture downsampled 6× (`BlurController.DEFAULT_SCALE_FACTOR = 6.0f`, read from the AAR). The radius of 54 / 2 = 27 is therefore a Gaussian sigma of about 97 px on screen, wider than a card cover. The cover averages into the white page around it.
- **Measurements:** taken with `measure_bar.py` from the Evidence Toolkit on the seeded Discover list. Android columns: cover 104–160, page 545–610. iOS columns: cover 170–280, page 900–1000.

  | Capture | Bar over cover (RGB) | Bar over page | Contrast passed | Texture kept | Tint spread | Edge contrast | Edge sigma* |
  |---|---|---|---|---|---|---|---|
  | iOS, card 5 cover under the bar | (218, 237, 237) | 252.7 | 23.4% | 0.17 | 18.7 | 24.4 | ~49 pt |
  | Android, card 6 cover under the bar | (244, 245, 244) | 251.0 | 3.4% | 0.05 | 1.1 | 7.3 | ~66 dp |
  | Android spike, intensity 13 and 19.5 dp sigma, same scroll | (230, 234, 231) | 251.0 | 9.9% | 0.27 | 4.3 | 23.5 | ~27 dp |

  \*The edge sigma depends on the column range and on how each platform's blur falls off. Compare it only like with like: the same platform, the same columns.

  The reporter's own screenshot shows the same thing: the bar reads (234, 239, 237) over the badminton cover against 250 over the page.
- **"Used to be a blur":** before 3 Oct, Android drew a translucent tint, so content showed through faintly but sharp. The 3 Oct blur made the bar practically opaque.

### Spikes (reverted; the working tree is clean)

- **Tab bar.** Android `intensity` 13 (a 10% tint), with the radius solved for a 19.5 dp sigma at the screen density. The cover's glow became visible under the Discover icon (last row of the table).
- **Sheet: resting position.** keyboard-controller frames inside the sheet's Modal reported 332 dp at rest, where React Native's lift was 284 dp with a 48 dp safe-area bottom. So in a Modal window the reported height includes the navigation bar. `getKeyboardTranslation({ keyboardHeight: 332, safeAreaBottom: 48 }) = 284` put the Done button exactly where it rests today, 40 px above the keyboard (Done bottom at row 976, keyboard top at row 1016). It never exposed the screen while rising.
- **Sheet: emulator timing.** SwiftShader stalls sometimes deliver frames in a burst. The sheet then lags the keyboard (the keyboard briefly overlaps it) but never leads it. Judge smoothness on a physical phone.
- **Soft input mode.** The spike called `useKeyboardHandler`, which runs `useResizeMode()`: it switches the activity window to `ADJUST_RESIZE` while mounted, then calls `setDefaultMode()` on unmount. After the spike the activity was left at `sim={adjust=nothing}`; a cold start is `sim={adjust=pan}`. That would break the app's `adjustPan` and chat's `ADJUST_NOTHING`. This plan therefore uses `useGenericKeyboardHandler`, which registers the same handlers and never touches the input mode.

## Global Constraints

- iOS behaviour is unchanged. iOS sheets keep React Native `keyboardWillShow`/`keyboardWillHide`, and the iOS tab bar keeps `intensity` 54.
- JS-only. No native rebuild is needed; the change reaches runtime 1.0.2 installs through EAS Update (`runtimeVersion.policy: 'appVersion'`).
- Shared components never call `useKeyboardHandler`, `useKeyboardAnimation` or `useReanimatedKeyboardAnimation`, because they set the Android soft input mode. Use `useGenericKeyboardHandler`.
- `FrostedSurface` stays the only blur entry point. Surfaces without `androidMaterial` keep `blurReductionFactor` 2 and their own `intensity`.
- The tab bar's geometry, `colors.tabBarFrostedOverlay` (`rgba(251, 251, 251, 0.6)`) and its 1 px top border are unchanged.
- Keyboard math stays in `src/utils/bottomObstruction.ts`. Add no per-screen or per-sheet keyboard offsets.
- No `console.*` in app code, no new ESLint warnings in touched files, and Prettier runs on touched files only.
- While the emulator is in use, run Jest suites one at a time. Parallel runs previously got `system_server` killed.
- Evidence goes in three places: PNG/GIF files in `report/screenshots/issue-190/`, an entry in `TEST_RUNS.md`, and a before/after comment on issue #190 with images pinned to the evidence commit.
- Pushing, opening a PR, commenting on the issue and publishing an EAS Update are all outward-facing. Ask the user before each one.

## Review Focus

1. **Soft input mode.** Mounting a `BottomSheet` must not change the activity's soft input mode (`adjustPan` app-wide, `ADJUST_NOTHING` in the chat thread). That includes the prepared Android date picker, which stays mounted on Create Event. Pinned by the Task 1 test "never changes the Android soft input mode"; checked on device in Task 3 Step 6.
2. **The keyboard moves while the sheet enters.** For example, the Event name keyboard is still sliding out when Details opens, or the report input is tapped mid-entry. Frames during entry are ignored, and the settled sheet catches up. Pinned by the Task 1 test "ignores keyboard frames during entry and catches up once settled".
3. **The keyboard changes height while the sheet is open** (emoji panel, IME switch, suggestion strip). The sheet follows. Pinned by the Task 1 test "follows a keyboard that changes height while open".
4. **The keyboard is dismissed under an open sheet** (system Back). The sheet descends with it and comes to rest. Pinned by the Task 1 test "returns to rest when the keyboard is dismissed under an open sheet".
5. **Navigation inset of 0 dp (an OEM under-report), 24 dp (gesture) or 48 dp (three-button).** The lift removes exactly the inset the sheet already pads. Pinned by the Task 1 `bottomObstruction` table test.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/utils/bottomObstruction.ts` | modify | `getKeyboardTranslation` becomes a worklet so UI-thread keyboard frames can use it |
| `src/components/sheets/BottomSheet.tsx` | modify | Android keyboard tracking via `useGenericKeyboardHandler`; iOS listener path unchanged |
| `src/theme/materials.ts` | modify | `AndroidBlurMaterial`, `tabBarAndroidMaterial`, `androidBlurReductionFactor` |
| `src/components/ui/FrostedSurface.tsx` | modify | optional `androidMaterial`, applied to the Android blur only |
| `src/navigation/TabBarBackground.tsx` | modify | passes `tabBarAndroidMaterial` |
| `src/components/__tests__/BottomSheet.test.tsx`, `src/utils/__tests__/bottomObstruction.test.ts` | modify | Task 1 tests |
| `src/theme/__tests__/materials.test.ts` | create | Task 2 math tests |
| `src/components/ui/__tests__/FrostedSurface.test.tsx`, `src/navigation/__tests__/TabBarBackground.test.tsx` | modify | Task 2 tests |
| `CLAUDE.md`, `AGENTS.md`, `report/shared-components-refactor-guide.md`, `TEST_RUNS.md` | modify | conventions and verdicts |
| `report/screenshots/issue-190/*` | create | before/after evidence |

The two fixes are independent: Task 1 and Task 2 can be reviewed, reverted or shipped separately.

## Evidence Toolkit (scratch; never committed)

Run `export EV=$(mktemp -d)/issue190 && mkdir -p "$EV/tools"` once per shell, then save these files.

**`$EV/tools/measure_bar.py`**: tab bar metrics. Run it as `python3 -I "$EV/tools/measure_bar.py" SHOT COVER_X0 COVER_X1 PAGE_X0 PAGE_X1 DENSITY`. Column defaults: Android `104 160 545 610 1.75`, iOS simulator `170 280 900 1000 3`. Use the cover columns only while a cover spans the bar's whole tab row.

```python
#!/usr/bin/env python3
"""Tab-bar metrics for issue #190.

usage: measure_bar.py SHOT.png COVER_X0 COVER_X1 PAGE_X0 PAGE_X1 DENSITY
  COVER_X0..X1  icon-free columns over a cover that runs under the bar
  PAGE_X0..X1   icon-free columns over plain page
  DENSITY       screen pixel ratio (WEIF_API_36: 1.75, iPhone simulator: 3)
"""
import statistics
import subprocess
import sys

shot = sys.argv[1]
cx0, cx1, px0, px1 = map(int, sys.argv[2:6])
density = float(sys.argv[6])
size = subprocess.run(
    ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
     '-of', 'csv=p=0', shot], capture_output=True, text=True, check=True).stdout.strip()
W, H = map(int, size.split(','))
data = subprocess.run(
    ['ffmpeg', '-loglevel', 'error', '-i', shot, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    capture_output=True, check=True).stdout


def px(x, y):
    i = (y * W + x) * 3
    return data[i], data[i + 1], data[i + 2]


def lum(p):
    return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]


def region(x0, x1, y0, y1):
    pixels = [px(x, y) for y in range(y0, y1) for x in range(x0, x1)]
    mean = tuple(round(sum(p[i] for p in pixels) / len(pixels), 1) for i in range(3))
    lums = [lum(p) for p in pixels]
    return mean, statistics.mean(lums), statistics.pstdev(lums)


# Bar top: first non-white row near the bottom of a plain-page column.
col = (px0 + px1) // 2
top = next(y for y in range(int(H * 0.8), H) if px(col, y) != (255, 255, 255))
band = int(48 * density)  # the 50dp tab row, above the system inset
above = region(cx0, cx1, top - int(20 * density), top - 4)
over_cover = region(cx0, cx1, top + 6, top + band)
over_page = region(px0, px1, top + 6, top + band)
passed = (over_page[1] - over_cover[1]) / max(1e-6, 255 - above[1])
texture = over_cover[2] / max(1e-6, above[2])
spread = max(over_cover[0]) - min(over_cover[0])

# Edge spread across the cover's right edge, in the band above the tab icons.
rows = range(top + 4, top + 4 + int(6 * density))
cols = list(range(cx0, px0, 2))
prof = [sum(lum(px(x, y)) for y in rows) / len(rows) for x in cols]
lo, hi = min(prof), max(prof)


def cross(fraction):
    target = lo + fraction * (hi - lo)
    return next(x for x, v in zip(cols, prof) if v >= target)


sigma_dp = (cross(0.9) - cross(0.1)) / 2.563 / density
print(f'bar top row {top}')
print(f'cover above bar   rgb {above[0]}  lum {above[1]:.1f}  sd {above[2]:.1f}')
print(f'bar over cover    rgb {over_cover[0]}  lum {over_cover[1]:.1f}  sd {over_cover[2]:.1f}')
print(f'bar over page     rgb {over_page[0]}  lum {over_page[1]:.1f}')
print(f'contrast passed {passed:.1%}  texture kept {texture:.2f}  tint spread {spread:.1f}')
print(f'edge contrast {hi - lo:.1f}  blur sigma ~{sigma_dp:.1f} dp')
```

**`$EV/tools/sheet_gap.py`**: where the Done button rests relative to the keyboard, measured on a settled frame. Usage: `sheet_gap.py FRAME.png`. On 2026-10-12, master printed `done_bottom=976 keyboard_top=1016 gap_px=40` on WEIF_API_36.

```python
#!/usr/bin/env python3
import subprocess
import sys

shot = sys.argv[1]
size = subprocess.run(
    ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
     '-of', 'csv=p=0', shot], capture_output=True, text=True, check=True).stdout.strip()
W, H = map(int, size.split(','))
data = subprocess.run(
    ['ffmpeg', '-loglevel', 'error', '-i', shot, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    capture_output=True, check=True).stdout


def px(x, y):
    i = (y * W + x) * 3
    return data[i], data[i + 1], data[i + 2]


# Done is the black pill crossing the centre column; the keyboard is the first
# non-white row below it at the left edge.
black = [y for y in range(H) if sum(px(W // 2, y)) < 60]
done_bottom = max(black)
keyboard_top = next(y for y in range(done_bottom + 1, H) if px(6, y)[0] < 250)
print(f'done_bottom={done_bottom} keyboard_top={keyboard_top} gap_px={keyboard_top - done_bottom}')
```

**`$EV/tools/record.sh`**: records 10 s and taps at 1.5 s, using coordinates in the emulator's 720×1600 space taken from `mobile_list_elements_on_screen`. Usage: `record.sh NAME X Y`. It writes `$EV/NAME/{NAME.mp4,frames/,timestamps.txt,contact.png}`.

```bash
#!/bin/bash
set -euo pipefail
NAME=$1; X=$2; Y=$3; OUT=${EV:?}/$NAME
mkdir -p "$OUT/frames"
adb -s emulator-5554 shell "rm -f /sdcard/$NAME.mp4; screenrecord --time-limit 10 --bit-rate 8000000 /sdcard/$NAME.mp4 & sleep 1.5; input tap $X $Y; wait"
adb -s emulator-5554 pull "/sdcard/$NAME.mp4" "$OUT/$NAME.mp4" >/dev/null
ffmpeg -loglevel error -y -i "$OUT/$NAME.mp4" -vsync 0 "$OUT/frames/f_%03d.png" 2>/dev/null
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 "$OUT/$NAME.mp4" | nl -v1 > "$OUT/timestamps.txt"
N=$(ls "$OUT/frames" | wc -l | tr -d ' ')
ffmpeg -loglevel error -y -i "$OUT/frames/f_%03d.png" -vf "scale=180:-1,tile=10x$(( (N + 9) / 10 )):padding=2" -frames:v 1 "$OUT/contact.png"
echo "$N frames: $OUT/contact.png, $OUT/timestamps.txt"
```

**`$EV/tools/strip.sh`**: puts the chosen frames side by side. Usage: `strip.sh NAME DEST.png 023 024 029 030 055`.

```bash
#!/bin/bash
set -euo pipefail
NAME=$1; DEST=$2; shift 2
ARGS=(); FILTER=''; i=0
for f in "$@"; do
  ARGS+=(-i "${EV:?}/$NAME/frames/f_$f.png")
  FILTER+="[$i:v]scale=300:-1[v$i];"
  i=$((i + 1))
done
for j in $(seq 0 $((i - 1))); do FILTER+="[v$j]"; done
ffmpeg -loglevel error -y "${ARGS[@]}" -filter_complex "${FILTER}hstack=inputs=$i" "$DEST"
```

**GIF** (START and DUR in seconds, read from `timestamps.txt`):

```bash
ffmpeg -loglevel error -y -ss START -t DUR -i "$EV/NAME/NAME.mp4" -vf "fps=12,scale=270:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" DEST.gif
```

**Soft input mode of the app window:**

```bash
adb -s emulator-5554 shell dumpsys window windows | awk '/Window #[0-9]+ Window\{.*com\.whoelseisfree\.app\/com\.whoelseisfree\.app\.MainActivity\}/{f=1} f && /mAttrs=/{match($0, /sim=\{[^}]*\}/); print substr($0, RSTART, RLENGTH); exit}'
```

---

### Task 0: Branch, local stack and remaining before evidence

**Files:**
- Commit (already captured 2026-10-12, untracked): `report/screenshots/issue-190/android-before-details-sheet-strip.png`, `android-before-details-sheet.gif`, `android-before-details-sheet-gap.png`, `android-before-details-sheet-hide-gap.jpg`, `android-before-tabbar.png`, `ios-before-tabbar.png`, `android-vs-ios-before-tabbar-crop.png`
- Create: `report/screenshots/issue-190/android-before-report-sheet-strip.png`

- [ ] **Step 1: Branch**

```bash
git switch master && git pull --ff-only
git switch -c fix/issue-190-android-sheet-keyboard-and-tab-blur
git status --short
```

Expected: only `?? report/screenshots/issue-190/` and `?? docs/superpowers/plans/2026-10-12-issue-190-android-sheet-keyboard-and-tab-blur.md`.

- [ ] **Step 2: Local stack with Dev Login**

The local server on `:8080` already runs with `DEV_LOGIN_ENABLED=1`. Check with `ps eww -p $(lsof -nP -iTCP:8080 -sTCP:LISTEN -t) | tr ' ' '\n' | grep DEV_LOGIN`. If it does not, run `cd server && DEV_LOGIN_ENABLED=1 go run .`. Start a second Metro in the background; it serves both the emulator and the simulator through `localhost`. Leave the user's own Metro on 8081 alone:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080 EXPO_PUBLIC_WS_BASE_URL=ws://localhost:8080 \
EXPO_PUBLIC_CHAT_ENABLED=true EXPO_PUBLIC_DEV_LOGIN_ENABLED=true \
npx expo start --dev-client --localhost --port 8082
```

Open both apps. `-p` avoids the chooser that the `com.whoelseisfree.app.toastqa` build triggers:

```bash
adb -s emulator-5554 reverse tcp:8082 tcp:8082 && adb -s emulator-5554 reverse tcp:8080 tcp:8080
adb -s emulator-5554 shell am start -p com.whoelseisfree.app -a android.intent.action.VIEW \
  -d "exp+who-else-is-free://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
xcrun simctl openurl 904895B3-F262-4B33-BDAB-5F5DEDC26312 \
  "exp+who-else-is-free://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
```

Expected: both reach Discover in roughly 70 s on Android and a few seconds on iOS.

- [ ] **Step 3: Seeded list present**

Run `curl -s http://localhost:8080/api/events | grep -o '#190 tab bar test [0-9]' | sort -u | wc -l`. Expected: `8`. These are the plans seeded on 2026-10-12 by `issue190-seed@example.test` at 12.9716, 77.5946, the AVD's fused location. If the count is not 8:

1. Read the AVD location with `adb -s emulator-5554 shell dumpsys location | grep -m1 'last location'`.
2. Run the script below with that latitude and longitude.
3. Point the simulator at the same place: `xcrun simctl location 904895B3-F262-4B33-BDAB-5F5DEDC26312 set LAT,LNG` and `xcrun simctl privacy 904895B3-F262-4B33-BDAB-5F5DEDC26312 grant location com.whoelseisfree.app`.
4. Grant Android location: `adb -s emulator-5554 shell pm grant com.whoelseisfree.app android.permission.ACCESS_FINE_LOCATION` and the same for `ACCESS_COARSE_LOCATION`. It was granted on 2026-10-12.

```bash
#!/bin/bash
# usage: seed190.sh LAT LNG
set -euo pipefail
API=http://localhost:8080/api
TOKEN=$(curl -s -X POST "$API/dev-login" -H 'Content-Type: application/json' \
  -d '{"email":"issue190-seed@example.test","name":"Issue190 Seed","profile_complete":true}' |
  python3 -I -c 'import sys, json; print(json.load(sys.stdin)["token"])')
COVERS=(sports-badminton-1 sports-climbing-1 sports-cycling-1 sports-football-1 sports-surfing-1 sports-swimming-1 sports-tennis-1 sports-martial-arts-1)
for i in $(seq 0 7); do
  DAY=$(date -u -v+$((i + 1))d +%Y-%m-%d)
  curl -s -o /dev/null -w "event $((i + 1)) -> %{http_code}\n" -X POST "$API/events" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"title\":\"#190 tab bar test $((i + 1))\",\"location\":\"Charleston Park\",\"time\":\"6:30 PM\",\"event_date\":\"$DAY\",\"description\":\"Seeded for issue 190 evidence\",\"gender\":\"Any\",\"min_age\":18,\"max_age\":60,\"group_type\":\"Group\",\"cover_key\":\"${COVERS[$i]}\",\"scheduled_at\":\"${DAY}T01:30:00Z\",\"latitude\":$1,\"longitude\":$2}"
done
```

- [ ] **Step 4: Report sheet BEFORE** (master code is still in the tree)

1. On Android, open Profile and tap Get started, then "Dev Login (tester)" (testID `dev-login-button`).
2. Open Discover, then "#190 tab bar test 1", then Event Details' More actions button, then "Report plan".
3. `mobile_list_elements_on_screen` gives the input labelled "Tell us why you're reporting this plan". Run `record.sh report_before X Y` with its centre.
4. Read `contact.png` and `timestamps.txt`. Pick five frames: the sheet at rest, the first frame after it jumps (Event Details visible below it), one before the keyboard arrives, the keyboard arriving, and the final frame.
5. Run `strip.sh report_before report/screenshots/issue-190/android-before-report-sheet-strip.png <five frames>`.

Expected: the same exposed gap as the Details sheet.

- [ ] **Step 5: Commit the plan and the before evidence**

```bash
git add docs/superpowers/plans/2026-10-12-issue-190-android-sheet-keyboard-and-tab-blur.md report/screenshots/issue-190
git commit -m "docs: plan and before evidence for issue #190" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: BottomSheet follows the Android keyboard frame by frame

**Files:**
- Modify: `src/utils/bottomObstruction.ts` (`getKeyboardTranslation`, lines 20-35)
- Modify: `src/utils/__tests__/bottomObstruction.test.ts`
- Modify: `src/components/sheets/BottomSheet.tsx` (imports lines 4-26, state line 100, keyboard effect lines 134-174, open/close animations lines 176-239)
- Modify: `src/components/__tests__/BottomSheet.test.tsx`

**Interfaces:**
- Consumes: `useGenericKeyboardHandler(handler: KeyboardHandler, deps?: DependencyList)` from `react-native-keyboard-controller` 1.18.5.
  - Handler events have the shape `{ height: number; progress: number; duration: number; target: number }`, in dp. Inside a Modal window the height includes the navigation bar.
  - The hook is already mocked as `jest.fn()` in `jest.setup.ts`; no mock change is needed.
  - Do not use `useKeyboardHandler`. It is absent from the Jest mock, and on a device it changes the soft input mode.
- Produces: no new exports. `getKeyboardTranslation` keeps its signature but becomes a worklet. `BottomSheet` props are unchanged.

- [ ] **Step 1: Write the failing BottomSheet tests**

In `src/components/__tests__/BottomSheet.test.tsx`, replace the import block (lines 1-8) with:

```tsx
import React from 'react';

import { Dimensions, Keyboard, Modal, Platform, StyleSheet, Text } from 'react-native';

import { act, render } from '@testing-library/react-native';
import { KeyboardController, useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import * as Reanimated from 'react-native-reanimated';

import BottomSheet from '../sheets/BottomSheet';
```

Replace the first `describe('BottomSheet', () => { ... });` block (lines 10-59, the "subscribes to keyboard events…" and "does not subscribe…" tests) with:

```tsx
describe('BottomSheet', () => {
  const originalOS = Platform.OS;
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('keeps iOS on keyboardWillShow and keyboardWillHide', () => {
    Platform.OS = 'ios';
    const removeSubscriptions: jest.Mock[] = [];
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation(() => {
      const remove = jest.fn();
      removeSubscriptions.push(remove);

      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    });

    const { unmount } = render(
      <BottomSheet {...defaultProps}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).toHaveBeenCalledWith('keyboardWillShow', expect.any(Function));
    expect(addListenerSpy).toHaveBeenCalledWith('keyboardWillHide', expect.any(Function));

    unmount();

    expect(removeSubscriptions).toHaveLength(2);
    expect(removeSubscriptions[0]).toHaveBeenCalledTimes(1);
    expect(removeSubscriptions[1]).toHaveBeenCalledTimes(1);
    addListenerSpy.mockRestore();
  });

  it('does not wait for React Native keyboard events on Android (#190)', () => {
    Platform.OS = 'android';
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');

    render(
      <BottomSheet {...defaultProps}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });

  it('does not subscribe to keyboard events when keyboard avoidance is disabled', () => {
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener');

    render(
      <BottomSheet {...defaultProps} avoidKeyboard={false}>
        <Text>Sheet content</Text>
      </BottomSheet>,
    );

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });
});
```

Append at the end of the file:

```tsx
type KeyboardFrameHandlers = Parameters<typeof useGenericKeyboardHandler>[0];

const keyboardFrame = (height: number) => ({
  height,
  progress: height > 0 ? 1 : 0,
  duration: 285,
  target: 1,
});

describe('BottomSheet follows Android keyboard frames (#190)', () => {
  const originalOS = Platform.OS;
  const screenHeight = Dimensions.get('window').height;
  const safeAreaMock = jest.requireMock('react-native-safe-area-context') as {
    useSafeAreaInsets: () => { top: number; bottom: number; left: number; right: number };
  };

  const sheet = (visible = true, avoidKeyboard = true) => (
    <BottomSheet visible={visible} avoidKeyboard={avoidKeyboard} onClose={jest.fn()}>
      <Text>Content</Text>
    </BottomSheet>
  );
  /** Handlers BottomSheet registered with react-native-keyboard-controller on its latest render. */
  const keyboardHandlers = (): KeyboardFrameHandlers => {
    const { calls } = jest.mocked(useGenericKeyboardHandler).mock;
    return calls[calls.length - 1][0];
  };
  const translateY = (view: ReturnType<typeof render>) => {
    const style = StyleSheet.flatten(view.getByTestId('bottom-sheet-modal').props.style) as {
      transform?: { translateY?: number }[];
    };
    return style.transform?.[0]?.translateY;
  };
  /** Delivers one keyboard frame, then re-renders: the Reanimated mock evaluates styles on render. */
  const deliver = (
    view: ReturnType<typeof render>,
    phase: 'onMove' | 'onEnd',
    height: number,
    visible = true,
    avoidKeyboard = true,
  ) => {
    act(() => {
      keyboardHandlers()[phase]?.(keyboardFrame(height));
    });
    view.rerender(sheet(visible, avoidKeyboard));
  };
  const openSheet = (avoidKeyboard = true) => {
    const view = render(sheet(true, avoidKeyboard));
    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    return view;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
    jest
      .spyOn(safeAreaMock, 'useSafeAreaInsets')
      .mockReturnValue({ top: 0, bottom: 48, left: 0, right: 0 });
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('rides each keyboard frame to the resting lift instead of jumping ahead', () => {
    const view = openSheet();

    deliver(view, 'onMove', 166);
    expect(translateY(view)).toBe(-118);

    // Inside the sheet's Modal window keyboard-controller reports the IME including the
    // 48dp navigation bar the sheet already pads for (332dp on WEIF_API_36; RN lifted 284).
    deliver(view, 'onEnd', 332);
    expect(translateY(view)).toBe(-284);
  });

  it('never changes the Android soft input mode', () => {
    const view = openSheet();
    view.unmount();

    expect(KeyboardController.setInputMode).not.toHaveBeenCalled();
    expect(KeyboardController.setDefaultMode).not.toHaveBeenCalled();
  });

  it('follows a keyboard that changes height while open', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    deliver(view, 'onMove', 380);

    expect(translateY(view)).toBe(-332);
  });

  it('returns to rest when the keyboard is dismissed under an open sheet', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    deliver(view, 'onMove', 120);
    expect(translateY(view)).toBe(-72);
    deliver(view, 'onEnd', 0);
    expect(translateY(view)).toBe(0);
  });

  it('ignores keyboard frames during entry and catches up once settled', () => {
    const view = render(sheet());

    // Entry waits for the native onShow; a keyboard moving now must not displace the sheet.
    deliver(view, 'onMove', 200);
    expect(translateY(view)).toBe(screenHeight);

    act(() => {
      view.UNSAFE_getByType(Modal).props.onShow();
    });
    view.rerender(sheet());

    expect(translateY(view)).toBe(-152);
  });

  it('leaves the offset to the close animation once the sheet starts closing', () => {
    const view = openSheet();
    deliver(view, 'onEnd', 332);

    view.rerender(sheet(false));
    deliver(view, 'onMove', 300, false);

    expect(translateY(view)).toBe(screenHeight);
  });

  it('ignores keyboard frames when keyboard avoidance is disabled', () => {
    const view = openSheet(false);

    deliver(view, 'onEnd', 332, true, false);

    expect(translateY(view)).toBe(0);
  });
});
```

- [ ] **Step 2: Pin the inset arithmetic**

In `src/utils/__tests__/bottomObstruction.test.ts`, add inside `describe('getKeyboardTranslation', ...)`, after "never returns a negative translation":

```ts
    it('lifts a Modal sheet by the keyboard-controller height less the inset it pads (#190)', () => {
      // WEIF_API_36: keyboard-controller reported 332dp inside the sheet's Modal window,
      // where React Native's screenY-based lift was 284dp with a 48dp safe-area bottom.
      expect(getKeyboardTranslation({ keyboardHeight: 332, safeAreaBottom: 48 })).toBe(284);
    });

    it.each([
      [0, 300],
      [24, 276],
      [48, 252],
    ])('removes a %idp navigation inset exactly once from a 300dp keyboard', (inset, lift) => {
      expect(getKeyboardTranslation({ keyboardHeight: 300, safeAreaBottom: inset })).toBe(lift);
    });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx jest src/components/__tests__/BottomSheet.test.tsx --runInBand`

Expected: FAIL on four tests:

- "does not wait for React Native keyboard events on Android" fails because `addListener` is called with `keyboardDidShow`.
- "rides each keyboard frame…", "follows a keyboard…" and "returns to rest…" fail because `useGenericKeyboardHandler` is never called, so `keyboardHandlers()` throws `Cannot read properties of undefined (reading '0')`.

The new `bottomObstruction` tests pass already, since they pin existing behaviour.

- [ ] **Step 4: Make `getKeyboardTranslation` a worklet**

In `src/utils/bottomObstruction.ts`, extend the doc comment and add the directive as the first statement:

```ts
/**
 * Returns how far a control that already reserves `safeAreaBottom` should move
 * when the keyboard opens. Android keyboard heights can include the system
 * navigation region, so keeping the resting safe-area padding and translating
 * by the full height counts that region twice.
 *
 * Prefer a keyboard-top coordinate when it is in the same viewport coordinate
 * space. Callers that only receive a height still get the same safe-area
 * normalization.
 *
 * A worklet: `BottomSheet` applies it to every react-native-keyboard-controller
 * frame on the UI thread (#190).
 */
export const getKeyboardTranslation = ({
  viewportHeight,
  keyboardTop,
  keyboardHeight,
  safeAreaBottom,
}: KeyboardTranslationMetrics): number => {
  'worklet';

  const hasUsableKeyboardTop =
```

The rest of the function body stays as it is.

- [ ] **Step 5: Implement the Android keyboard tracking in `BottomSheet.tsx`**

Make six edits, in order.

(a) Imports. Remove `Dimensions,` from the `react-native` import list. Add the keyboard-controller import directly above the Reanimated import:

```tsx
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
```

(b) Replace `  const keyboardOffset = useSharedValue(0);` with:

```tsx
  const keyboardOffset = useSharedValue(0);
  // Android (#190) follows the IME frame by frame: React Native's keyboardDidShow
  // arrives once, with duration 0, as soon as the IME is requested, so the sheet
  // used to snap to its final lift before the keyboard moved and the screen behind
  // showed through underneath. Frames are ignored while the sheet enters (a previous
  // field's keyboard can still be sliding out) and once it starts closing (the close
  // animation owns the offset); `latestKeyboardHeight` lets a settled sheet catch up.
  const followsKeyboardFrames = Platform.OS === 'android' && avoidKeyboard;
  const isFollowingKeyboard = useSharedValue(false);
  const latestKeyboardHeight = useSharedValue(0);
```

(c) Directly after the `notifyOpened` `useCallback` (`onOpenedRef.current?.();` … `}, []);`), insert:

```tsx

  const followKeyboardFrame = (height: number) => {
    'worklet';

    latestKeyboardHeight.value = height;
    if (followsKeyboardFrames && isFollowingKeyboard.value) {
      // Inside the sheet's Modal window the height includes the navigation bar the
      // sheet already pads for (332dp reported, 284dp lift, 48dp inset on WEIF_API_36).
      keyboardOffset.value = getKeyboardTranslation({
        keyboardHeight: height,
        safeAreaBottom: safeBottom,
      });
    }
  };

  // The generic hook leaves the window's soft input mode alone; useKeyboardHandler
  // would switch the activity to adjustResize while any sheet is mounted.
  useGenericKeyboardHandler(
    {
      onMove: (event) => {
        'worklet';

        followKeyboardFrame(event.height);
      },
      onEnd: (event) => {
        'worklet';

        followKeyboardFrame(event.height);
      },
    },
    [followsKeyboardFrames, safeBottom],
  );
```

(d) In the keyboard `useEffect`, replace everything from `const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';` through the closing `});` of the `getKeyboardTranslation({ … })` call inside `updateKeyboardOffset` with:

```tsx
    // Android follows the IME through useGenericKeyboardHandler above.
    if (Platform.OS === 'android') {
      return undefined;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const updateKeyboardOffset = (event: KeyboardEvent) => {
      const translation = getKeyboardTranslation({
        keyboardHeight: event.endCoordinates.height ?? 0,
        safeAreaBottom: safeBottom,
      });
```

The `keyboardOffset.value = withTiming(translation, …)` that follows, `resetKeyboardOffset`, the subscriptions, the cleanup and the dependency list all stay unchanged.

(e) In `startOpenAnimation`, replace:

```tsx
    keyboardOffset.value = 0;
    setIsAnimating(true);
    const handleSettled = (finished?: boolean) => {
      'worklet';

      if (finished) {
        runOnJS(setIsAnimating)(false);
        runOnJS(notifyOpened)();
      }
    };
```

with:

```tsx
    keyboardOffset.value = 0;
    isFollowingKeyboard.value = false;
    setIsAnimating(true);
    const handleSettled = (finished?: boolean) => {
      'worklet';

      if (finished) {
        if (followsKeyboardFrames) {
          isFollowingKeyboard.value = true;
          // Catch up with a keyboard that opened, or finished closing, during entry.
          keyboardOffset.value = withTiming(
            getKeyboardTranslation({
              keyboardHeight: latestKeyboardHeight.value,
              safeAreaBottom: safeBottom,
            }),
            { duration: 160, easing: Easing.out(Easing.cubic) },
          );
        }
        runOnJS(setIsAnimating)(false);
        runOnJS(notifyOpened)();
      }
    };
```

Then replace its dependency list with:

```tsx
  }, [
    animation,
    backdropOpacity,
    followsKeyboardFrames,
    isFollowingKeyboard,
    keyboardOffset,
    latestKeyboardHeight,
    notifyOpened,
    retainInline,
    safeBottom,
    screenHeight,
    slideY,
  ]);
```

(f) In `startCloseAnimation`, add `isFollowingKeyboard.value = false;` directly after `setIsAnimating(true);`. Replace its dependency list with `[backdropOpacity, closeDuration, isFollowingKeyboard, keyboardOffset, screenHeight, slideY]`.

- [ ] **Step 6: Run the tests to see them pass**

Run these one at a time:

```bash
npx jest src/components/__tests__/BottomSheet.test.tsx --runInBand --silent
npx jest src/utils/__tests__/bottomObstruction.test.ts --runInBand --silent
npx jest src/components/__tests__/BottomSheetHost.test.tsx --runInBand --silent
npx jest src/components/__tests__/EventActionOverlay.test.tsx --runInBand --silent
npx jest src/screens/create-event --runInBand --silent
npx jest src/navigation/__tests__/SheetRoutes.test.tsx --runInBand --silent
```

Expected: all PASS.

- [ ] **Step 7: Typecheck, lint, format**

```bash
npm run typecheck
npx eslint src/components/sheets/BottomSheet.tsx src/components/__tests__/BottomSheet.test.tsx src/utils/bottomObstruction.ts src/utils/__tests__/bottomObstruction.test.ts
npx prettier --check src/components/sheets/BottomSheet.tsx src/components/__tests__/BottomSheet.test.tsx src/utils/bottomObstruction.ts src/utils/__tests__/bottomObstruction.test.ts
```

Expected: no type errors and no new warnings. If `import/order` complains about the keyboard-controller import, run `npx eslint --fix` on that file. If the Prettier check fails, run `npx prettier --write` on the same files and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/components/sheets/BottomSheet.tsx src/components/__tests__/BottomSheet.test.tsx src/utils/bottomObstruction.ts src/utils/__tests__/bottomObstruction.test.ts
git commit -m "fix: lift Android sheets with each keyboard frame (#190)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Calibrated Android material for the tab bar

**Files:**
- Modify: `src/theme/materials.ts` (append after `avatarBadgeMaterial`)
- Create: `src/theme/__tests__/materials.test.ts`
- Modify: `src/components/ui/FrostedSurface.tsx`
- Modify: `src/components/ui/__tests__/FrostedSurface.test.tsx`
- Modify: `src/navigation/TabBarBackground.tsx`
- Modify: `src/navigation/__tests__/TabBarBackground.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (all exported through `@theme/index`):
  - `type AndroidBlurMaterial = { intensity: number; blurSigmaDp: number }`
  - `tabBarAndroidMaterial: AndroidBlurMaterial`, initially `{ intensity: 13, blurSigmaDp: 19.5 }`
  - `androidBlurReductionFactor(material: AndroidBlurMaterial, pixelRatio: number): number`
  - `FrostedSurfaceProps.androidMaterial?: AndroidBlurMaterial`

- [ ] **Step 1: Write the failing material tests**

Create `src/theme/__tests__/materials.test.ts`:

```ts
import { androidBlurReductionFactor, tabBarAndroidMaterial } from '../materials';

describe('androidBlurReductionFactor', () => {
  it.each([
    [1.75, 1.4469], // WEIF_API_36 (density override 280)
    [2.75, 0.8895], // Galaxy A56 class
    [3, 0.8114], // 480dpi phones
  ])('keeps a 19.5dp blur at pixel ratio %s', (pixelRatio, factor) => {
    expect(
      androidBlurReductionFactor({ intensity: 13, blurSigmaDp: 19.5 }, pixelRatio),
    ).toBeCloseTo(factor, 3);
  });

  it('never asks Dimezis for a radius below 1', () => {
    expect(androidBlurReductionFactor({ intensity: 13, blurSigmaDp: 0.5 }, 1)).toBe(13);
  });
});

describe('tabBarAndroidMaterial', () => {
  it('tints about as lightly as the iOS light material at intensity 54', () => {
    // expo-blur's Android LIGHT tint alpha is 0.78 x intensity / 100; iOS is ~0.18 x 54 / 100.
    expect((0.78 * tabBarAndroidMaterial.intensity) / 100).toBeCloseTo(0.1, 1);
  });
});
```

In `src/components/ui/__tests__/FrostedSurface.test.tsx`:

1. Change the React Native import to `import { PixelRatio, Platform, StyleSheet, Text } from 'react-native';`.
2. Change the theme import to `import { androidBlurReductionFactor, frostedFill } from '@theme/index';`.
3. Inside `describe('FrostedSurface', () => {`, add `const originalOS = Platform.OS;` and `afterEach(() => { Platform.OS = originalOS; });` at the top.
4. Append these tests to that describe:

```tsx
  it('applies an Android material without touching iOS (#190)', () => {
    const material = { intensity: 13, blurSigmaDp: 19.5 };
    const pixelRatio = jest.spyOn(PixelRatio, 'get').mockReturnValue(1.75);
    const blurProps: Record<string, { intensity: number; blurReductionFactor: number }> = {};

    for (const os of ['ios', 'android'] as const) {
      Platform.OS = os;
      const { UNSAFE_getByType, unmount } = render(
        <FrostedSurface tint="light" intensity={54} blur androidMaterial={material} />,
      );
      const { intensity, blurReductionFactor } = UNSAFE_getByType(BlurView).props;
      blurProps[os] = { intensity, blurReductionFactor };
      unmount();
    }

    expect(blurProps.ios.intensity).toBe(54);
    expect(blurProps.android.intensity).toBe(13);
    expect(blurProps.android.blurReductionFactor).toBeCloseTo(
      androidBlurReductionFactor(material, 1.75),
      6,
    );
    pixelRatio.mockRestore();
  });

  it('keeps the shared Android blur for surfaces without a material', () => {
    Platform.OS = 'android';
    const { UNSAFE_getByType } = render(<FrostedSurface tint="dark" intensity={45} blur />);

    expect(UNSAFE_getByType(BlurView).props.intensity).toBe(45);
    expect(UNSAFE_getByType(BlurView).props.blurReductionFactor).toBe(2);
  });
```

Replace `src/navigation/__tests__/TabBarBackground.test.tsx` with:

```tsx
import React from 'react';

import { PixelRatio, Platform, StyleSheet, View } from 'react-native';

import { render } from '@testing-library/react-native';
import { BlurView } from 'expo-blur';

import { androidBlurReductionFactor, tabBarAndroidMaterial } from '@theme/materials';

import { TabBarBackground } from '../TabBarBackground';

describe('TabBarBackground', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  const renderBackground = (os: 'ios' | 'android') => {
    Platform.OS = os;
    const view = render(<TabBarBackground />);
    const views = view.UNSAFE_getAllByType(View);
    const overlay = views.find(
      (candidate) =>
        StyleSheet.flatten(candidate.props.style)?.backgroundColor === 'rgba(251, 251, 251, 0.6)',
    );
    return { blur: view.UNSAFE_getByType(BlurView), views, overlay };
  };

  it.each(['ios', 'android'] as const)('keeps the 60%% overlay over a light blur on %s', (os) => {
    const { blur, views, overlay } = renderBackground(os);

    expect(blur.props.tint).toBe('light');
    expect(overlay).toBeDefined();
    expect(StyleSheet.flatten(overlay?.props.style)).toMatchObject(StyleSheet.absoluteFillObject);
    expect(StyleSheet.flatten(views[0].props.style)).toMatchObject({
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
    });
  });

  it('keeps the iOS material at intensity 54', () => {
    const { blur } = renderBackground('ios');

    expect(blur.props.intensity).toBe(54);
    expect(blur.props.experimentalBlurMethod).toBeUndefined();
  });

  it('uses the calibrated Android material so covers show through (#190)', () => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(2.75);
    const { blur } = renderBackground('android');

    expect(blur.props.experimentalBlurMethod).toBe('dimezisBlurView');
    expect(blur.props.intensity).toBe(tabBarAndroidMaterial.intensity);
    expect(blur.props.blurReductionFactor).toBeCloseTo(
      androidBlurReductionFactor(tabBarAndroidMaterial, 2.75),
      6,
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run, one at a time: `npx jest src/theme/__tests__/materials.test.ts --runInBand`, then `npx jest src/components/ui/__tests__/FrostedSurface.test.tsx --runInBand`, then `npx jest src/navigation/__tests__/TabBarBackground.test.tsx --runInBand`.

Expected: FAIL.

- `materials`: `androidBlurReductionFactor is not a function`.
- `FrostedSurface`: ts-jest reports `Property 'androidMaterial' does not exist`.
- `TabBarBackground`: `Cannot read properties of undefined (reading 'intensity')`.

- [ ] **Step 3: Add the material and the density conversion**

Append to `src/theme/materials.ts`:

```ts
/** A surface's own Android blur: expo-blur tint strength plus an on-screen blur width. */
export type AndroidBlurMaterial = {
  /** expo-blur `intensity` on Android; it sets the tint alpha (LIGHT: 0.78 x intensity / 100). */
  intensity: number;
  /** Gaussian sigma of the blur on screen, in dp. */
  blurSigmaDp: number;
};

/**
 * Android tab bar material (#190), fitted on WEIF_API_36 against the iOS tab bar
 * over the same Discover covers.
 *
 * The shared Android blur (intensity 54, blurReductionFactor 2) left the bar flat
 * white: expo-blur painted its LIGHT tint at 42% beneath the 60% overlay, and the
 * Dimezis radius of 27 on a 6x-downsampled capture spread each cover across the
 * whole bar. 3.4% of a cover's contrast reached the bar (iOS 23.4%) and the edge
 * contrast under the bar was 7.3 (iOS 24.4). A 10% tint with a 19.5dp sigma
 * raised them to 9.9% and 23.5 at the same scroll position.
 */
export const tabBarAndroidMaterial: AndroidBlurMaterial = {
  intensity: 13,
  blurSigmaDp: 19.5,
};

/** Dimezis BlurView (expo-blur's Android blur) blurs a capture downsampled by this factor. */
const DIMEZIS_SCALE_FACTOR = 6;
/** Android's RenderEffect turns a blur radius r into a Gaussian sigma of 0.57735 r + 0.5. */
const RADIUS_TO_SIGMA = 0.57735;

/**
 * The expo-blur `blurReductionFactor` that gives `material.blurSigmaDp` on a screen
 * of `pixelRatio`. expo-blur sets the Dimezis radius to intensity / blurReductionFactor
 * in pixels of the downsampled capture, so one fixed factor blurs about 1.6x wider
 * (in dp) on a 1.75x screen than on a 2.75x phone.
 */
export const androidBlurReductionFactor = (
  material: AndroidBlurMaterial,
  pixelRatio: number,
): number => {
  const sigmaInCapture = (material.blurSigmaDp * pixelRatio) / DIMEZIS_SCALE_FACTOR;
  const radius = Math.max(1, (sigmaInCapture - 0.5) / RADIUS_TO_SIGMA);
  return material.intensity / radius;
};
```

- [ ] **Step 4: Teach `FrostedSurface` the Android material**

In `src/components/ui/FrostedSurface.tsx`, make four edits.

(a) Replace the two import blocks with:

```tsx
import {
  PixelRatio,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';

import { BlurView } from 'expo-blur';

import {
  AndroidBlurMaterial,
  FrostedMaterialTint,
  androidBlurReductionFactor,
  frostedFill,
  frostedMaterialDefaultIntensity,
} from '@theme/index';
```

(b) In `FrostedSurfaceProps`, add after `androidBackdrop?: React.ReactNode;`:

```tsx
  /**
   * Android-only blur calibration, for a surface whose iOS material the shared
   * Android blur cannot reproduce at the same `intensity`: expo-blur ties
   * Android's tint alpha and blur radius to it. Requires `blur`; iOS ignores it.
   * The tab bar passes `tabBarAndroidMaterial` (#190).
   */
  androidMaterial?: AndroidBlurMaterial;
```

(c) Replace the component's signature and opening, `const FrostedSurface: React.FC<FrostedSurfaceProps> = ({` … `}) => (` followed by `  <View {...rest} style={style}>`, with:

```tsx
const FrostedSurface: React.FC<FrostedSurfaceProps> = ({
  tint,
  intensity = frostedMaterialDefaultIntensity,
  blur = false,
  androidBackdrop,
  androidMaterial,
  style,
  children,
  ...rest
}) => {
  const material = Platform.OS === 'android' ? androidMaterial : undefined;

  return (
    <View {...rest} style={style}>
```

(d) Replace the `BlurView` element with the version below. Then close the component with `    </View>\n  );\n};` instead of `  </View>\n);`, re-indenting the JSX one level.

```tsx
        <BlurView
          pointerEvents="none"
          tint={tint}
          intensity={material ? material.intensity : intensity}
          // Android renders a flat scrim without this; iOS blurs natively.
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          // Android-only, and the reason it exists: Android divides `intensity` by
          // this to get its blur radius, and at the stock 4 its blur lands much
          // weaker than the iOS material. Calibrated against the Create Event
          // cover chip so both platforms smooth the cover to a comparable degree.
          // A surface's `androidMaterial` derives it from the screen density instead.
          blurReductionFactor={
            material ? androidBlurReductionFactor(material, PixelRatio.get()) : ANDROID_BLUR_REDUCTION
          }
          style={StyleSheet.absoluteFill}
        />
```

- [ ] **Step 5: Use it for the tab bar**

Replace the body of `src/navigation/TabBarBackground.tsx` above `const styles` with:

```tsx
import { StyleSheet, View } from 'react-native';

import FrostedSurface from '@components/ui/FrostedSurface';
import { colors } from '@theme/colors';
import { tabBarAndroidMaterial } from '@theme/materials';

export const TabBarBackground = () => (
  <View style={styles.container}>
    <FrostedSurface
      tint="light"
      intensity={54}
      blur
      androidMaterial={tabBarAndroidMaterial}
      style={StyleSheet.absoluteFill}
    />
    <View style={styles.overlay} />
    <View style={styles.topBorder} />
  </View>
);
```

- [ ] **Step 6: Run the tests to see them pass**

Run one at a time: the three suites from Step 2, then `npx jest src/navigation/__tests__/AppNavigator.test.tsx --runInBand --silent`, then `npx jest src/components/__tests__/EventCard --runInBand --silent`.

Expected: all PASS.

- [ ] **Step 7: Typecheck, lint, format**

```bash
npm run typecheck
npx eslint src/theme/materials.ts src/theme/__tests__/materials.test.ts src/components/ui/FrostedSurface.tsx src/components/ui/__tests__/FrostedSurface.test.tsx src/navigation/TabBarBackground.tsx src/navigation/__tests__/TabBarBackground.test.tsx
npx prettier --check src/theme/materials.ts src/theme/__tests__/materials.test.ts src/components/ui/FrostedSurface.tsx src/components/ui/__tests__/FrostedSurface.test.tsx src/navigation/TabBarBackground.tsx src/navigation/__tests__/TabBarBackground.test.tsx
```

Expected: clean. The `blurReductionFactor` expression in `FrostedSurface` may exceed the line width; if the Prettier check fails, run `npx prettier --write` on the same files and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/theme/materials.ts src/theme/__tests__/materials.test.ts src/components/ui/FrostedSurface.tsx src/components/ui/__tests__/FrostedSurface.test.tsx src/navigation/TabBarBackground.tsx src/navigation/__tests__/TabBarBackground.test.tsx
git commit -m "fix: let the Android tab bar show the list it blurs (#190)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: On-device after evidence and calibration

**Files:**
- Create in `report/screenshots/issue-190/`:
  - `android-before-tabbar-matched.png`, `android-after-tabbar.png`, `android-before-vs-after-tabbar-crop.png`
  - `ios-before-tabbar-card6.png`, `ios-after-tabbar.png`, `android-vs-ios-after-tabbar-crop.png`
  - `android-after-details-sheet-strip.png`, `android-after-details-sheet.gif`, `android-after-details-sheet-hide-strip.png`
  - `android-after-report-sheet-strip.png`
  - `ios-after-details-sheet-strip.png`
- Possibly modify: `src/theme/materials.ts` (`tabBarAndroidMaterial` values, Step 3 only)

Use the Evidence Toolkit. Both apps run the branch from the 8082 Metro set up in Task 0 Step 2. Reload each app so it runs Tasks 1–2.

- [ ] **Step 1: Matched Android tab-bar pair**

Fast Refresh keeps the scroll position, so swapping one file gives a pixel-matched pair.

1. On Discover, scroll from the top with `adb -s emulator-5554 shell input swipe 360 1150 360 950 600`. Check with `adb -s emulator-5554 exec-out screencap -p > "$EV/check.png"` that card 6's cover (swimming, "17 Oct") fills the bar's tab row on the left.
2. Restore the old background: `git show master:src/navigation/TabBarBackground.tsx > src/navigation/TabBarBackground.tsx`.
3. Wait about 10 s for Fast Refresh, then run `adb -s emulator-5554 exec-out screencap -p > report/screenshots/issue-190/android-before-tabbar-matched.png`.
4. Put the branch version back: `git checkout -- src/navigation/TabBarBackground.tsx`.
5. Wait about 10 s, then run `adb -s emulator-5554 exec-out screencap -p > report/screenshots/issue-190/android-after-tabbar.png`.
6. Measure both with `python3 -I "$EV/tools/measure_bar.py" FILE 104 160 545 610 1.75`.

Acceptance, after against matched before:

| Metric | Required | Reference |
|---|---|---|
| bar over page | within ±2 of before | the white is unchanged |
| tint spread | ≥ 3 | before 1.1 |
| contrast passed | ≥ 8% | before 3.4% |
| edge contrast | ≥ 18 | before 7.3 |
| blur sigma | ≤ 40 dp | before ~66 |

The spike at these values measured 4.3, 9.9%, 23.5 and ~27 dp. Make the crop pair with:

```bash
ffmpeg -loglevel error -y -i report/screenshots/issue-190/android-before-tabbar-matched.png -i report/screenshots/issue-190/android-after-tabbar.png -filter_complex "[0:v]crop=720:330:0:1270[a];[1:v]crop=720:330:0:1270[b];[a][b]hstack=inputs=2" report/screenshots/issue-190/android-before-vs-after-tabbar-crop.png
```

- [ ] **Step 2: iOS reference on the same card**

1. On the simulator, call `mobile_swipe_on_screen` with direction `up` and a distance of about 110, then capture with `xcrun simctl io 904895B3-F262-4B33-BDAB-5F5DEDC26312 screenshot FILE`. Repeat until card 6's cover fills the bar's tab row on the left.
2. Capture `ios-before-tabbar-card6.png` with master's `TabBarBackground.tsx` and `ios-after-tabbar.png` with the branch version, swapping the file the same way as in Step 1.
3. Measure both with `measure_bar.py FILE 170 280 900 1000 3`.

Acceptance: the two iOS captures match within ±1 on every metric, because the iOS path is unchanged. Record iOS's "contrast passed", "texture kept" and "tint spread" on card 6 as the calibration target. Make `android-vs-ios-after-tabbar-crop.png` from crops of the bar region (Android `crop=720:330:0:1270`; iOS `crop=1179:540:0:2016,scale=720:-1`) joined with `hstack`.

- [ ] **Step 3: Calibrate only if Android reads clearly flatter than iOS**

**When:** if Android's "contrast passed" on card 6 is below 0.6 × iOS's, or its "texture kept" is above 2 × iOS's, tune `tabBarAndroidMaterial`. Otherwise keep 13 / 19.5.

**Knobs:**
- Lower `intensity` from 13 to 10, then 8. This gives a lighter tint, so more colour shows through.
- If texture is still too high, raise `blurSigmaDp` from 19.5 to 24, then 28.

**Loop, for each candidate:**
1. Edit the constant in `src/theme/materials.ts`.
2. Wait for Fast Refresh. The list position is unchanged.
3. Capture `android-after-tabbar.png` again and measure it.

**Then:**
- Stop at the first candidate inside both bounds that keeps "bar over page" ≥ 249 and the tab icons legible.
- Update the doc comment numbers and the `materials.test.ts` comment if the values change.
- Commit: `git commit -am "fix: calibrate the Android tab bar material against iOS (#190)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

- [ ] **Step 4: Details sheet after, opening**

Open Create (the + tab). Run `record.sh details_after 364 733`, which taps "Add details". Confirm the coordinates with `mobile_list_elements_on_screen` first.

Read `contact.png`. Acceptance:

- In every frame where the keyboard is partly up, its top edge meets the sheet, or the sheet sits behind it. No frame shows the Create form between the sheet and the keyboard.
- On the settled last frame, `python3 -I "$EV/tools/sheet_gap.py" "$EV/details_after/frames/f_<last>.png"` prints `done_bottom=976 keyboard_top=1016 gap_px=40` (±2 px). That is the same resting place as before.

Build the strip with `strip.sh details_after report/screenshots/issue-190/android-after-details-sheet-strip.png <rest> <3 frames while rising> <settled>`. Build the GIF with the toolkit command, covering from the tap to settled.

- [ ] **Step 5: Details sheet after, keyboard dismissed while open**

With the Details sheet open and the keyboard up, record with `adb -s emulator-5554 shell "rm -f /sdcard/details_hide.mp4; screenrecord --time-limit 6 /sdcard/details_hide.mp4 & sleep 1.5; input keyevent KEYCODE_BACK; wait"`. Pull it to `$EV/details_hide/details_hide.mp4` and extract frames as in `record.sh`.

Acceptance: the sheet descends with the keyboard and no frame shows the form under a lifted sheet. Compare with `android-before-details-sheet-hide-gap.jpg`. Build the strip as `android-after-details-sheet-hide-strip.png`.

- [ ] **Step 6: Soft input mode untouched**

Read the app window mode with the toolkit command at four points:

1. on Discover;
2. with the Create screen open (the prepared date picker sheet is mounted);
3. with the Details sheet open;
4. after closing it.

Expected: `sim={adjust=pan}` every time.

Also tap "Event name" on Create, both before and after a Details round trip. The screen must behave identically in both, panning the field above the keyboard.

If you are signed in and a conversation exists, open it, open and close its member-actions sheet, and confirm the composer still rises with the keyboard. This is the chat thread's `ADJUST_NOTHING` path.

- [ ] **Step 7: Report sheet after**

Repeat Task 0 Step 4 on the branch, recording with `record.sh report_after X Y`.

Acceptance: as in Step 4, with no exposed Event Details between the sheet and the keyboard. Save the strip as `android-after-report-sheet-strip.png`.

- [ ] **Step 8: iOS sheet smoke check**

On the simulator: open Create, tap "Add details", let it settle, then tap Done. Capture three frames with `xcrun simctl io <udid> screenshot`: at rest, keyboard up, closed. Join them with `hstack` into `ios-after-details-sheet-strip.png`.

Expected: the same motion and resting position as master on iOS (Done just above the keyboard).

- [ ] **Step 9: Physical phone (ask the user first)**

The emulator cannot judge smoothness. Ask the user whether to check on their Galaxy A56 (SM-A566E, Wi-Fi adb). Only with their go-ahead, and never while a call is in progress:

1. Run the branch JS on the phone through their usual dev-client or release recipe.
2. Record the Details sheet open with `adb -s <phone> shell screenrecord`.
3. Screenshot Discover with a cover under the bar.

Expected: the sheet rides the keyboard with no lag visible at 60/120 Hz. If the user declines, record "physical device not checked" in `TEST_RUNS.md`.

- [ ] **Step 10: Commit the after evidence**

```bash
git add report/screenshots/issue-190
git commit -m "docs: record issue #190 after evidence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Conventions and test log

**Files:**
- Modify: `CLAUDE.md` (line 3 and line 239), `AGENTS.md` (line 83 and line 156)
- Modify: `report/shared-components-refactor-guide.md` (line 521, the FrostedSurface rules, lines 995-998)
- Modify: `TEST_RUNS.md` (append)

Use the final `tabBarAndroidMaterial` values from Task 3 wherever 13 / 19.5 appears below.

- [ ] **Step 1: Tab bar convention**

Replace the bullet at `CLAUDE.md` line 3 and at `AGENTS.md` line 83 with:

```markdown
- Bottom-tab chrome lives in `src/navigation/TabBarBackground.tsx`: `FrostedSurface` with real blur beneath the 60% white overlay so scrolling content is softened on both platforms. iOS uses intensity 54. Android passes `tabBarAndroidMaterial` (`src/theme/materials.ts`: LIGHT tint intensity 13, 19.5dp blur sigma converted for the screen density), because expo-blur ties Android's tint (0.78 x intensity) and Dimezis radius (intensity / `blurReductionFactor` on a 6x-downsampled capture) together and intensity 54 left the bar flat white (#190).
```

- [ ] **Step 2: Sheet keyboard convention**

In `CLAUDE.md` line 239, replace `Android keyboard lifts use physical-screen keyboard-top coordinates to support \`adjustPan\`.` In `AGENTS.md` line 156, replace `on Android it uses physical-screen keyboard-top coordinates to remain correct with \`adjustPan\`.` Use this text for both:

```markdown
On Android, `BottomSheet` follows every IME frame through react-native-keyboard-controller's `useGenericKeyboardHandler` (never `useKeyboardHandler`, which switches the activity's soft input mode); inside a sheet's Modal window the reported height includes the navigation bar, so the lift is `getKeyboardTranslation({ keyboardHeight, safeAreaBottom })`. Frames are ignored while the sheet enters and after its close starts (#190).
```

- [ ] **Step 3: Shared component guide**

In `report/shared-components-refactor-guide.md`:

1. Line 521 becomes: ``- Tab bar background (`src/navigation/TabBarBackground.tsx`): real blur beneath the 60% white overlay; iOS intensity 54, Android `tabBarAndroidMaterial` through `androidMaterial` (#190).``
2. After the "Pass `blur` over photography…" rule, add: ``- `androidMaterial` (Android only, needs `blur`) gives a surface its own tint intensity and dp blur sigma when the shared Android blur cannot match its iOS material at the same `intensity`; `androidBlurReductionFactor` converts the sigma for the screen density. Only the tab bar uses it. Calibrate a new one against iOS on device with matched captures.``
3. In lines 995-998, replace "Android uses physical-screen keyboard-top coordinates so `adjustPan` does not collapse the translation to zero; iOS retains height-based animation timing." with: "Android follows every IME frame from react-native-keyboard-controller's `useGenericKeyboardHandler` (its Modal watcher reaches the sheet's own window, where the height includes the navigation bar), ignoring frames during entry and after the close starts; iOS keeps `keyboardWillShow`/`keyboardWillHide` timing."

- [ ] **Step 4: TEST_RUNS.md entry**

Append, using the numbers printed in Task 3:

```markdown
## 2026-10-<day> — Issue #190: Android sheet keyboard lift and tab bar blur

- Change: Android `BottomSheet` follows every keyboard-controller frame (`useGenericKeyboardHandler`, Modal height minus the safe-area bottom) instead of React Native's zero-duration `keyboardDidShow`; the tab bar passes `tabBarAndroidMaterial` (intensity <i>, <s>dp sigma) instead of the shared intensity-54 blur.
- Flow: Create → Add details (open, keyboard Back, Done); Event Details → More actions → Report plan; Discover with the seeded "#190 tab bar test" list, card 6 under the bar.
- Android `WEIF_API_36`: <PASS|FAIL>. Details/report sheets: before, the sheet jumped ~300 ms ahead of the keyboard with the screen visible beneath; after, no exposed frame, Done rests at `gap_px=<n>` (master 40). Tab bar matched pair: contrast passed <before>% → <after>%, edge contrast <before> → <after>, tint spread <before> → <after>, page <before> → <after>. Soft input mode `adjust=pan` throughout.
- iOS `WEIF_ISSUE_167_IOS`: <PASS|FAIL>; tab bar before/after identical within ±1, Details sheet unchanged.
- Physical device: <result, or "not checked (user declined)">.
- Tests: <suites/tests> pass; `npm run typecheck` clean.
- Screenshots: `report/screenshots/issue-190/`.
```

- [ ] **Step 5: Commit**

```bash
npx prettier --check CLAUDE.md AGENTS.md report/shared-components-refactor-guide.md TEST_RUNS.md
git add CLAUDE.md AGENTS.md report/shared-components-refactor-guide.md TEST_RUNS.md
git commit -m "docs: record issue #190 sheet and tab bar conventions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Full validation, publication, cleanup

**Files:** none new.

- [ ] **Step 1: Full checks** (with the emulator idle or closed)

```bash
npm test -- --runInBand --silent
npm run typecheck
npm run lint
git diff --check master...HEAD
```

Expected: all suites pass, there are no type errors, and the lint warning count is not above master's.

- [ ] **Step 2: Ask the user, then push and open the PR**

Pushing and opening a PR are outward-facing, so ask first. With the user's go-ahead:

```bash
git push -u origin fix/issue-190-android-sheet-keyboard-and-tab-blur
gh pr create --title "fix: Android sheets ride the keyboard; tab bar shows the list it blurs (#190)" --body-file "$EV/pr.md"
```

`$EV/pr.md` holds:

- the two root causes from the Investigation section, one paragraph each;
- the before/after table from Step 3;
- the test summary;
- the closing line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Ask the user, then post the evidence on the issue**

Commenting is outward-facing, so ask first. Get the evidence commit SHA with `SHA=$(git log -1 --format=%H -- report/screenshots/issue-190)`. Write `$EV/comment.md` from this template, with every image URL pinned to `$SHA` and the measured values filled in. Then run `gh issue comment 190 --body-file "$EV/comment.md"`.

````markdown
Fix on branch [`fix/issue-190-android-sheet-keyboard-and-tab-blur`](https://github.com/antash-mishra/who-else-is-free/tree/fix/issue-190-android-sheet-keyboard-and-tab-blur).

**1. Details / report sheet jumped ahead of the keyboard.** On Android the sheet lifted on React Native's `keyboardDidShow`, which arrives once with a 0 ms duration before the keyboard moves, so the sheet snapped up and the screen showed underneath for ~300 ms. It now follows every keyboard frame (react-native-keyboard-controller) and rests exactly where it did before.

| Before | After |
|---|---|
| <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-before-details-sheet-strip.png" width="600"> | <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-after-details-sheet-strip.png" width="600"> |
| <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-before-report-sheet-strip.png" width="600"> | <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-after-report-sheet-strip.png" width="600"> |

**2. No blur behind the tab bar.** The Android blur ran, but expo-blur's 42% tint under our 60% overlay plus a radius that Dimezis applies to a 6x-downsampled capture spread each cover into white: only ~3% of a cover's contrast reached the bar (iOS ~23%). Android now uses its own tint and a density-aware blur width; iOS is unchanged.

| Android before | Android after | iOS (unchanged) |
|---|---|---|
| <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-before-tabbar-matched.png" width="240"> | <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/android-after-tabbar.png" width="240"> | <img src="https://raw.githubusercontent.com/antash-mishra/who-else-is-free/SHA/report/screenshots/issue-190/ios-after-tabbar.png" width="240"> |

Measured on the same scroll position: contrast passed <before>% → <after>%, edge contrast <before> → <after>.

Tests: <summary>. JS-only; reaches runtime 1.0.2 installs through an EAS Update. Leaving this issue open for review.
````

- [ ] **Step 4: Ask the user before shipping by EAS Update**

The fix is JS-only. Publishing an update for runtime 1.0.2 is the user's release decision, so ask before running it.

- [ ] **Step 5: Cleanup** (after the user has reviewed the evidence)

1. Stop the 8082 Metro.
2. Delete the eight seeded plans:

```bash
API=http://localhost:8080/api
TOKEN=$(curl -s -X POST "$API/dev-login" -H 'Content-Type: application/json' \
  -d '{"email":"issue190-seed@example.test","name":"Issue190 Seed","profile_complete":true}' |
  python3 -I -c 'import sys, json; print(json.load(sys.stdin)["token"])')
curl -s "$API/events" |
  python3 -I -c 'import sys, json; [print(e["id"]) for e in json.load(sys.stdin)["data"] if e["title"].startswith("#190 tab bar test")]' |
  while read -r ID; do curl -s -o /dev/null -w "delete $ID -> %{http_code}\n" -X DELETE "$API/events/$ID" -H "Authorization: Bearer $TOKEN"; done
```

Expected: eight `delete <id> -> 200` lines (ids 47-54 on 2026-10-12).
