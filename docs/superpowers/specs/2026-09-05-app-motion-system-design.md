# App Motion System — Design

Date: 2026-09-05
Status: Approved for planning

## Goal

Make Who Else Is Free feel entertaining through motion, in a way that expresses the
app's existing visual identity rather than importing a generic one.

The app's identity is already distinctive: clean white ground, heavy black Inter
headings, cutout photography, and hand-drawn blue marker annotations on a faint
grid. That is a scrapbook/zine look. Motion should read as **things being placed
on a page** — settling, tilting, stamping — not as generic iOS easing.

## Non-Goals

- Redesigning navigation structure or information architecture.
- Changing how any feature works. This is presentation only.
- Re-tuning the existing navigation, sheet, pager, or keyboard motion (see
  "Frozen Surfaces").
- A gesture-driven card deck or other interaction-model change on Discover.

## Current State

The repository already has a real motion foundation, which this design extends
rather than replaces.

| Asset | Location | Notes |
| --- | --- | --- |
| Named spring presets | `src/theme/springs.ts` | 4 presets: `snappy`, `press`, `bouncyUp`, `elegant` |
| Nav/sheet interpolators | `src/navigation/transitions.ts` | Consumes `Springs`; platform-split for Android |
| Press feedback | `src/components/ScalePressable.tsx` | Reanimated scale, optional press delay |
| Tab bounce | `src/navigation/TabBarButton.tsx` | Reanimated |
| Pager | `src/components/AnimatedPager.tsx` | Exposes `pageOffsetSV`, `isActive` |
| Tabs | `src/components/ui/AppTabs.tsx` | Reanimated; per-tab `progress` shared value |
| Confetti engine | `src/components/ConfettiOverlay.tsx` | Skia, 32 variants, 11 palettes |
| Splash bloom | `src/context/BloomContext.tsx` | Gates first-launch permission prompts |

### Gaps

1. **`ConfettiOverlay` is used in exactly one place** — the event-created badge in
   `MyEventsScreen.tsx:310`. A 282-line Skia particle engine with 32 variants is
   running at roughly 3% utilisation.
2. **No list entry motion anywhere.** `EventSectionList`, Messages, and
   Notifications rows appear instantly.
3. **No scroll-driven motion.** `EventDetailsHero` is static during scroll.
4. **Emotional peaks are unmarked.** Request approved, someone joined, first
   message — all silent.
5. **No reduce-motion support.** `AccessibilityInfo` is never queried and
   Reanimated's `useReducedMotion` is never called. Adding significant motion
   without this would be an accessibility regression.
6. **Two animation stacks coexist.** Six files use React Native `Animated`; the
   rest use Reanimated.

### Animation stack inventory (verified)

True React Native `Animated` users:

| File | Disposition |
| --- | --- |
| `src/components/EventActionBadge.tsx` | **Migrate** — decorative toast, also the Phase 3 stamp target |
| `src/components/ConnectionStatusIndicator.tsx` | **Migrate** — decorative pulsing dot |
| `src/context/BloomContext.tsx` | Frozen |
| `src/navigation/SheetRoutes.tsx` | Frozen |
| `src/screens/ChatThreadScreen.tsx` | Frozen |
| `src/screens/SplashScreen.tsx` | Frozen |

`src/components/ChatEventHeader.tsx` references `Animated` only in comments and is
not a migration target.

## Frozen Surfaces

`CLAUDE.md` and `AGENTS.md` document motion behaviour that was expensive to get
right. This design treats the following as frozen — new motion layers on top of
them, and none of their timing, gesture, or platform branching is revisited:

- Android chat keyboard lift (`ADJUST_NOTHING` + `useAndroidKeyboardLift`).
- `HostRequestTabs` direction-locked pager and the Event Details back-swipe
  disable.
- `BottomSheetModal` / `BottomSheetHostProvider` sheet coordination, `onOpened`
  timing, and shared keyboard avoidance.
- `AnimatedPager.isActive` focus/gesture-rebuild behaviour.
- `BloomContext` bloom timing, because Discover's first-launch permission
  sequence depends on `transitionComplete`.
- Splash cold-launch timing.
- The four existing `Springs` presets keep their exact values, because
  `transitions.ts` and the nav stack are tuned against them.

## Architecture

### Phase 0 — Foundation (prerequisite for all other phases)

**`src/theme/motion.ts`** — new file, additive. Re-exports `Springs` unchanged and
adds scrapbook tokens:

- `settle` — spring config for a photo dropping onto a page: brief overshoot,
  then rest.
- `tiltMaxDeg` — maximum resting rotation for placed items (±1.5°).
- `staggerStepMs` — 45ms per item.
- `staggerMaxSteps` — 6. Delay is `min(index, 6) * 45ms`, so a 200-row list does
  not take nine seconds to appear.

`src/theme/springs.ts` stays as-is so existing importers are untouched.

**`src/utils/seededRandom.ts`** — new file. `ConfettiOverlay` has a private
`seededRand` implementation; extract it so the confetti engine and the tilt
helper share one deterministic generator. Determinism matters: a card must get
the same tilt every render, or it will jitter on re-render and list recycling.

**Reduce motion.** Reanimated 4 exports `useReducedMotion()` (verified in
`node_modules/react-native-reanimated/lib/typescript/hook/useReducedMotion.d.ts`).
Use it directly rather than hand-rolling an `AccessibilityInfo` wrapper. Every
new primitive must accept it and degrade to an opacity-only fade or to no
animation. This is a completion requirement for each phase, not a follow-up.

**`src/components/motion/`** — new directory:

- `Placed.tsx` — the signature entry primitive. Composes fade + upward translate
  + slight scale + deterministic tilt using `settle`. Takes an `id` and animates
  **once per id**; a module-level seen-set prevents `SectionList` cell recycling
  and pager page changes from re-firing entries on already-seen rows.
- `useStagger.ts` — returns a capped delay for an index, and reports whether the
  group has already animated.

**Jest mock extension.** `src/__tests__/mocks/mockModules.ts:334` hand-rolls the
Reanimated mock and currently has no `useReducedMotion`, no layout-animation
builders (`FadeIn`, `FadeInDown`, …), and no `Layout`. These must be added in
Phase 0. Without them, every component using a new primitive breaks existing
suites. This is real Phase 0 work, not incidental cleanup.

**Narrow consolidation.** Migrate only `EventActionBadge` and
`ConnectionStatusIndicator` to Reanimated. Both are decorative and self-contained.
No other stack migration is in scope.

### Phase 1 — Discover

Depends on Phase 0.

1. **Staggered card settle.** `EventSectionList` wraps each row in `<Placed>`,
   keyed by event id. Section headers lead their rows slightly.
2. **Tactile press.** Add an **opt-in** `tilt` prop to `ScalePressable` that adds
   a small counter-rotation alongside the existing scale. Opt-in because
   `ScalePressable` has many call sites that must keep their current feel.
3. **Continuous sort indicator.** `HomeScreen.tsx:91` already computes
   `pageOffset` as a shared value and passes it to `AnimatedPager`, but `AppTabs`
   snaps its pill on selection change. Add an **optional** `pageOffsetSV` prop to
   `AppTabs`/`SegmentedControl`; when supplied, each tab derives
   `progress = clamp(1 - abs(pageOffset - index), 0, 1)` instead of springing on
   `selected`. Optional, because `AppTabs` is shared with other screens that have
   no pager and must keep the current behaviour.
4. **Scroll-reactive covers.** The 80px cover in `EventCard` parallaxes inside its
   already-clipped `imageWrapper`, driven by a shared scroll offset. Requires
   `Animated.SectionList`. **This is the designated cut item**: highest
   performance risk and lowest payoff of the four. If frame timing regresses on
   the emulator, drop it and keep 1–3.

### Phase 2 — Event Details

Depends on Phase 0; independent of Phase 1.

5. **Parallax hero.** Convert the Event Details `ScrollView`
   (`EventDetailsScreen.tsx:359`) to `Animated.ScrollView` with
   `useAnimatedScrollHandler`. The blurred backdrop and the elevated cover card in
   `EventDetailsHero` move at different rates. Keep `bounces={false}` — this means
   scroll-away parallax only, with no stretchy pull-down, which is the correct
   trade for not disturbing the documented gesture boundary.
6. **Cover card drop-in.** The elevated cover card lands via `<Placed>`, with its
   shadow deepening as it settles. This is where the scrapbook concept reads most
   clearly, so it should be tuned first and hardest.
7. **Avatar pop-in.** The going-avatar stack in `EventDetailsInfo` staggers in
   with `Springs.elegant`.
8. **Join CTA stamp.** The highest-intent tap in the app. On success the label
   lands like a rubber stamp — scale 1.4 → 1 with a slight rotation, `success`
   haptic, and a small low-count `dots` confetti burst reusing `ConfettiOverlay`.
9. **Request accept/decline.** Rows in `HostRequestTabs` currently vanish
   instantly. Animate slide-out plus layout collapse. **Row children only** — the
   pager's direction-lock and gesture boundary are untouched.

### Phase 3 — Emotional peaks

Cheapest joy per line of code, because the engine already exists. Fire
`ConfettiOverlay` at approval, join, and first message, choosing a variant per
context. Upgrade `EventActionBadge` from a slide-in toast to a stamp landing
(this is why Phase 0 migrates it).

### Phase 4 — Empty and loading states

**Known asset dependency.** The hand-drawn blue marker text is **baked into the
empty-state PNGs** (`@assets/empty-state/discover.png` and siblings). True
stroke-by-stroke draw-on requires SVG path assets that do not exist.

**Default: ship the mask wipe.** A left-to-right reveal over the current PNGs
approximates handwriting, needs no new assets, and does not block the phase. Real
stroke-dash draw-on stays available as a later upgrade if SVG versions of the
marker text are ever commissioned; it is not a prerequisite for Phase 4.

Also in this phase: scrapbook-styled skeletons for `EventListLoadState`, and the
empty-state cutout photo dropping into place via `<Placed>`.

## Sequencing

```
Phase 0 (foundation) ──┬── Phase 1 (Discover)
                       └── Phase 2 (Event Details)
                                │
                       Phase 3 (peaks) ── Phase 4 (empty/loading)
```

Phase 0 must land first. Phases 1 and 2 are independent of each other and can be
built in either order. Phases 3 and 4 are additive and can be deferred
indefinitely without leaving anything half-built.

**Implementation plan scope:** the plan derived from this spec covers Phases 0–2
in task-level detail, because those are the approved priority surfaces. Phases 3
and 4 are specified here at design level and get their own plan when they are
picked up.

## Testing and Validation

Per phase:

1. `npx jest <touched paths> --runInBand --silent`
2. `npm run typecheck`
3. `npm run lint` — no new warnings above the existing baseline
4. Device verification via the `test-on-device` skill on the `WEIF_API_36`
   emulator, covering Discover, My Events, Create Event, Messages, Profile, Event
   Details, sheets, and back navigation.

Unit tests to add in Phase 0:

- Stagger delay caps at `staggerMaxSteps` for large indices.
- Seeded tilt is deterministic for a given id and varies across ids.
- Every primitive returns its non-animated form when `useReducedMotion()` is true.
- `<Placed>` animates once per id and not again on re-render.

Performance rules:

- All animation runs on the UI thread through worklets. Nothing new on the JS
  thread.
- No layout-affecting animated properties inside list rows; transforms and
  opacity only.
- Compare against `report/performance-baseline.html` when Phase 1 lands, since
  that is the phase that touches list rendering.

## Risks

| Risk | Mitigation |
| --- | --- |
| Jest mock gaps break existing suites | Extend the Reanimated mock in Phase 0, before any consumer lands |
| Scroll parallax regresses list performance | Designated cut item; drop Phase 1 item 4 if frames regress |
| `AppTabs` change affects unrelated screens | New `pageOffsetSV` prop is optional; absent means current behaviour |
| Entry animations re-fire on recycle or tab switch | `<Placed>` animates once per id via a seen-set |
| Motion accumulates into something tiring | Reduce-motion support is a per-phase completion requirement; stagger is capped |
| Touching frozen surfaces reintroduces fixed bugs | Frozen Surfaces section is explicit; Phase 2 item 9 is scoped to row children |

## Decisions Made

- **Scope:** full motion system pass, not delight moments alone.
- **Personality:** scrapbook/tactile, matching the collage identity.
- **Priority surfaces:** Discover and Event Details first; peaks and empty states
  after.
- **Existing tuned motion:** frozen.
- **`bounces={false}` on Event Details:** kept, accepting no stretchy hero.
