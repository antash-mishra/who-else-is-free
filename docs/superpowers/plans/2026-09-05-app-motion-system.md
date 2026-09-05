# App Motion System Implementation Plan (Phases 0–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Who Else Is Free a scrapbook/tactile motion system — items settle onto the page like placed photos — starting with a reusable foundation, then Discover and Event Details.

**Architecture:** Additive. A new `src/theme/motion.ts` sits beside the untouched `src/theme/springs.ts`, a new `src/components/motion/` holds the `<Placed>` entry primitive, and consumers opt in. Reanimated 4 worklets only; nothing new on the JS thread. Reduce-motion is wired into every primitive from the first task.

**Tech Stack:** React Native 0.81, Expo 54, react-native-reanimated 4.1, @shopify/react-native-skia, TypeScript, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-09-05-app-motion-system-design.md`

## Global Constraints

- **Frozen surfaces — do not modify:** `src/context/BloomContext.tsx`, `src/navigation/SheetRoutes.tsx`, `src/screens/SplashScreen.tsx`, `src/screens/ChatThreadScreen.tsx` keyboard lift, `src/components/sheets/BottomSheet.tsx`, `src/components/AnimatedPager.tsx` gesture/focus logic, `HostRequestTabs` pager direction-lock, and the Event Details back-swipe disable.
- **`src/theme/springs.ts` values are frozen.** `Springs.snappy`, `press`, `bouncyUp`, `elegant` keep their exact numbers; `src/navigation/transitions.ts` is tuned against them.
- **Reduce motion is a completion requirement per task,** not a follow-up. Every animated primitive degrades via Reanimated's `useReducedMotion()`.
- **No `console.*`** — use `logger` from `src/services/logger.ts`.
- **No `expo-haptics` imports** outside `src/services/haptics.ts` — use `triggerHaptic`.
- **No hardcoded hex** outside `src/theme`, `src/utils/avatar.ts`, `src/components/ConfettiOverlay.tsx`.
- **Import order:** React → React Native → external → internal aliases (`@theme/*`, `@components/*`, …) → relative.
- **Prettier:** `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`.
- **Animate transforms and opacity only** inside list rows. No layout-affecting animated properties there.
- **Lint:** `npm run lint` must not gain warnings above the existing baseline.

---

## File Structure

**Phase 0 — foundation**

| File | Responsibility |
| --- | --- |
| `src/__tests__/mocks/mockModules.ts` (modify) | Reanimated mock: add `useReducedMotion`, layout-animation builders, `Layout`/`LinearTransition`, real `interpolate`, `Animated.SectionList` |
| `src/utils/seededRandom.ts` (create) | Deterministic PRNG shared by confetti and tilt |
| `src/components/ConfettiOverlay.tsx` (modify) | Use the shared PRNG instead of its private copy |
| `src/theme/motion.ts` (create) | Scrapbook motion tokens |
| `src/theme/index.ts` (modify) | Re-export motion tokens |
| `src/components/motion/staggerDelay.ts` (create) | Pure capped-stagger function |
| `src/components/motion/Placed.tsx` (create) | Settle-into-place entry primitive |
| `src/components/motion/index.ts` (create) | Barrel |
| `src/components/ConnectionStatusIndicator.tsx` (modify) | RN `Animated` → Reanimated |
| `src/components/EventActionBadge.tsx` (modify) | RN `Animated` → Reanimated |

**Phase 1 — Discover**

| File | Responsibility |
| --- | --- |
| `src/components/events/EventSectionList.tsx` (modify) | Wrap rows in `<Placed>` |
| `src/components/ScalePressable.tsx` (modify) | Opt-in `tilt` prop |
| `src/components/ui/AppTabs.tsx` (modify) | Optional `pageOffsetSV` for a continuous indicator |
| `src/components/SegmentedControl.tsx` (modify) | Pass `pageOffsetSV` through |
| `src/screens/HomeScreen.tsx` (modify) | Feed its existing `pageOffset` to the control |

**Phase 2 — Event Details**

| File | Responsibility |
| --- | --- |
| `src/screens/EventDetailsScreen.tsx` (modify) | `Animated.ScrollView` + scroll handler |
| `src/screens/event-details/EventDetailsHero.tsx` (modify) | Parallax + cover drop-in |
| `src/screens/event-details/EventDetailsInfo.tsx` (modify) | Avatar stagger |
| `src/screens/event-details/EventDetailsCTA.tsx` (modify) | Join stamp |
| `src/screens/event-details/HostRequestTabs.tsx` (modify) | Request row exit |

---

## Task 1: Reanimated Jest mock coverage

The hand-rolled mock at `src/__tests__/mocks/mockModules.ts:334` lacks everything the new primitives need. This task is a hard prerequisite — without it every later task's tests fail for the wrong reason.

**Files:**
- Modify: `src/__tests__/mocks/mockModules.ts:334-390`
- Test: `src/__tests__/mocks/__tests__/reanimatedMock.test.tsx` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: mock exports `useReducedMotion(): boolean`, `interpolate(value, input, output, extrapolate?): number`, chainable builders `FadeIn`/`FadeOut`/`FadeInDown`/`FadeOutUp` each with `.delay(ms)`/`.duration(ms)`/`.springify()` returning themselves, `Layout`, `LinearTransition`, and `default.SectionList`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/mocks/__tests__/reanimatedMock.test.tsx`:

```tsx
import * as Reanimated from 'react-native-reanimated';

describe('reanimated jest mock', () => {
  it('exposes useReducedMotion defaulting to false', () => {
    expect(Reanimated.useReducedMotion()).toBe(false);
  });

  it('interpolates linearly between ranges', () => {
    expect(Reanimated.interpolate(0.5, [0, 1], [0, 100])).toBe(50);
    expect(Reanimated.interpolate(2, [0, 1], [0, 100], 'clamp')).toBe(100);
  });

  it('exposes chainable entering builders', () => {
    const builder = Reanimated.FadeInDown.delay(100).springify();
    expect(typeof builder.duration).toBe('function');
  });

  it('exposes an animated SectionList', () => {
    expect(Reanimated.default.SectionList).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/mocks/__tests__/reanimatedMock.test.tsx --runInBand`
Expected: FAIL — `Reanimated.useReducedMotion is not a function`.

- [ ] **Step 3: Extend the mock**

In `src/__tests__/mocks/mockModules.ts`, inside the `jest.mock('react-native-reanimated', ...)` factory, add `SectionList` and `FlatList` to the `require('react-native')` destructure, then add these before the closing `};` of the returned object, and replace the existing `interpolate: jest.fn(),` line:

```ts
    // Chainable layout-animation builder: every method returns the builder.
    useReducedMotion: () => false,
    interpolate: (
      value: number,
      input: number[],
      output: number[],
      extrapolate?: string,
    ) => {
      const last = input.length - 1;
      if (value <= input[0]) {
        return extrapolate === 'clamp' ? output[0] : output[0];
      }
      if (value >= input[last]) {
        return output[last];
      }
      let i = 0;
      while (i < last && value > input[i + 1]) i += 1;
      const span = input[i + 1] - input[i];
      const ratio = span === 0 ? 0 : (value - input[i]) / span;
      return output[i] + (output[i + 1] - output[i]) * ratio;
    },
```

Add `SectionList` and `FlatList` to both the `default:` object and the top-level exports alongside the existing `ScrollView`, then append the builders:

```ts
    FadeIn: makeBuilder(),
    FadeOut: makeBuilder(),
    FadeInDown: makeBuilder(),
    FadeOutUp: makeBuilder(),
    Layout: makeBuilder(),
    LinearTransition: makeBuilder(),
```

And define `makeBuilder` next to `runAnimation` at the top of the factory:

```ts
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    ['delay', 'duration', 'springify', 'damping', 'stiffness', 'withInitialValues'].forEach(
      (method) => {
        builder[method] = () => builder;
      },
    );
    return builder;
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/mocks/__tests__/reanimatedMock.test.tsx --runInBand`
Expected: PASS (4 tests)

- [ ] **Step 5: Confirm no existing suite regressed**

Run: `npm test`
Expected: same pass/fail counts as before this task. The `interpolate` change is the only behavioural edit to an existing mock export; no test asserts on it (verified by grep).

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/mocks/mockModules.ts src/__tests__/mocks/__tests__/reanimatedMock.test.tsx
git commit -m "test: extend reanimated jest mock for motion primitives"
```

---

## Task 2: Shared seeded random

`ConfettiOverlay` has a private `seededRand`. `<Placed>` needs the same determinism for tilt. Extract one implementation.

**Files:**
- Create: `src/utils/seededRandom.ts`
- Create: `src/utils/__tests__/seededRandom.test.ts`
- Modify: `src/components/ConfettiOverlay.tsx:69-72` (remove private copy, import shared)

**Interfaces:**
- Consumes: nothing.
- Produces: `seededRand(seed: number): number` returning `[0, 1)`; `seedFromString(value: string): number`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/seededRandom.test.ts`:

```ts
import { seedFromString, seededRand } from '../seededRandom';

describe('seededRand', () => {
  it('returns the same value for the same seed', () => {
    expect(seededRand(7)).toBe(seededRand(7));
  });

  it('returns a value in [0, 1)', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = seededRand(i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('varies across seeds', () => {
    expect(seededRand(1)).not.toBe(seededRand(2));
  });
});

describe('seedFromString', () => {
  it('is stable for the same string', () => {
    expect(seedFromString('event-42')).toBe(seedFromString('event-42'));
  });

  it('differs across strings', () => {
    expect(seedFromString('event-42')).not.toBe(seedFromString('event-43'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/__tests__/seededRandom.test.ts --runInBand`
Expected: FAIL — cannot find module `../seededRandom`.

- [ ] **Step 3: Create the module**

Create `src/utils/seededRandom.ts`:

```ts
/**
 * Deterministic pseudo-random helpers shared by the confetti engine and the
 * scrapbook motion primitives. Determinism matters for motion: a card must get
 * the same tilt on every render, or it jitters on re-render and list recycling.
 */

/** Deterministic value in [0, 1) for a numeric seed. */
export const seededRand = (seed: number): number => {
  'worklet';
  const x = Math.sin(seed + 1) * 39482.3741;
  return x - Math.floor(x);
};

/** Stable numeric seed for a string id (djb2). */
export const seedFromString = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash % 100000);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/__tests__/seededRandom.test.ts --runInBand`
Expected: PASS (5 tests)

- [ ] **Step 5: Point ConfettiOverlay at the shared helper**

In `src/components/ConfettiOverlay.tsx`, delete the local function:

```ts
function seededRand(seed: number): number {
    const x = Math.sin(seed + 1) * 39482.3741;
    return x - Math.floor(x);
}
```

and add to the imports (after the reanimated import):

```ts
import { seededRand } from "@utils/seededRandom";
```

- [ ] **Step 6: Verify confetti is unchanged**

Run: `npx jest src/screens/__tests__/MyEventsScreen.rendering.test.tsx --runInBand --silent`
Expected: PASS. The implementation is byte-identical, so particle layout does not change.

- [ ] **Step 7: Commit**

```bash
git add src/utils/seededRandom.ts src/utils/__tests__/seededRandom.test.ts src/components/ConfettiOverlay.tsx
git commit -m "refactor: extract shared seeded random from confetti engine"
```

---

## Task 3: Motion tokens

**Files:**
- Create: `src/theme/motion.ts`
- Modify: `src/theme/index.ts`
- Create: `src/theme/__tests__/motion.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Motion.settle` (spring config `{ mass, stiffness, damping }`), `motionTiming.staggerStepMs`, `motionTiming.staggerMaxSteps`, `motionTiming.entryFadeMs`, `motionGeometry.tiltMaxDeg`, `motionGeometry.entryTranslateY`, `motionGeometry.entryScaleFrom`.

- [ ] **Step 1: Write the failing test**

Create `src/theme/__tests__/motion.test.ts`:

```ts
import { Springs } from '../springs';
import { Motion, motionGeometry, motionTiming } from '../motion';

describe('motion tokens', () => {
  it('caps stagger so long lists do not crawl', () => {
    expect(motionTiming.staggerMaxSteps * motionTiming.staggerStepMs).toBeLessThanOrEqual(300);
  });

  it('keeps tilt subtle', () => {
    expect(motionGeometry.tiltMaxDeg).toBeLessThanOrEqual(3);
  });

  it('exposes a settle spring distinct from the frozen presets', () => {
    expect(Motion.settle).toEqual(
      expect.objectContaining({
        mass: expect.any(Number),
        stiffness: expect.any(Number),
        damping: expect.any(Number),
      }),
    );
    expect(Motion.settle).not.toEqual(Springs.snappy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/theme/__tests__/motion.test.ts --runInBand`
Expected: FAIL — cannot find module `../motion`.

- [ ] **Step 3: Create the tokens**

Create `src/theme/motion.ts`:

```ts
// Scrapbook motion tokens. These sit alongside `Springs` (src/theme/springs.ts),
// which stays frozen because src/navigation/transitions.ts is tuned against it.
//
// The feel: items are photographs being placed onto a page. They arrive slightly
// tilted and a little low, then settle with one small overshoot.

/** Spring for an item settling onto the page. One gentle overshoot, then rest. */
export const Motion = {
  settle: { mass: 0.6, stiffness: 180, damping: 16 },
} as const;

export const motionTiming = {
  /** Delay added per item in a staggered group. */
  staggerStepMs: 45,
  /** Hard cap on stagger steps. A 200-row list must not take 9 seconds. */
  staggerMaxSteps: 6,
  /** Opacity-only fade used as the reduced-motion fallback. */
  entryFadeMs: 160,
} as const;

export const motionGeometry = {
  /** Maximum resting/entry rotation for a placed item, in degrees. */
  tiltMaxDeg: 1.5,
  /** How far below its resting position an entering item starts. */
  entryTranslateY: 14,
  /** Scale an entering item starts at. */
  entryScaleFrom: 0.97,
} as const;
```

Then add to `src/theme/index.ts`, after the `springs` line:

```ts
export * from './motion';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/theme/__tests__/motion.test.ts --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify no export collision**

Run: `npm run typecheck`
Expected: clean. `motion.ts` deliberately does not re-export `Springs`, so `export *` from both files cannot collide.

- [ ] **Step 6: Commit**

```bash
git add src/theme/motion.ts src/theme/index.ts src/theme/__tests__/motion.test.ts
git commit -m "feat: add scrapbook motion tokens"
```

---

## Task 4: Capped stagger delay

**Files:**
- Create: `src/components/motion/staggerDelay.ts`
- Create: `src/components/motion/__tests__/staggerDelay.test.ts`

**Interfaces:**
- Consumes: `motionTiming` from Task 3.
- Produces: `staggerDelayMs(index: number): number`.

- [ ] **Step 1: Write the failing test**

Create `src/components/motion/__tests__/staggerDelay.test.ts`:

```ts
import { motionTiming } from '@theme/motion';

import { staggerDelayMs } from '../staggerDelay';

describe('staggerDelayMs', () => {
  it('scales with index', () => {
    expect(staggerDelayMs(0)).toBe(0);
    expect(staggerDelayMs(2)).toBe(2 * motionTiming.staggerStepMs);
  });

  it('caps so long lists do not crawl', () => {
    const cap = motionTiming.staggerMaxSteps * motionTiming.staggerStepMs;
    expect(staggerDelayMs(500)).toBe(cap);
  });

  it('treats negative indices as zero', () => {
    expect(staggerDelayMs(-3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/motion/__tests__/staggerDelay.test.ts --runInBand`
Expected: FAIL — cannot find module `../staggerDelay`.

- [ ] **Step 3: Implement**

Create `src/components/motion/staggerDelay.ts`:

```ts
import { motionTiming } from '@theme/motion';

/**
 * Entry delay for the item at `index` in a staggered group, capped at
 * `motionTiming.staggerMaxSteps` so long lists finish arriving quickly.
 */
export const staggerDelayMs = (index: number): number => {
  const clamped = Math.min(Math.max(index, 0), motionTiming.staggerMaxSteps);
  return clamped * motionTiming.staggerStepMs;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/motion/__tests__/staggerDelay.test.ts --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/motion/staggerDelay.ts src/components/motion/__tests__/staggerDelay.test.ts
git commit -m "feat: add capped stagger delay helper"
```

---

## Task 5: The `<Placed>` primitive

The signature primitive. An item fades in, rises, scales up, and un-tilts as it settles — or, with `tiltMode="rest"`, settles *to* a slight angle like a photo laid on a page.

**Files:**
- Create: `src/components/motion/Placed.tsx`
- Create: `src/components/motion/index.ts`
- Create: `src/components/motion/__tests__/Placed.test.tsx`

**Interfaces:**
- Consumes: `Motion`, `motionGeometry` (Task 3), `staggerDelayMs` (Task 4), `seedFromString`/`seededRand` (Task 2).
- Produces: default export `Placed` with props `{ id: string; index?: number; tiltMode?: 'entry' | 'rest' | 'none'; style?: StyleProp<ViewStyle>; testID?: string; children: ReactNode }`, and named export `resetPlacedIds(): void` for tests.

- [ ] **Step 1: Write the failing test**

Create `src/components/motion/__tests__/Placed.test.tsx`:

```tsx
import React from 'react';

import { Text } from 'react-native';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import Placed, { resetPlacedIds } from '../Placed';

describe('Placed', () => {
  beforeEach(() => {
    resetPlacedIds();
    jest.restoreAllMocks();
  });

  it('renders its children', () => {
    const { getByText } = render(
      <Placed id="a">
        <Text>Card</Text>
      </Placed>,
    );
    expect(getByText('Card')).toBeTruthy();
  });

  it('animates the first time an id is placed', () => {
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(
      <Placed id="first">
        <Text>Card</Text>
      </Placed>,
    );
    expect(spring).toHaveBeenCalled();
  });

  it('does not re-animate an id that has already been placed', () => {
    render(
      <Placed id="repeat">
        <Text>Card</Text>
      </Placed>,
    );
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(
      <Placed id="repeat">
        <Text>Card</Text>
      </Placed>,
    );
    expect(spring).not.toHaveBeenCalled();
  });

  it('skips animation entirely when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const { getByText } = render(
      <Placed id="reduced">
        <Text>Card</Text>
      </Placed>,
    );
    expect(getByText('Card')).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/motion/__tests__/Placed.test.tsx --runInBand`
Expected: FAIL — cannot find module `../Placed`.

- [ ] **Step 3: Implement the primitive**

Create `src/components/motion/Placed.tsx`:

```tsx
/* eslint-disable react-hooks/immutability -- Reanimated entry animation mutates a shared value from an effect. */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import { StyleProp, View, ViewStyle } from 'react-native';

import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { Motion, motionGeometry } from '@theme/motion';
import { seedFromString, seededRand } from '@utils/seededRandom';

import { staggerDelayMs } from './staggerDelay';

/**
 * Ids that have already played their entry. An item animates once per id, so
 * SectionList cell recycling, pager page changes, and re-renders do not re-fire
 * entries on rows the user has already seen.
 */
const placedIds = new Set<string>();
const PLACED_ID_LIMIT = 500;

/** Test seam: forget every placed id. */
export const resetPlacedIds = (): void => {
  placedIds.clear();
};

/** Deterministic resting/entry angle for an id, in degrees. */
const tiltForId = (id: string): number =>
  (seededRand(seedFromString(id)) * 2 - 1) * motionGeometry.tiltMaxDeg;

export type PlacedTiltMode = 'entry' | 'rest' | 'none';

export type PlacedProps = {
  /** Stable identity. Entry plays once per id for the app's lifetime. */
  id: string;
  /** Position within a staggered group. Delay is capped by staggerDelayMs. */
  index?: number;
  /**
   * 'entry' starts tilted and settles square — right for text rows.
   * 'rest' settles to a slight angle — right for photo cards.
   * 'none' never rotates.
   */
  tiltMode?: PlacedTiltMode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/**
 * Settles its children onto the page like a placed photograph: fade in, rise,
 * scale up, and un-tilt (or settle to a slight angle).
 *
 * Honours reduce motion by rendering a plain, static View.
 */
const Placed = ({
  id,
  index = 0,
  tiltMode = 'entry',
  style,
  testID,
  children,
}: PlacedProps) => {
  const reducedMotion = useReducedMotion();
  const alreadyPlaced = useRef(placedIds.has(id)).current;
  const shouldAnimate = !reducedMotion && !alreadyPlaced;

  const progress = useSharedValue(shouldAnimate ? 0 : 1);
  const tilt = useMemo(() => (tiltMode === 'none' ? 0 : tiltForId(id)), [id, tiltMode]);
  const restTilt = tiltMode === 'rest' ? tilt : 0;

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }
    if (placedIds.size >= PLACED_ID_LIMIT) {
      placedIds.clear();
    }
    placedIds.add(id);
    progress.value = withDelay(staggerDelayMs(index), withSpring(1, Motion.settle));
  }, [id, index, progress, shouldAnimate]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const angle = restTilt + (tilt - restTilt) * (1 - p);
    return {
      opacity: p,
      transform: [
        { translateY: (1 - p) * motionGeometry.entryTranslateY },
        { scale: motionGeometry.entryScaleFrom + (1 - motionGeometry.entryScaleFrom) * p },
        { rotate: `${angle}deg` },
      ],
    };
  });

  if (reducedMotion) {
    return (
      <View style={style} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={[style, animatedStyle]} testID={testID}>
      {children}
    </Animated.View>
  );
};

export default Placed;
```

Create `src/components/motion/index.ts`:

```ts
export { default as Placed, resetPlacedIds } from './Placed';
export type { PlacedProps, PlacedTiltMode } from './Placed';
export { staggerDelayMs } from './staggerDelay';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/motion/__tests__/Placed.test.tsx --runInBand`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/components/motion/
git commit -m "feat: add Placed scrapbook entry primitive"
```

---

## Task 6: Migrate ConnectionStatusIndicator to Reanimated

A pulsing dot loop, currently on RN `Animated`. Small, decorative, self-contained — the safe half of the consolidation.

**Files:**
- Modify: `src/components/ConnectionStatusIndicator.tsx`
- Create: `src/components/__tests__/ConnectionStatusIndicator.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from Reanimated.
- Produces: no public API change — same props, same testIDs.

Current signature (do not change it): `{ visible: boolean; label?: string; testID?: string }`, with `PULSE_MIN = 0.35`, `PULSE_MAX = 1`, `PULSE_DURATION_MS = 900`. The component returns `null` when `!visible`, and the pulse runs only while visible.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ConnectionStatusIndicator.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import ConnectionStatusIndicator from '../ConnectionStatusIndicator';

describe('ConnectionStatusIndicator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<ConnectionStatusIndicator visible={false} />);
    expect(queryByText('Connecting')).toBeNull();
  });

  it('pulses when motion is allowed', () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    render(<ConnectionStatusIndicator visible />);
    expect(repeat).toHaveBeenCalled();
  });

  it('does not pulse when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const { getByText } = render(<ConnectionStatusIndicator visible />);
    expect(getByText('Connecting')).toBeTruthy();
    expect(repeat).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/ConnectionStatusIndicator.test.tsx --runInBand`
Expected: FAIL — `withRepeat` not called (component still uses RN `Animated`).

- [ ] **Step 3: Migrate**

Replace the RN `Animated` import with Reanimated (keep `StyleSheet`, `Text`, `View` from `react-native`; drop `Easing` and `useState`), swap `useState(() => new Animated.Value(PULSE_MAX))` for `useSharedValue(PULSE_MAX)`, and replace the `Animated.loop(Animated.sequence([...]))` effect with:

```tsx
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.value = PULSE_MAX;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(PULSE_MIN, { duration: PULSE_DURATION_MS }),
        withTiming(PULSE_MAX, { duration: PULSE_DURATION_MS }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion, visible]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
```

and render `<Animated.View style={[styles.dot, dotStyle]} />`, where `Animated` is now the Reanimated default export. Keep `PULSE_MIN`, `PULSE_MAX`, `PULSE_DURATION_MS`, the `!visible` early return, the `accessibilityLabel`, and every style exactly as they are.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/ConnectionStatusIndicator.test.tsx --runInBand`
Expected: PASS (3 tests)

- [ ] **Step 5: Check consumers still render**

Run: `npx jest src/screens/__tests__/ChatThreadScreen.rendering.test.tsx --runInBand --silent`
Expected: PASS — unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConnectionStatusIndicator.tsx src/components/__tests__/ConnectionStatusIndicator.test.tsx
git commit -m "refactor: move ConnectionStatusIndicator to reanimated"
```

---

## Task 7: Migrate EventActionBadge to Reanimated

The toast that says "Plan deleted", "Welcome to WEIF", and so on. Migrating it now sets up the Phase 3 stamp upgrade. It has a `PanResponder` swipe-to-dismiss that must keep working.

**Files:**
- Modify: `src/components/EventActionBadge.tsx`
- Create: `src/components/__tests__/EventActionBadge.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion`, `runOnJS`, `withSequence`, `withDelay` from Reanimated.
- Produces: no public API change — props stay `{ visible, label, topOffset?, onHidden? }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/EventActionBadge.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import EventActionBadge from '../EventActionBadge';

describe('EventActionBadge', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders its label when visible', () => {
    const { getByText } = render(<EventActionBadge visible label="Plan deleted" />);
    expect(getByText('Plan deleted')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(<EventActionBadge visible={false} label="Plan deleted" />);
    expect(queryByText('Plan deleted')).toBeNull();
  });

  it('animates its entry with a spring', () => {
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(<EventActionBadge visible label="Welcome" />);
    expect(spring).toHaveBeenCalled();
  });

  it('appears without a spring when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const { getByText } = render(<EventActionBadge visible label="Welcome" />);
    expect(getByText('Welcome')).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/EventActionBadge.test.tsx --runInBand`
Expected: FAIL on the spring assertions — the component still uses RN `Animated`.

- [ ] **Step 3: Migrate**

Replace `Animated` from `react-native` with Reanimated (keep `PanResponder`, `StyleSheet`, `Text`, `View` from `react-native`). Replace the two `useRef(new Animated.Value(...))` with shared values, and replace the visibility effect body with:

```tsx
  const reducedMotion = useReducedMotion();

  const finish = useCallback(() => {
    setIsRendered(false);
    onHiddenRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);
    opacity.value = withTiming(0, { duration: FADE_MS });
    translateY.value = withTiming(-80, { duration: FADE_MS }, (finished) => {
      if (finished) {
        runOnJS(finish)();
      }
    });
  }, [finish, opacity, translateY]);

  useEffect(() => {
    cancelAnimation(translateY);
    cancelAnimation(opacity);

    if (!visible) {
      setIsRendered(false);
      translateY.value = -80;
      opacity.value = 0;
      return;
    }

    setIsRendered(true);
    translateY.value = -80;
    opacity.value = 0;

    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = withSequence(
        withTiming(1, { duration: FADE_MS }),
        withDelay(BADGE_HOLD_MS, withTiming(0, { duration: FADE_MS }, (finished) => {
          if (finished) {
            runOnJS(finish)();
          }
        })),
      );
      return;
    }

    opacity.value = withSequence(
      withTiming(1, { duration: FADE_MS }),
      withDelay(BADGE_HOLD_MS, withTiming(0, { duration: FADE_MS })),
    );
    translateY.value = withSequence(
      withSpring(0, Springs.bouncyUp),
      withDelay(BADGE_HOLD_MS, withTiming(-80, { duration: FADE_MS }, (finished) => {
        if (finished) {
          runOnJS(finish)();
        }
      })),
    );
  }, [finish, opacity, reducedMotion, translateY, visible]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
```

Render `<Animated.View style={[styles.badge, { top: topOffset }, badgeStyle]} {...panResponder.panHandlers}>`. Add `useCallback` to the React import and drop the now-unused `animationRef`. Keep `BADGE_HOLD_MS`, `FADE_MS`, `Springs.bouncyUp`, the `PanResponder`, and every style unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/EventActionBadge.test.tsx --runInBand`
Expected: PASS (4 tests)

- [ ] **Step 5: Check the screens that host badges**

Run: `npx jest src/screens/__tests__/HomeScreen.rendering.test.tsx src/screens/__tests__/MyEventsScreen.rendering.test.tsx --runInBand --silent`
Expected: PASS — unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/EventActionBadge.tsx src/components/__tests__/EventActionBadge.test.tsx
git commit -m "refactor: move EventActionBadge to reanimated"
```

---

## Task 8: Phase 0 gate — full validation

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS, with no suites failing that passed before Phase 0.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new warnings above the existing baseline.

- [ ] **Step 4: Format touched files**

Run: `npx prettier --write src/theme/motion.ts src/utils/seededRandom.ts "src/components/motion/**/*.{ts,tsx}" src/components/ConnectionStatusIndicator.tsx src/components/EventActionBadge.tsx`

- [ ] **Step 5: Commit any formatting**

```bash
git add -A && git commit -m "style: format motion foundation" || echo "nothing to format"
```

---

## Task 9: Staggered card settle on Discover

**Files:**
- Modify: `src/components/events/EventSectionList.tsx:93-98` (the `renderItem` callback)
- Modify: `src/components/events/__tests__/` — create `EventSectionList.test.tsx`

**Interfaces:**
- Consumes: `Placed` from `@components/motion`.
- Produces: no public API change to `EventSectionList`.

- [ ] **Step 1: Write the failing test**

Create `src/components/events/__tests__/EventSectionList.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';

import { resetPlacedIds } from '@components/motion';

import EventSectionList from '../EventSectionList';

const sections = [
  {
    title: 'Today',
    data: [
      {
        id: 'e1',
        title: 'Pub quiz',
        location: 'Dublin',
        time: '19:00',
        audience: 'Everyone',
        imageUri: 'https://example.test/a.jpg',
      },
      {
        id: 'e2',
        title: 'Five-a-side',
        location: 'Dublin',
        time: '20:00',
        audience: 'Everyone',
        imageUri: 'https://example.test/b.jpg',
      },
    ],
  },
];

describe('EventSectionList', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('wraps each row in a Placed entry keyed by event id', () => {
    const { getByTestId } = render(
      <EventSectionList sections={sections} onEventPress={jest.fn()} />,
    );
    expect(getByTestId('placed-e1')).toBeTruthy();
    expect(getByTestId('placed-e2')).toBeTruthy();
  });

  it('still renders the event titles', () => {
    const { getByText } = render(
      <EventSectionList sections={sections} onEventPress={jest.fn()} />,
    );
    expect(getByText('Pub quiz')).toBeTruthy();
    expect(getByText('Five-a-side')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/events/__tests__/EventSectionList.test.tsx --runInBand`
Expected: FAIL — no element with testID `placed-e1`.

- [ ] **Step 3: Wrap rows**

In `src/components/events/EventSectionList.tsx`, add the import:

```ts
import { Placed } from '@components/motion';
```

and change `renderItem` to pass the per-section index through:

```tsx
  const renderItem = useCallback(
    ({ item, index }: SectionListRenderItemInfo<TItem, EventSection<TItem>>) => (
      <Placed id={item.id} index={index} testID={`placed-${item.id}`}>
        <EventCardRow item={item} onPress={onEventPress} />
      </Placed>
    ),
    [onEventPress],
  );
```

The index is per-section deliberately: each date group cascades on its own, which reads better than one continuous ramp down a long list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/events/__tests__/EventSectionList.test.tsx --runInBand`
Expected: PASS (2 tests)

- [ ] **Step 5: Check the screens that use the list**

Run: `npx jest src/screens/__tests__/HomeScreen.rendering.test.tsx src/screens/__tests__/MyEventsScreen.rendering.test.tsx src/screens/__tests__/PastEventsScreen.rendering.test.tsx --runInBand --silent`
Expected: PASS. If a suite asserts on exact view hierarchy depth, update that assertion — the extra wrapper is intentional.

- [ ] **Step 6: Commit**

```bash
git add src/components/events/EventSectionList.tsx src/components/events/__tests__/EventSectionList.test.tsx
git commit -m "feat: settle discover cards into place on entry"
```

---

## Task 10: Opt-in tilt on ScalePressable

**Files:**
- Modify: `src/components/ScalePressable.tsx`
- Modify: `src/components/__tests__/ScalePressable.test.tsx`
- Modify: `src/components/events/EventSectionList.tsx:47-58` (`EventCardRow` opts in)

**Interfaces:**
- Consumes: `motionGeometry`, `seedFromString`, `seededRand`.
- Produces: `ScalePressableProps` gains `tilt?: boolean` (default `false`) and `tiltSeed?: string`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/__tests__/ScalePressable.test.tsx`:

```tsx
  it('does not rotate by default', () => {
    const { getByTestId } = render(
      <ScalePressable onPress={jest.fn()} testID="plain">
        <Text>Tap</Text>
      </ScalePressable>,
    );
    fireEvent(getByTestId('plain'), 'pressIn');
    const transforms = getByTestId('plain-content').props.style
      .flat()
      .find((s: { transform?: unknown[] }) => s?.transform)?.transform;
    expect(JSON.stringify(transforms)).not.toContain('rotate');
  });

  it('rotates on press when tilt is enabled', () => {
    const { getByTestId } = render(
      <ScalePressable onPress={jest.fn()} tilt tiltSeed="card-1" testID="tilted">
        <Text>Tap</Text>
      </ScalePressable>,
    );
    fireEvent(getByTestId('tilted'), 'pressIn');
    const transforms = getByTestId('tilted-content').props.style
      .flat()
      .find((s: { transform?: unknown[] }) => s?.transform)?.transform;
    expect(JSON.stringify(transforms)).toContain('rotate');
  });
```

Add whatever imports the existing file is missing (`fireEvent`, `Text`). Read the existing test file first and match its style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/ScalePressable.test.tsx --runInBand`
Expected: FAIL — the tilted case has no `rotate` transform.

- [ ] **Step 3: Add the opt-in prop**

In `src/components/ScalePressable.tsx`, add to `ScalePressableProps`:

```ts
  /** Adds a small scrapbook counter-rotation alongside the press scale. */
  tilt?: boolean;
  /** Stable seed for the tilt angle. Defaults to the testID, then to the label. */
  tiltSeed?: string;
```

Add `tilt = false` and `tiltSeed` to the destructured params, then:

```tsx
  const rotation = useSharedValue(0);
  const tiltAngle = useMemo(() => {
    if (!tilt) return 0;
    const seed = tiltSeed ?? testID ?? accessibilityLabel ?? 'scale-pressable';
    return (seededRand(seedFromString(seed)) * 2 - 1) * motionGeometry.tiltMaxDeg;
  }, [accessibilityLabel, testID, tilt, tiltSeed]);

  const animStyle = useAnimatedStyle(() =>
    tilt
      ? {
          transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
        }
      : { transform: [{ scale: scale.value }] },
  );
```

Set `rotation.value = withSpring(tiltAngle, Springs.snappy)` wherever the handler currently sets `scale.value = withSpring(0.96, Springs.snappy)`, and `rotation.value = withSpring(0, Springs.press)` in `onPressOut` beside the existing scale reset. Add `testID={testID ? `${testID}-content` : undefined}` to the inner `Animated.View` so the test can read its style.

Add the imports: `useMemo` from React, `motionGeometry` from `@theme/motion`, and `seedFromString`/`seededRand` from `@utils/seededRandom`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/components/__tests__/ScalePressable.test.tsx --runInBand`
Expected: PASS, including the pre-existing tests.

- [ ] **Step 5: Opt the event card row in**

In `src/components/events/EventSectionList.tsx`, change `EventCardRow`'s `ScalePressable` to:

```tsx
  <ScalePressable
    onPress={() => {
      triggerHaptic('light');
      onPress(item);
    }}
    delay={80}
    tilt
    tiltSeed={item.id}
  >
```

- [ ] **Step 6: Verify nothing else changed**

Run: `npm test`
Expected: PASS. `tilt` defaults to `false`, so every other `ScalePressable` call site keeps its exact current feel.

- [ ] **Step 7: Commit**

```bash
git add src/components/ScalePressable.tsx src/components/__tests__/ScalePressable.test.tsx src/components/events/EventSectionList.tsx
git commit -m "feat: add opt-in tilt to ScalePressable and use it on event cards"
```

---

## Task 11: Continuous sort indicator on Discover

`HomeScreen.tsx:91` already computes `pageOffset` and passes it to `AnimatedPager`, but the pill snaps. Make it track the finger.

**Files:**
- Modify: `src/components/ui/AppTabs.tsx`
- Modify: `src/components/SegmentedControl.tsx`
- Modify: `src/screens/HomeScreen.tsx` (pass `pageOffset` to `SegmentedControl`)
- Modify: `src/components/__tests__/SegmentedControl.test.tsx`

**Interfaces:**
- Consumes: `pageOffsetSV` — the same `SharedValue<number>` `AnimatedPager` already writes, a continuous page index in `[0, n-1]`.
- Produces: `AppTabsProps` and `SegmentedControlProps` each gain `pageOffsetSV?: SharedValue<number>`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/__tests__/SegmentedControl.test.tsx`:

```tsx
  it('accepts a page offset shared value without changing rendered labels', () => {
    const pageOffsetSV = { value: 0.5 } as unknown as SharedValue<number>;
    const { getByText } = render(
      <SegmentedControl
        options={[
          { label: 'Upcoming', value: 'upcoming' },
          { label: 'Newest', value: 'newest' },
        ]}
        value="upcoming"
        onChange={jest.fn()}
        pageOffsetSV={pageOffsetSV}
      />,
    );
    expect(getByText('Upcoming')).toBeTruthy();
    expect(getByText('Newest')).toBeTruthy();
  });
```

Import `type SharedValue` from `react-native-reanimated` at the top of that test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/components/__tests__/SegmentedControl.test.tsx --runInBand`
Expected: FAIL — TypeScript rejects the unknown `pageOffsetSV` prop.

- [ ] **Step 3: Thread the shared value through AppTabs**

In `src/components/ui/AppTabs.tsx`, add `useDerivedValue` and `type SharedValue` to the Reanimated import. Add to `AppTabsProps`:

```ts
  /**
   * Continuous page index from AnimatedPager. When supplied, the indicator
   * tracks the swipe instead of springing on selection change.
   */
  pageOffsetSV?: SharedValue<number>;
```

Add `index: number` and `pageOffsetSV?: SharedValue<number>` to `AppTabProps`, and inside `AppTab` replace the `progress` shared value with:

```tsx
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withSpring(selected ? 1 : 0, Springs.snappy);
  }, [selectedProgress, selected]);

  const progress = useDerivedValue(() => {
    if (!pageOffsetSV) {
      return selectedProgress.value;
    }
    const distance = Math.abs(pageOffsetSV.value - index);
    return Math.min(Math.max(1 - distance, 0), 1);
  });
```

The four `useAnimatedStyle` blocks already read `progress.value` and need no change. In the `AppTabs` body, pass the index and the shared value down:

```tsx
    {options.map((option, index) => (
      <AppTab
        key={option.value}
        option={option}
        index={index}
        pageOffsetSV={pageOffsetSV}
        selected={option.value === value}
        variant={variant}
        onPress={() => onChange(option.value)}
        testIDPrefix={testIDPrefix}
      />
    ))}
```

- [ ] **Step 4: Pass it through SegmentedControl**

In `src/components/SegmentedControl.tsx`, add `pageOffsetSV?: SharedValue<number>` to `SegmentedControlProps`, accept it, and forward it to `AppTabs`. Import `type SharedValue` from `react-native-reanimated`.

- [ ] **Step 5: Wire HomeScreen**

In `src/screens/HomeScreen.tsx`, add `pageOffsetSV={pageOffset}` to the `<SegmentedControl>` element. `pageOffset` already exists at line 91 and is already passed to `AnimatedPager` as `pageOffsetSV`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest src/components/__tests__/SegmentedControl.test.tsx src/screens/__tests__/HomeScreen.rendering.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 7: Verify other AppTabs consumers are untouched**

Run: `npx jest src/screens/__tests__/EventDetailsScreen.rendering.test.tsx src/screens/__tests__/MessagesScreen.rendering.test.tsx --runInBand --silent`
Expected: PASS. `pageOffsetSV` is optional; absent means the previous spring-on-selection behaviour.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/AppTabs.tsx src/components/SegmentedControl.tsx src/screens/HomeScreen.tsx src/components/__tests__/SegmentedControl.test.tsx
git commit -m "feat: track pager swipe with the discover sort indicator"
```

---

## Task 12: Phase 1 device verification

Phase 1 is user-visible. Verify before moving on.

- [ ] **Step 1: Full validation**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green, no new lint warnings.

- [ ] **Step 2: Device smoke test**

Use the `test-on-device` skill (`.pi/skills/test-on-device/`) on the `WEIF_API_36` emulator. Per-session setup is in `CLAUDE.md`. Verify:

- Discover cards cascade in on first load, each slightly tilted, settling square.
- Scrolling down and back up does **not** replay entries on already-seen cards.
- Switching sort tabs does not replay entries.
- Dragging between sort pages moves the pill continuously with the finger.
- Pressing a card tilts and scales it.
- My Events and Past Events still render their lists correctly.

- [ ] **Step 3: Record the result**

Append a pass/fail verdict to `TEST_RUNS.md` following the existing format in that file.

- [ ] **Step 4: Commit**

```bash
git add TEST_RUNS.md && git commit -m "test: record phase 1 motion device verification"
```

---

## Task 13: Parallax hero on Event Details

**Files:**
- Modify: `src/screens/EventDetailsScreen.tsx:359-365`
- Modify: `src/screens/event-details/EventDetailsHero.tsx`
- Create: `src/screens/event-details/__tests__/EventDetailsHero.test.tsx`

**Interfaces:**
- Consumes: `Placed` (Task 5).
- Produces: `EventDetailsHeroProps` gains `scrollY?: SharedValue<number>`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/event-details/__tests__/EventDetailsHero.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';

import { resetPlacedIds } from '@components/motion';

import EventDetailsHero from '../EventDetailsHero';

const Harness = () => {
  const scrollY = useSharedValue(0);
  return <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} scrollY={scrollY} />;
};

describe('EventDetailsHero', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('renders without a scroll value', () => {
    const { getByTestId } = render(
      <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />,
    );
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });

  it('renders with a scroll value', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsHero.test.tsx --runInBand`
Expected: FAIL — no element with testID `hero-cover-card`.

- [ ] **Step 3: Add parallax and the cover drop-in**

Rewrite `src/screens/event-details/EventDetailsHero.tsx`:

```tsx
import { View } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { Placed } from '@components/motion';

import styles from './EventDetailsScreen.styles';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Backdrop drifts at this fraction of scroll speed. */
const BACKDROP_RATE = 0.5;
/** Cover card drifts slightly faster than the backdrop but slower than content. */
const COVER_RATE = 0.2;

type EventDetailsHeroProps = {
  imageUri: string;
  topInset: number;
  /** Vertical scroll offset of the host ScrollView, for parallax. */
  scrollY?: SharedValue<number>;
};

/**
 * Event Details hero: blurred background image, dark/light overlays, and the
 * elevated square cover card.
 *
 * The backdrop and the cover card drift at different rates as the page scrolls
 * away. The host ScrollView keeps `bounces={false}`, so this is scroll-away
 * parallax only — there is no stretchy pull-down.
 */
const EventDetailsHero = ({ imageUri, topInset, scrollY }: EventDetailsHeroProps) => {
  const reducedMotion = useReducedMotion();

  const backdropStyle = useAnimatedStyle(() => {
    if (!scrollY || reducedMotion) {
      return {};
    }
    return { transform: [{ translateY: scrollY.value * BACKDROP_RATE }] };
  });

  const coverStyle = useAnimatedStyle(() => {
    if (!scrollY || reducedMotion) {
      return {};
    }
    return { transform: [{ translateY: scrollY.value * COVER_RATE }] };
  });

  return (
    <View style={[styles.heroContainer, { height: 320 + topInset, paddingTop: topInset + 10 }]}>
      <AnimatedImage
        source={{ uri: imageUri }}
        style={[styles.heroBackgroundImage, backdropStyle]}
        contentFit="cover"
        blurRadius={28}
        transition={150}
      />
      <View pointerEvents="none" style={styles.heroOverlayDark} />
      <View pointerEvents="none" style={styles.heroOverlayLight} />

      {/* Elevated Image Card — settles onto the page like a placed photo. */}
      <Animated.View style={[styles.imageCardContainer, coverStyle]}>
        <Placed id={`hero-${imageUri}`} tiltMode="rest" testID="hero-cover-card">
          <Image
            source={{ uri: imageUri }}
            style={styles.imageCard}
            contentFit="cover"
            transition={150}
          />
        </Placed>
      </Animated.View>
    </View>
  );
};

export default EventDetailsHero;
```

- [ ] **Step 4: Drive it from the screen**

In `src/screens/EventDetailsScreen.tsx`, add to the Reanimated imports:

```ts
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
```

Add near the other hooks:

```tsx
  const scrollY = useSharedValue(0);
  const handleScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
```

Change the `<ScrollView>` at line 359 to `<Animated.ScrollView onScroll={handleScroll} scrollEventThrottle={16}` keeping every existing prop — in particular `bounces={false}` and `alwaysBounceVertical={false}`, which the frozen gesture boundary depends on. Close it with `</Animated.ScrollView>`. Pass the value down:

```tsx
  <EventDetailsHero imageUri={event.imageUri} topInset={heroTopInset} scrollY={scrollY} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsHero.test.tsx src/screens/__tests__/EventDetailsScreen.rendering.test.tsx --runInBand`
Expected: PASS. If the screen suite queries the scroll view by type `ScrollView`, update it to the Reanimated animated scroll view — the mock maps `Animated.ScrollView` to the RN `ScrollView`, so most queries keep working.

- [ ] **Step 6: Commit**

```bash
git add src/screens/event-details/EventDetailsHero.tsx src/screens/EventDetailsScreen.tsx src/screens/event-details/__tests__/EventDetailsHero.test.tsx
git commit -m "feat: parallax event details hero with a settling cover card"
```

---

## Task 14: Going-avatar pop-in

**Files:**
- Modify: `src/screens/event-details/EventDetailsInfo.tsx:99-122`
- Create: `src/screens/event-details/__tests__/EventDetailsInfo.avatars.test.tsx`

**Interfaces:**
- Consumes: `Placed` (Task 5).
- Produces: no API change.

- [ ] **Step 1: Write the failing test**

Create `src/screens/event-details/__tests__/EventDetailsInfo.avatars.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';

import { resetPlacedIds } from '@components/motion';

import EventDetailsInfo from '../EventDetailsInfo';

const baseProps = {
  title: 'Pub quiz',
  hostLine: 'Hosted by Sam',
  readOnly: false,
  isSingleEvent: false,
  goingParticipants: [
    { id: 1, name: 'Ada', avatar: null },
    { id: 2, name: 'Bo', avatar: null },
  ],
  goingCount: 2,
  location: 'Dublin',
  scheduleLine: 'Tonight at 19:00',
  audienceLine: 'Everyone',
  description: 'Bring a team.',
};

describe('EventDetailsInfo going avatars', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('places each going avatar', () => {
    const { getByTestId } = render(<EventDetailsInfo {...baseProps} />);
    expect(getByTestId('placed-going-0')).toBeTruthy();
    expect(getByTestId('placed-going-1')).toBeTruthy();
  });

  it('keeps the existing going testIDs', () => {
    const { getByTestId } = render(<EventDetailsInfo {...baseProps} />);
    expect(getByTestId('going-avatar-0')).toBeTruthy();
    expect(getByTestId('going-count-label')).toBeTruthy();
  });
});
```

These props match `EventDetailsInfoProps` exactly, including `GoingParticipant = { id: number; name: string; avatar?: string | null }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsInfo.avatars.test.tsx --runInBand`
Expected: FAIL — no element with testID `placed-going-0`.

- [ ] **Step 3: Wrap the avatars**

In `src/screens/event-details/EventDetailsInfo.tsx`, add:

```ts
import { Placed } from '@components/motion';
```

and wrap each mapped avatar, keeping the existing `View`, styles, and testIDs inside:

```tsx
              {goingParticipants.slice(0, 3).map((participant, index) => (
                <Placed
                  key={participant.id}
                  id={`going-${participant.id}`}
                  index={index}
                  tiltMode="none"
                  testID={`placed-going-${index}`}
                >
                  <View
                    style={[styles.goingAvatarItem, index > 0 && styles.goingAvatarOverlap]}
                    testID={`going-avatar-${index}`}
                  >
                    {renderAvatar(participant, 24)}
                  </View>
                </Placed>
              ))}
```

Move the existing `key` onto `Placed` and drop it from the inner `View`. Use `tiltMode="none"` — overlapping circular avatars must not rotate or the overlap reads as broken.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsInfo.avatars.test.tsx src/screens/__tests__/EventDetailsScreen.rendering.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/event-details/EventDetailsInfo.tsx src/screens/event-details/__tests__/EventDetailsInfo.avatars.test.tsx
git commit -m "feat: pop in going avatars on event details"
```

---

## Task 15: Join CTA stamp

The highest-intent tap in the app. When a join request lands, the label should arrive like a rubber stamp.

**Files:**
- Modify: `src/screens/event-details/EventDetailsCTA.tsx`
- Create: `src/screens/event-details/__tests__/EventDetailsCTA.test.tsx`

**Interfaces:**
- Consumes: `Motion` (Task 3), `triggerHaptic` from `@services/haptics`.
- Produces: `EventDetailsCTAProps` gains `stampKey?: string` — change it to replay the stamp.

- [ ] **Step 1: Write the failing test**

Create `src/screens/event-details/__tests__/EventDetailsCTA.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import EventDetailsCTA from '../EventDetailsCTA';

const baseProps = {
  showStandardCta: true,
  showOpenChatCta: false,
  shouldShowInvitePrompt: false,
  hasPendingRequest: false,
  ctaLabel: 'Interested',
  isOwner: false,
  bottomInset: 0,
  onCtaPress: jest.fn(),
  onOpenChat: jest.fn(),
};

describe('EventDetailsCTA', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the cta label', () => {
    const { getByText } = render(<EventDetailsCTA {...baseProps} />);
    expect(getByText('Interested')).toBeTruthy();
  });

  it('stamps the label when stampKey changes', () => {
    const sequence = jest.spyOn(Reanimated, 'withSequence');
    const { rerender } = render(<EventDetailsCTA {...baseProps} stampKey="idle" />);
    sequence.mockClear();
    rerender(
      <EventDetailsCTA
        {...baseProps}
        ctaLabel="Requested"
        hasPendingRequest
        stampKey="requested"
      />,
    );
    expect(sequence).toHaveBeenCalled();
  });

  it('does not stamp when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const sequence = jest.spyOn(Reanimated, 'withSequence');
    const { rerender } = render(<EventDetailsCTA {...baseProps} stampKey="idle" />);
    sequence.mockClear();
    rerender(<EventDetailsCTA {...baseProps} ctaLabel="Requested" stampKey="requested" />);
    expect(sequence).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsCTA.test.tsx --runInBand`
Expected: FAIL — `withSequence` never called.

- [ ] **Step 3: Add the stamp**

`EventDetailsCTA` is currently an arrow function returning JSX directly with no hooks. Convert it to a block body so it can hold hooks. Add imports:

```ts
import { useEffect, useRef } from 'react';

import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { triggerHaptic } from '@services/haptics';
import { Motion } from '@theme/motion';
```

Add `stampKey?: string` to `EventDetailsCTAProps`, then inside the component:

```tsx
  const reducedMotion = useReducedMotion();
  const stampScale = useSharedValue(1);
  const stampRotate = useSharedValue(0);
  const previousStampKey = useRef(stampKey);

  useEffect(() => {
    if (stampKey === previousStampKey.current) {
      return;
    }
    previousStampKey.current = stampKey;
    if (reducedMotion || stampKey == null) {
      return;
    }
    triggerHaptic('success');
    stampScale.value = withSequence(withTiming(1.4, { duration: 0 }), withSpring(1, Motion.settle));
    stampRotate.value = withSequence(withTiming(-4, { duration: 0 }), withSpring(0, Motion.settle));
  }, [reducedMotion, stampKey, stampRotate, stampScale]);

  const stampStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stampScale.value }, { rotate: `${stampRotate.value}deg` }],
  }));
```

Change the standard CTA's label from `<Text style={[styles.ctaLabel, ...]}>` to `<Animated.Text style={[styles.ctaLabel, ..., stampStyle]}>`, leaving the "Go to chat" label as a plain `Text`.

- [ ] **Step 4: Pass the key from the screen**

In `src/screens/EventDetailsScreen.tsx`, add to the `<EventDetailsCTA ... />` element:

```tsx
  stampKey={hasPendingRequest ? 'requested' : 'idle'}
```

`hasPendingRequest` is already in scope at `EventDetailsScreen.tsx:434`, where it is passed to `EventDetailsCTA`. Reuse it; do not introduce a new variable.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/screens/event-details/__tests__/EventDetailsCTA.test.tsx src/screens/__tests__/EventDetailsScreen.rendering.test.tsx --runInBand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/event-details/EventDetailsCTA.tsx src/screens/EventDetailsScreen.tsx src/screens/event-details/__tests__/EventDetailsCTA.test.tsx
git commit -m "feat: stamp the event details join cta on success"
```

---

## Task 16: Request row exit animation

Accept/decline currently makes a row vanish. Animate the exit and the collapse — **row children only**. `HostRequestTabs`' pager direction-lock and gesture boundary are frozen.

**Files:**
- Modify: `src/screens/event-details/HostRequestTabs.tsx` (the request list rendering only)
- Create: `src/screens/event-details/__tests__/HostRequestTabs.exit.test.tsx`

**Interfaces:**
- Consumes: Reanimated `FadeOutUp`, `LinearTransition` (mocked in Task 1).
- Produces: no API change.

`pendingRequests` are mapped at `src/screens/event-details/HostRequestTabs.tsx:217-231`, and each already has a `<View key={request.id}>` wrapper. That wrapper is the only thing this task changes. Do not touch the pager, the direction-lock gesture, `HOST_TABS_ACTIVE_OFFSET_X`, or `HOST_TABS_FAIL_OFFSET_Y`.

- [ ] **Step 1: Write the failing test**

Create `src/screens/event-details/__tests__/HostRequestTabs.exit.test.tsx`:

```tsx
import React from 'react';

import { render } from '@testing-library/react-native';

import type { ChatJoinRequest } from '@api/mappers/chat';

import HostRequestTabs from '../HostRequestTabs';

const request: ChatJoinRequest = {
  id: 1,
  eventId: 10,
  userId: 5,
  message: 'Can I join?',
  status: 'pending',
  createdAt: '2026-09-05T18:00:00Z',
  requester: { id: 5, name: 'Ada', avatar: undefined },
};

const baseProps = {
  isSingleEvent: false,
  pendingRequests: [request],
  acceptedRequests: [],
  confirmedMembers: [],
  hostId: 9,
  expandedRequestIds: new Set<number>(),
  acceptingUserId: null,
  decliningUserId: null,
  onToggleRequestExpanded: jest.fn(),
  onAcceptRequest: jest.fn(),
  onDeclineRequest: jest.fn(),
  onRequesterPress: jest.fn(),
  onOpenMemberMenu: jest.fn(),
};

describe('HostRequestTabs', () => {
  it('wraps each pending request in an animated exit container', () => {
    const { getByTestId } = render(<HostRequestTabs {...baseProps} />);
    expect(getByTestId('request-exit-1')).toBeTruthy();
  });

  it('still renders the requester', () => {
    const { getByText } = render(<HostRequestTabs {...baseProps} />);
    expect(getByText('Ada')).toBeTruthy();
  });
});
```

If `ConversationParticipant` requires fields beyond `id`/`name`/`avatar`, add them to `request.requester` to satisfy the type.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/screens/event-details/__tests__/HostRequestTabs.exit.test.tsx --runInBand`
Expected: FAIL — no element with testID `request-exit-1`.

- [ ] **Step 3: Wrap the rows**

`HostRequestTabs.tsx` already imports `Animated` from Reanimated. Extend that import to add the two builders:

```ts
import Animated, {
  FadeOutUp,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
```

Then change the plain `<View key={request.id}>` at line 218 to an animated wrapper, leaving its contents — the `EventRequestRow` and the trailing `EventRequestRowSeparator` — byte-identical:

```tsx
                pendingRequests.map((request, index) => (
                  <Animated.View
                    key={request.id}
                    exiting={FadeOutUp.duration(180)}
                    layout={LinearTransition.duration(220)}
                    testID={`request-exit-${request.id}`}
                  >
                    <EventRequestRow
                      requester={request.requester}
                      message={request.message}
                      expanded={expandedRequestIds.has(request.id)}
                      onToggleExpanded={() => onToggleRequestExpanded(request.id)}
                      onAccept={() => onAcceptRequest(request)}
                      onDecline={() => onDeclineRequest(request)}
                      isAccepting={acceptingUserId === request.userId}
                      isDeclining={decliningUserId === request.userId}
                    />
                    {index < pendingRequests.length - 1 && <EventRequestRowSeparator />}
                  </Animated.View>
                ))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/screens/event-details/__tests__/HostRequestTabs.exit.test.tsx --runInBand`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify the frozen gesture boundary still passes its tests**

Run: `npx jest src/screens/__tests__/EventDetailsScreen.rendering.test.tsx src/screens/__tests__/EventDetailsScreen.test.tsx --runInBand --silent`
Expected: PASS — unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/screens/event-details/HostRequestTabs.tsx src/screens/event-details/__tests__/HostRequestTabs.exit.test.tsx
git commit -m "feat: animate join request rows out on accept or decline"
```

---

## Task 17: Phase 2 device verification and documentation

- [ ] **Step 1: Full validation**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green, no new lint warnings.

- [ ] **Step 2: Format touched files**

Run: `npx prettier --write "src/screens/event-details/**/*.tsx" src/screens/EventDetailsScreen.tsx src/components/events/EventSectionList.tsx src/components/ScalePressable.tsx src/components/ui/AppTabs.tsx src/components/SegmentedControl.tsx src/screens/HomeScreen.tsx`

- [ ] **Step 3: Device smoke test**

Use the `test-on-device` skill on `WEIF_API_36`. Verify:

- Opening a plan: the cover card settles in at a slight angle.
- Scrolling: backdrop and cover drift at visibly different rates; no jitter, no clipping at the hero edge.
- Going avatars pop in in sequence.
- Tapping Interested: the label stamps and the success haptic fires.
- As host, accepting a request: the row fades up and the list closes the gap smoothly.
- Horizontal swipes between Requests/Members still work, and vertical drags still scroll the page — the frozen gesture boundary is intact.
- Back navigation out of Event Details behaves as before.

- [ ] **Step 4: Enable reduce motion and re-verify**

In the emulator: Settings → Accessibility → Remove animations (on). Relaunch the app and confirm Discover cards, the hero, avatars, and the CTA all appear correctly with no motion and nothing invisible or mispositioned.

- [ ] **Step 5: Update the project docs**

Per the repo working agreement, a new shared primitive means `AGENTS.md`, `CLAUDE.md`, and `report/shared-components-refactor-guide.md` all get updated in the same change. Add:

- To `AGENTS.md` and `CLAUDE.md`, under the shared-primitives bullets: motion tokens live in `src/theme/motion.ts` alongside the frozen `src/theme/springs.ts`; scrapbook entry motion goes through `Placed` in `src/components/motion`; every animated primitive must honour Reanimated's `useReducedMotion()`; `ScalePressable`'s `tilt` prop is opt-in; `AppTabs`' `pageOffsetSV` prop is optional and drives a continuous indicator.
- To `report/shared-components-refactor-guide.md`: a `src/components/motion` section describing `Placed`, `staggerDelayMs`, and where they are used.

- [ ] **Step 6: Record the run and commit**

Append a pass/fail verdict to `TEST_RUNS.md`, then:

```bash
git add -A
git commit -m "docs: document the scrapbook motion system primitives"
```

---

## Deferred

**Phase 1 item 4 — scroll-reactive event card covers.** The spec names this the designated cut item: highest performance risk, lowest payoff. It needs `Animated.SectionList` plus a shared scroll offset threaded into every `EventCard`. Build it only after Phase 2 ships and only if the emulator shows headroom. If built, compare against `report/performance-baseline.html` before merging.

**Phases 3 and 4** — emotional peaks (confetti at approval/join/first message, `EventActionBadge` as a stamp) and empty/loading states (mask-wipe marker reveal, scrapbook skeletons). Specified at design level in the spec; they get their own plan when picked up.
