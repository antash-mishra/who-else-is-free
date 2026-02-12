# Android Chat Composer Floats When Tapping Input

## Problem Description

On Android, when the user taps the chat input field in `ChatThreadScreen`, the composer (text input + send button) visibly "floats" or jumps to the middle of the screen momentarily before settling into its correct position above the keyboard. This creates a jarring visual glitch every time the user opens the keyboard.

## Environment

- React Native + Expo (New Architecture enabled: `newArchEnabled: true`)
- Android edge-to-edge mode: `edgeToEdgeEnabled: true` (app.config.js:31)
- Keyboard layout mode: `softwareKeyboardLayoutMode: "pan"` (app.config.js:33)
- `ScreenContainer` wraps content in `SafeAreaView` with `edges: ["top", "bottom"]`

## How the Chat Screen Layout Works

The view hierarchy on Android is:

```
ScreenContainer (SafeAreaView + padding)
  └── Header
  └── View (threadContainer, flex: 1)
      └── View (threadBody, flex: 1, paddingBottom: androidKeyboardPadding)
          ├── FlatList (messages)
          └── View (composerContainer)
              └── View (composerInputWrapper) ← the input + send button
```

On **iOS**, the screen uses `<KeyboardAvoidingView behavior="padding">` which handles keyboard avoidance natively.

On **Android**, the screen does NOT use `KeyboardAvoidingView`. Instead, it uses a manual approach:
1. Listens to `keyboardDidShow` / `keyboardDidHide` events
2. Calculates keyboard height from `e.endCoordinates.screenY`
3. Sets `paddingBottom` on `threadBody` to push the composer above the keyboard

The calculated padding is:
```ts
const androidKeyboardPadding =
  Platform.OS === "android" && keyboardHeight > 0
    ? Math.max(0, keyboardHeight - insets.bottom)
    : 0;
```

## Why It Happens: Dual Keyboard Avoidance Conflict

There are **two independent systems** fighting to handle the keyboard:

### System 1: OS-Level Window Panning

`softwareKeyboardLayoutMode: "pan"` (app.config.js:33) tells Android to **pan (scroll) the entire window upward** when the keyboard opens. The OS does this immediately and natively when the focused input would be obscured.

### System 2: React-Level `paddingBottom` Adjustment

The `useEffect` in ChatThreadScreen (line 52-79) listens for `keyboardDidShow` and applies `paddingBottom` equal to the keyboard height on the `threadBody` View. This pushes the composer up from the bottom.

### The Conflict

When the user taps the input:

1. **T=0ms**: Android OS begins panning the window up (native animation, immediate)
2. **T=~250ms**: Keyboard is fully visible. `keyboardDidShow` fires.
3. **T=~250ms**: `setKeyboardHeight(calculatedHeight)` re-renders with `paddingBottom` applied
4. **Result**: The OS has already panned the window up, AND React is now adding extra padding. The composer is pushed up by **both** systems simultaneously, causing it to overshoot or appear in an intermediate wrong position before the OS panning settles.

The net effect: the composer briefly appears to float in the middle of the screen because the padding is being applied on top of the OS pan, creating a doubled offset during the transition.

## Chosen Fix (Implemented)

Use a **chat-only fix** in `ChatThreadScreen`:
- Remove Android keyboard-height calculations and dynamic `paddingBottom` avoidance
- Keep Android on normal flex layout (`threadBody` without dynamic `paddingBottom`)
- Keep iOS `KeyboardAvoidingView` path unchanged
- Keep global Android config unchanged (`softwareKeyboardLayoutMode: "pan"`)

### Why this fix

Android already pans the window in `"pan"` mode. Removing manual React padding prevents double keyboard avoidance, which is what caused the temporary composer overshoot/floating effect.

### Regression Risks

- On some Android devices, if OS panning behaves differently with edge-to-edge insets, composer placement could still need device-specific handling.
- This change is scoped only to chat to avoid unintended behavior shifts on other input-heavy screens.

### Validation Checklist (Android)

- [ ] Open chat thread and tap input: composer does not jump to mid-screen.
- [ ] Composer stays immediately above keyboard while typing.
- [ ] Multiline input growth remains stable.
- [ ] Dismissing/reopening keyboard keeps composer stable.
- [ ] Sending, retrying failed messages, and navigation still work.
- [ ] Join request badge and navigation remain unchanged.

## Follow-up: Keyboard Gap Attempts (Rolled Back)

We attempted multiple Android-only implementations to add a visible gap between keyboard and composer, but none were reliable enough with the current `softwareKeyboardLayoutMode: "pan"` setup.

### Gap approaches tried

1. `marginBottom` gap while keyboard visible (`keyboardDidShow` / `keyboardDidHide`)
- Gap appeared in some states, but collapsed while interacting/typing on certain keyboards/devices.

2. Keyboard visibility + composer focus state (`keyboard visible OR focused`)
- Reduced some transient drops but still did not produce a consistently visible gap for all interactions.

3. Sticky gap state (`gapActive`) ignoring transient `keyboardDidHide` while focused
- Logs confirmed state stayed active during typing, but visible spacing still did not hold consistently on device.

4. Negative `marginTop` lift on composer
- Did not consistently create visible separation in the final layout.

5. `transform: translateY(-gap)` lift on composer
- Also failed to reliably render persistent visual separation across real-device behavior.

### Debug evidence

Instrumentation logs showed `gapActive: true` and `shouldShowGap: true` during typing, but the UI still rendered flush to keyboard in device testing. This indicates the issue is layout/OS interaction under `"pan"`, not a state toggle bug.

### Current status

- Gap-specific code was rolled back.
- Chat behavior remains stable (keyboard opens correctly, no composer glitch introduced by the gap experiments).
- If this requirement becomes mandatory, the next realistic option is changing Android keyboard strategy globally (`"pan"` -> `"resize"`) and doing full regression testing.

## What Was Tried

### Attempt 1: Remove `LayoutAnimation` from Keyboard Handlers

**Hypothesis**: The `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` calls before `setKeyboardHeight()` were creating a 300ms CSS-like animation on the `paddingBottom` change. During this animation, the composer would pass through intermediate positions (floating in the middle) before reaching its final spot.

**Change**: Removed `LayoutAnimation.configureNext()` from both the `keyboardDidShow` and `keyboardDidHide` handlers, and removed the `UIManager.setLayoutAnimationEnabledExperimental(true)` setup. The `paddingBottom` change now applies instantly when the keyboard event fires.

**Result**: Did not fix the issue. The floating behavior persists because the root cause is the conflict between the OS-level `"pan"` mode and the React-level `paddingBottom` — not the animation timing.

## Remaining Ideas to Investigate

### Option A: Change `softwareKeyboardLayoutMode` to `"resize"`

Change `app.config.js:33` from `"pan"` to `"resize"`:
```js
softwareKeyboardLayoutMode: "resize",
```
With `"resize"`, Android shrinks the window height instead of panning it. The React keyboard listener then adds `paddingBottom` to fill the difference. This eliminates the double-avoidance because there's no panning — just a smaller window. **Risk**: this changes behavior for ALL screens on Android, not just ChatThread. Other screens may rely on `"pan"` behavior. Needs full regression testing across the app, especially screens with inputs (CreateEvent, EventActionOverlay, Profile, etc.).

### Option B: Remove the Manual `paddingBottom` Approach Entirely on Android

If `"pan"` mode already handles pushing the input above the keyboard, the manual `paddingBottom` may be unnecessary and actively harmful. Try:
- Remove the `keyboardDidShow`/`keyboardDidHide` listener entirely
- Remove the `androidKeyboardPadding` calculation
- Let the OS `"pan"` mode handle it alone

**Risk**: The manual padding was likely added because `"pan"` alone wasn't enough in edge-to-edge mode (where the system bars are transparent and content extends behind them). Removing it may cause the composer to sit behind the keyboard in some device configurations.

### Option C: Use `KeyboardAvoidingView` on Android Too

Instead of the manual listener approach, use `KeyboardAvoidingView` on Android as well (currently only used for iOS):
```tsx
<KeyboardAvoidingView
  style={styles.threadContainer}
  behavior="height" // or "padding"
  keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
>
```
This delegates the keyboard avoidance to React Native's built-in component, which may cooperate better with the OS `"pan"` mode. **Risk**: `KeyboardAvoidingView` has historically been unreliable on Android, which is likely why the manual approach was implemented in the first place.

### Option D: Switch to `react-native-keyboard-aware-scroll-view` or `react-native-keyboard-controller`

Use a battle-tested third-party library designed specifically for keyboard avoidance:
- [`react-native-keyboard-controller`](https://github.com/kirillzyusko/react-native-keyboard-controller) — uses native animations synced with keyboard, supports edge-to-edge and new architecture
- [`react-native-keyboard-aware-scroll-view`](https://github.com/FLAVOR-FLAVOR/react-native-keyboard-aware-scroll-view) — wraps the scroll view to handle keyboard automatically

These libraries are designed to handle the exact edge cases (edge-to-edge, `"pan"` vs `"resize"`, new architecture) that make manual solutions fragile. `react-native-keyboard-controller` in particular is the modern recommendation for Expo + New Architecture apps.

### Option E: Use `Keyboard.addListener("keyboardWillShow")` Instead of `"keyboardDidShow"`

On Android (API 30+), `keyboardWillShow` fires before the keyboard animation begins. Applying the padding before the OS pan starts might avoid the conflict. However, `keyboardWillShow` support on Android is limited and may not fire on all devices/versions.

### Option F: Disable Edge-to-Edge for This Screen

If the issue is specifically caused by edge-to-edge mode interacting with `"pan"`, setting `edgeToEdgeEnabled: false` would revert to the traditional Android layout behavior where the system handles insets. **Risk**: This is a global setting, not per-screen, and would affect the entire app's visual style.

## Key Files

| File | Role |
|---|---|
| `src/screens/ChatThreadScreen.tsx` | Chat screen with the floating composer bug |
| `app.config.js:31-33` | `edgeToEdgeEnabled`, `softwareKeyboardLayoutMode: "pan"` |
| `src/components/ScreenContainer.tsx` | SafeAreaView wrapper used by ChatThread |
| `src/components/EventActionOverlay.tsx:104-124` | Similar keyboard offset pattern (works because it uses absolute positioning with `bottom`, not `paddingBottom` in a flex layout) |
