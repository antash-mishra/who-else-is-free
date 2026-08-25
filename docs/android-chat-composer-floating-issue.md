# Android Chat Composer Keyboard Plan

## Summary

This document captures the Android chat composer issue in `ChatThreadScreen`, what has already been fixed, what approaches were tried and why they were not sufficient, and the permanent fix that was implemented for the remaining overlap.

## Implementation Status

Implemented in the current working tree.

The chat screen now uses `react-native-keyboard-controller` to take control of Android keyboard placement:

- `App.tsx` wraps the app in `KeyboardProvider`.
- `ChatThreadScreen.tsx` switches Android to `SOFT_INPUT_ADJUST_NOTHING` while the screen is mounted.
- Android composer movement is driven by `KeyboardEvents` keyboard height.
- The composer is translated by the keyboard obstruction above the already-reserved safe area plus
  `spacing.xs`, so three-button navigation is not counted twice.
- On unmount, the screen restores the default Android input mode.

## Resolved Regression

### User-visible behavior

The original overlap was removed by keyboard-controller positioning. A later cross-device check
found the inverse problem on three-button-navigation devices: the resting system inset remained in
the composer while the full keyboard obstruction moved it, leaving an excessive gap. The shared
`bottomObstruction.ts` normalization now removes that already-reserved inset exactly once.

The original reproduction was:

- when the user taps the textbox, the keyboard opens
- the composer moves upward with the screen
- a small part of the composer still overlaps the keyboard
- the overlap is consistent, not random

This means the layout is close, but still not precise enough to be considered correct.

### Current code state

The current implementation is:

- `app.config.js`
  - `android.edgeToEdgeEnabled: true`
  - `android.softwareKeyboardLayoutMode: "pan"`
- `src/screens/ChatThreadScreen.tsx`
  - iOS uses `KeyboardAvoidingView`
  - Android uses a normal `FlatList` plus a sibling composer
  - Android no longer relies on `adjustPan` for final composer placement
  - Android applies `SOFT_INPUT_ADJUST_NOTHING` while this screen is mounted
  - Android translates the composer using the shared safe-area-normalized keyboard obstruction
  - a keyboard listener is only used to scroll messages to the end

## Root Cause

The final cross-device regression came from translating by the full Android keyboard height while
the composer also reserved `insets.bottom`. Some Android keyboard frames include the three-button
navigation region, so that region was counted twice.

`adjustPan` is good enough to keep the focused `TextInput` visible, but it does not guarantee perfect placement for the whole composer wrapper:

- textbox
- send button
- composer padding
- multiline growth

That is why the current result is close but not exact. The OS is protecting the focused input, not positioning the entire chat composer with a precise keyboard gap.

## What Has Already Been Fixed

The following issues have already been resolved during this work:

1. The old Android "floating/jumping to the middle" glitch when opening the keyboard.
2. The bottom system-navbar overlap in the closed state.
3. The "textbox sits too low" problem on devices without a visible bottom navbar.
4. The large temporary gap between keyboard and textbox caused by rendering the composer as a `KeyboardAwareFlatList` footer.
5. Chat-thread rendering tests were updated so they reflect the current screen structure again.

## What We Tried So Far

### 1. Manual Android keyboard-height padding

Approach:

- listen to `keyboardDidShow` / `keyboardDidHide`
- calculate keyboard height
- push the composer up with dynamic bottom padding

Result:

- caused a double-avoidance conflict with Android `pan`
- the composer visibly floated or overshot while the keyboard opened

### 2. Removing `LayoutAnimation`

Approach:

- remove layout animation around keyboard padding changes

Result:

- did not fix the core problem
- the bug was not animation timing, it was the duplicate movement strategy

### 3. Android-only visual gap hacks

Approaches tried:

- `marginBottom` while keyboard visible
- focus-state-based gap
- sticky gap state
- negative `marginTop`
- `transform: translateY(...)`

Result:

- inconsistent across devices and keyboard states
- not reliable enough for production

### 4. Switching to `KeyboardAwareFlatList` with the composer as a footer

Approach:

- move the composer into the list as `ListFooterComponent`
- let `react-native-keyboard-aware-scroll-view` manage the keyboard

Result:

- removed some overlap cases
- introduced a large temporary gap on keyboard open
- root cause: the library adds keyboard-sized bottom padding to list content, and the composer was inside that content

### 5. Current fallback: sibling composer + Android `pan`

Approach:

- restore the composer outside the list
- keep Android `softwareKeyboardLayoutMode: "pan"`
- keep only a lightweight scroll-to-end keyboard listener

Result:

- much better than previous attempts
- but still leaves a small constant overlap

## Why The Current Setup Cannot Be Perfect

The remaining problem is structural:

- Android `pan` decides how far to move the window
- React does not control the composer position frame-by-frame
- safe-area padding only solves resting position, not keyboard clearance

As long as the screen depends on `pan` alone, the result will be approximate rather than exact.

## Implemented Permanent Fix

Use `react-native-keyboard-controller` for the chat composer on Android.

Why this is the right direction:

- it gives direct keyboard-frame driven movement
- it is designed for modern keyboard interactions on React Native
- it avoids per-device guessing
- it can keep a fixed, intentional gap above the keyboard
- it is better suited to a sticky chat composer than `adjustPan`

Official references:

- Expo keyboard handling guide:
  - https://docs.expo.dev/guides/keyboard-handling/
- Expo SDK page for keyboard controller:
  - https://docs.expo.dev/versions/latest/sdk/keyboard-controller/
- `react-native-keyboard-controller` docs:
  - https://kirillzyusko.github.io/react-native-keyboard-controller/

## Fix Plan

### Step 1. Add the keyboard controller dependency

- install `react-native-keyboard-controller`
- rebuild the app after installation
- status: done

Expected impact:

- enables native keyboard-frame based control instead of relying on `pan` only

### Step 2. Wrap the app with the provider

Target file:

- `App.tsx`

Plan:

- add the library provider near the root app tree
- keep the rest of the provider hierarchy unchanged
- status: done

Expected impact:

- makes keyboard animation state available to screens/components

### Step 3. Move chat composer control to keyboard-driven positioning

Target file:

- `src/screens/ChatThreadScreen.tsx`

Plan:

- keep the `FlatList` and composer as siblings
- do not put the composer back inside the list footer
- position the composer with keyboard-controller primitives instead of Android `pan` approximation
- keep a small resting gap when the keyboard is closed
- keep a fixed visible gap when the keyboard is open
- status: done

Expected impact:

- no overlap
- no temporary large gap
- stable multiline input behavior

### Step 4. Reduce dependence on Android `pan` for this screen

Plan:

- stop treating `softwareKeyboardLayoutMode: "pan"` as the final placement solution
- use it only as native window behavior, while composer placement is controlled by keyboard-controller
- if needed, evaluate switching Android input mode for chat handling to a resize-style strategy that better matches keyboard-controller behavior
- status: done with `SOFT_INPUT_ADJUST_NOTHING` while `ChatThreadScreen` is mounted

Expected impact:

- the composer position becomes deterministic instead of approximate

### Step 5. Keep message scrolling logic minimal

Plan:

- keep the existing "scroll to end on keyboard open / new message" behavior
- remove any remaining Android-specific overlap assumptions from the screen
- status: done

Expected impact:

- preserves current chat usability while reducing keyboard-specific fragility

### Step 6. Update tests

Target files:

- `jest.setup.ts`
- `src/screens/__tests__/ChatThreadScreen.rendering.test.tsx`

Plan:

- mock the new keyboard-controller primitives cleanly
- update rendering assertions to the new composer structure if needed
- keep existing chat behavior tests passing
- status: done

## Validation Checklist

### Android devices

Validate on both:

- gesture navigation device
- 3-button navigation device

Scenarios:

- tap textbox: composer sits fully above keyboard
- start typing immediately: no extra jump, no overlap
- multiline growth: composer remains above keyboard
- close keyboard: composer returns to resting position without a large bottom gap
- reopen keyboard repeatedly: behavior stays stable
- send message, retry failed message, navigate back: no regressions

### iOS smoke test

- existing `KeyboardAvoidingView` behavior remains unchanged

## Risks

1. Introducing a native keyboard library requires rebuild and regression testing.
2. The app uses edge-to-edge Android layout, so keyboard behavior must be checked against bottom tab/navigation visuals.
3. Provider-level keyboard changes should remain scoped so they do not accidentally regress other screens.

## Rollback Strategy

If the keyboard-controller migration causes regressions:

1. keep `softwareKeyboardLayoutMode: "pan"`
2. keep the current sibling `FlatList` + composer structure
3. remove keyboard-controller usage from chat only

This would return the app to the current "mostly fixed but slightly overlapping" baseline.

## Files Involved

- `app.config.js`
- `App.tsx`
- `src/screens/ChatThreadScreen.tsx`
- `jest.setup.ts`
- `src/screens/__tests__/ChatThreadScreen.rendering.test.tsx`

## Current Recommendation

Do not continue adding small Android spacing tweaks to the current `pan` approach.

That path has already produced multiple device-specific regressions. The remaining issue is small, but it is the kind of issue that will keep returning unless the composer is moved by actual keyboard-frame data rather than OS pan heuristics.
