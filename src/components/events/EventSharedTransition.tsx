/* global performance -- Provided by the React Native JS and Reanimated UI runtimes. */
/* eslint-disable react-hooks/immutability -- Reanimated shared values are mutated from callbacks and effects by design. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  AppState,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { NavigationContext } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fallbackSharedCoverScreenOptions } from '@navigation/transitions';
import { eventSharedMotion, heroCoverSize } from '@theme/motion';
import { withSteadyTiming } from '@utils/steadyTiming';
import { markTransition, transitionMetricsEnabled } from '@utils/transitionMetrics';

export interface SharedFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SharedElement = 'cover' | 'title';

/** What an event card hands over when it is pressed. */
export interface SharedTransitionSource {
  imageUri: string;
  /** Legacy caller metadata; neither measured nor animated. */
  title?: string;
  titleStyle?: StyleProp<TextStyle>;
  coverRef: RefObject<View | null>;
  titleRef?: RefObject<Text | null>;
}

export interface SharedLandExtras {
  /** Resting tilt of the destination cover, in degrees. */
  rotation?: number;
  /** Legacy metadata; title landing is ignored. */
  titleStyle?: StyleProp<TextStyle>;
  coverRef?: RefObject<View | null>;
}

/**
 * `primed`: a pressed card's overlay is mounted invisibly so its bitmap is ready before the
 * destination lands. `landing`: destination is mounting and reporting frames. `flying`: the
 * overlay is moving. `retained`: the page is open and the overlay stays mounted, hidden and
 * pre-loaded, so a return can start without mounting anything. `closing`: returning to the card.
 * Consumers only ever observe `landing`, `retained` and `closed`: `primed` is private, and the
 * moving phases live in the provider's ref so that no commit precedes or interrupts motion.
 * Motion is detected from progress: a landing page whose progress leaves 0 is opening, a
 * retained page whose progress leaves 1 is returning.
 */
export type SharedPhase = 'primed' | 'landing' | 'flying' | 'retained' | 'closing' | 'closed';

export interface SharedTransitionState {
  eventId?: string;
  phase?: SharedPhase;
  sourceCover?: SharedFrame;
}

interface SourceFrames {
  cover: SharedFrame;
}

interface Flight {
  id: number;
  eventId: string;
  imageUri: string;
  source: SourceFrames;
  /** Source frame the overlay was laid out on; a re-measured source only adds a UI-thread offset. */
  layoutCover: SharedFrame;
  sourceNode: SharedTransitionSource;
  primedAt?: number;
  destinationRef?: RefObject<View | null>;
  targetCover?: SharedFrame;
  rotation: number;
  /** The overlay's cover bitmap has been decoded and painted. */
  coverReady?: boolean;
  phase: SharedPhase;
}

interface SharedTransitionActions {
  /** Measure a card at press-in, before the press scale distorts it. */
  prime: (eventId: string, source: SharedTransitionSource) => void;
  /** Start a flight for a pressed card and navigate; `shared` tells the caller which route options apply. */
  open: (
    eventId: string,
    source: SharedTransitionSource,
    navigate: (shared: boolean) => void,
  ) => void;
  /** Report where an element rests on the destination page (window coordinates). */
  land: (
    eventId: string,
    element: SharedElement,
    frame: SharedFrame,
    extras?: SharedLandExtras,
  ) => void;
  /** Release the current flight; with an id, only if that event is the one in flight. */
  cancel: (eventId?: string) => void;
  close: (eventId: string, onClosed: (sharedReturnCompleted: boolean) => void) => boolean;
  /** 0 at the source, 1 at Details; keep the completed endpoint until the next flight. */
  progress: SharedValue<number>;
  /** Current source cover frame (overlay-root coordinates), written before any motion starts. */
  sourceFrame: SharedValue<SharedFrame | null>;
}

const idleProgress = makeMutable(1);
const idleSourceFrame = makeMutable<SharedFrame | null>(null);

const ActionsContext = createContext<SharedTransitionActions>({
  prime: () => undefined,
  open: (_id, _source, navigate) => navigate(false),
  land: () => undefined,
  cancel: () => undefined,
  close: () => false,
  progress: idleProgress,
  sourceFrame: idleSourceFrame,
});

const StateContext = createContext<SharedTransitionState>({});

export const useEventSharedTransition = () => useContext(ActionsContext);
/**
 * Current image flight. Titles remain inside their respective pages.
 */
export const useEventSharedTransitionState = () => useContext(StateContext);

export const isValidSharedFrame = (frame: SharedFrame): boolean =>
  Object.values(frame).every(Number.isFinite) && frame.width > 0 && frame.height > 0;

type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

type FrameCallback = (frame: SharedFrame | null) => void;

const measureNode = (node: Measurable | null | undefined, onFrame: FrameCallback) => {
  if (!node) {
    onFrame(null);
    return;
  }
  node.measureInWindow((x, y, width, height) => onFrame({ x, y, width, height }));
};

const toLocal = (frame: SharedFrame, root: SharedFrame | null): SharedFrame =>
  root ? { ...frame, x: frame.x - root.x, y: frame.y - root.y } : frame;

/**
 * Measure the pressed card's cover relative to the overlay root.
 * Calls back once every measurement has answered; a recycled row may never
 * answer, which the caller guards with `measureTimeoutMs`.
 */
const measureSource = (
  source: SharedTransitionSource,
  root: RefObject<View | null>,
  onDone: (frames: SourceFrames | null) => void,
) => {
  let rootFrame: SharedFrame | null = null;
  let cover: SharedFrame | null = null;
  let pending = 2;
  const step = () => {
    pending -= 1;
    if (pending > 0) return;
    if (!cover || !isValidSharedFrame(cover)) {
      onDone(null);
      return;
    }
    onDone({
      cover: toLocal(cover, rootFrame),
    });
  };
  measureNode(root.current, (frame) => {
    rootFrame = frame;
    step();
  });
  measureNode(source.coverRef.current, (frame) => {
    cover = frame;
    step();
  });
};

const center = (frame: SharedFrame) => ({
  x: frame.x + frame.width / 2,
  y: frame.y + frame.height / 2,
});

/** Landing geometry the cover flies toward; written right before take-off. */
interface CoverTarget {
  cx: number;
  cy: number;
  width: number;
  rotation: number;
}

/**
 * The cover in flight. It is laid out once at hero size, centred on the card
 * frame it was created for, and transforms carry it to the hero, so no frame
 * changes its layout or resizes the image view. The worklet only reads shared
 * values and per-flight constants: the source and landing geometry are written
 * to shared values right before the timing starts, so no React commit sits
 * between readiness and the first moving frame.
 */
const FlyingCover = ({
  flight,
  layoutSize,
  progress,
  target,
  sourceFrame,
  onLoad,
  onError,
}: {
  flight: Flight;
  layoutSize: number;
  progress: SharedValue<number>;
  target: SharedValue<CoverTarget | null>;
  sourceFrame: SharedValue<SharedFrame | null>;
  onLoad: () => void;
  onError: () => void;
}) => {
  const layoutCover = flight.layoutCover;
  const layoutCenter = center(layoutCover);
  // A new source object would make expo-image re-request the bitmap when the
  // flight re-renders at take-off and blank the view for a frame.
  const source = useMemo(() => ({ uri: flight.imageUri }), [flight.imageUri]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const from = sourceFrame.value ?? layoutCover;
    const fromCx = from.x + from.width / 2;
    const fromCy = from.y + from.height / 2;
    const to = target.value;
    const toWidth = to ? to.width : from.width;
    const width = from.width + (toWidth - from.width) * p;
    const scale = width / layoutSize;
    const radius =
      eventSharedMotion.cardRadius +
      (eventSharedMotion.heroRadius - eventSharedMotion.cardRadius) * p;
    return {
      transform: [
        { translateX: fromCx - layoutCenter.x + (to ? (to.cx - fromCx) * p : 0) },
        { translateY: fromCy - layoutCenter.y + (to ? (to.cy - fromCy) * p : 0) },
        { scale },
        { rotate: `${to ? to.rotation * p : 0}deg` },
      ],
      // The radius is applied before the scale, so divide it out to keep the
      // visible corner exactly between the card and hero radii.
      borderRadius: radius / scale,
    };
  });
  return (
    <Animated.View
      testID="flying-cover"
      style={[
        styles.cover,
        {
          left: layoutCenter.x - layoutSize / 2,
          top: layoutCenter.y - layoutSize / 2,
          width: layoutSize,
          height: layoutSize,
        },
        style,
      ]}
    >
      <Image
        testID="flying-cover-image"
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        onLoad={onLoad}
        onError={onError}
      />
    </Animated.View>
  );
};

const FlightMetricProbe = ({
  progress,
  phase,
}: {
  progress: SharedValue<number>;
  phase: SharedPhase;
}) => {
  const emitted = useSharedValue(false);
  const flushed = useSharedValue(false);
  const samples = useSharedValue<Array<{ ui_ms: number; progress: number }>>([]);
  const dropped = useSharedValue(0);
  // This component only mounts in an explicitly enabled diagnostic build.
  // Collect on the UI runtime; cross to JS once after reaching the endpoint.
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      const moving = p > 0 && p < 1;
      const endpoint = (phase === 'flying' && p >= 1) || (phase === 'closing' && p <= 0);
      if (flushed.value || (!moving && !(endpoint && emitted.value))) return;
      const uiMs = performance.now();
      if (!emitted.value && moving) {
        emitted.value = true;
        runOnJS(markTransition)('first-ui-motion', {
          phase,
          ui_ms: uiMs,
          ui_wall_ms: Date.now(),
        });
      }
      // Bound diagnostic memory, reserving the final entry for the endpoint.
      // modify avoids allocating/copying the entire array on every UI frame.
      if (samples.value.length < 255 || endpoint) {
        samples.modify((items) => {
          items.push({ ui_ms: uiMs, progress: p });
          return items;
        });
      } else dropped.value += 1;
      if (endpoint) {
        flushed.value = true;
        runOnJS(markTransition)('ui-motion-samples', {
          phase,
          ui_ms: uiMs,
          ui_wall_ms: Date.now(),
          samples_json: JSON.stringify(samples.value),
          dropped_samples: dropped.value,
        });
      }
    },
  );
  return null;
};

const FlightOverlay = ({
  flight,
  layoutSize,
  progress,
  target,
  sourceFrame,
  onCoverReady,
  onError,
}: {
  flight: Flight;
  layoutSize: number;
  progress: SharedValue<number>;
  target: SharedValue<CoverTarget | null>;
  sourceFrame: SharedValue<SharedFrame | null>;
  onCoverReady: () => void;
  onError: () => void;
}) => {
  const phase = flight.phase;
  // Mount diagnostics before takeoff so React scheduling cannot delay the probe.
  const metricPhase =
    phase === 'primed' || phase === 'landing' || phase === 'flying' ? 'flying' : 'closing';
  // A primed overlay stays invisible over its card; a retained overlay stays
  // invisible over the hero until a return moves progress off its endpoint.
  const visibility = useAnimatedStyle(() => ({
    opacity: phase === 'primed' || (phase === 'retained' && progress.value >= 0.999) ? 0 : 1,
  }));
  return (
    <Animated.View
      testID="flight-overlay"
      style={[StyleSheet.absoluteFill, visibility]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {transitionMetricsEnabled && (
        <FlightMetricProbe key={metricPhase} phase={metricPhase} progress={progress} />
      )}
      <FlyingCover
        flight={flight}
        layoutSize={layoutSize}
        progress={progress}
        target={target}
        sourceFrame={sourceFrame}
        onLoad={onCoverReady}
        onError={onError}
      />
    </Animated.View>
  );
};

type Timers = {
  measure?: ReturnType<typeof setTimeout>;
  land?: ReturnType<typeof setTimeout>;
  image?: ReturnType<typeof setTimeout>;
  complete?: ReturnType<typeof setTimeout>;
  prime?: ReturnType<typeof setTimeout>;
  takeoff?: number;
};

/** One window-coordinate overlay shared by every event list and the Details page. */
export const EventSharedTransitionProvider = ({ children }: { children: ReactNode }) => {
  const root = useRef<View>(null);
  const sequence = useRef(0);
  const opening = useRef(false);
  const flightRef = useRef<Flight>(undefined);
  const closeCallback = useRef<((sharedReturnCompleted: boolean) => void) | undefined>(undefined);
  const timers = useRef<Timers>({});
  const graces = useRef({ image: false });
  const [flight, setFlightState] = useState<Flight>();
  // A return in progress: live materials unmount before its clock starts.
  // Reset to 0 at open so the page mounts invisible; the overlay drives it to 1.
  const progress = useSharedValue(1);
  const target = useSharedValue<CoverTarget | null>(null);
  const sourceFrame = useSharedValue<SharedFrame | null>(null);
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const layoutSize = heroCoverSize(width);

  const clearTimers = () => {
    const current = timers.current;
    if (current.measure) clearTimeout(current.measure);
    if (current.land) clearTimeout(current.land);
    if (current.image) clearTimeout(current.image);
    if (current.complete) clearTimeout(current.complete);
    if (current.prime) clearTimeout(current.prime);
    if (current.takeoff != null) globalThis.cancelAnimationFrame(current.takeoff);
    timers.current = {};
  };
  const setFlight = (next: Flight | undefined) => {
    flightRef.current = next;
    setFlightState(next);
  };
  /**
   * Motion phases exist only in the ref. Every visual change at take-off and
   * return start is driven by progress on the UI thread, so a React commit
   * here would only re-render consumers and mount prop updates on the main
   * thread during the first moving frames.
   */
  const setFlightPhaseSilently = (next: Flight) => {
    flightRef.current = next;
  };

  const cancel = useCallback<SharedTransitionActions['cancel']>(
    (eventId) => {
      if (eventId && flightRef.current?.eventId !== eventId) return;
      markTransition('cancel', { phase: flightRef.current?.phase ?? 'idle' });
      const returnedToSource = flightRef.current?.phase === 'closed';
      const finishClose = closeCallback.current;
      closeCallback.current = undefined;
      clearTimers();
      sequence.current += 1;
      opening.current = false;
      cancelAnimation(progress);
      // The native source may still be using its closing visibility worklet
      // until React commits the cleared flight. Resetting 0 -> 1 here hides
      // that image again for one frame during page unmount.
      if (!returnedToSource) progress.value = 1;
      setFlight(undefined);
      finishClose?.(false);
    },
    [progress],
  );

  const cancelFlight = useCallback(
    (id: number) => {
      if (flightRef.current?.id === id) cancel();
    },
    [cancel],
  );

  /** UI-thread completion of a started timing; the React commit follows, off the critical path. */
  const completeFlight = useCallback((id: number, phase: 'flying' | 'closing') => {
    const current = flightRef.current;
    if (!current || current.id !== id || current.phase !== phase) return;
    clearTimers();
    opening.current = false;
    if (phase === 'closing') {
      // Keep the page contracted until navigation removes it. Resetting here
      // would flash a full-size Details page during the stack's close fade.
      markTransition('return-complete-js');
      setFlight({ ...current, phase: 'closed' });
      const callback = closeCallback.current;
      closeCallback.current = undefined;
      callback?.(true);
      return;
    }
    // Keep the loaded overlay mounted and hidden over the hero: the return
    // then only re-measures and starts its timing.
    markTransition('open-complete-js');
    setFlight({ ...current, phase: 'retained' });
  }, []);

  const startFlight = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.phase !== 'landing' || !current.targetCover) return;
    clearTimers();
    markTransition('takeoff-ready');
    // Hand the UI thread the geometry first, then start the clock. The
    // `flying` commit below re-renders consumers after motion is already running.
    const to = center(current.targetCover);
    target.value = {
      cx: to.x,
      cy: to.y,
      width: current.targetCover.width,
      rotation: current.rotation,
    };
    sourceFrame.value = current.source.cover;
    const id = current.id;
    // Record the phase and watchdog before the clock starts: the completion
    // callback checks both.
    setFlightPhaseSilently({ ...current, phase: 'flying' });
    timers.current.complete = setTimeout(() => cancelFlight(id), eventSharedMotion.timeoutMs);
    progress.value = 0;
    markTransition('animation-requested', { phase: 'flying' });
    progress.value = withSteadyTiming(
      1,
      {
        duration: eventSharedMotion.durationMs,
        easing: Easing.out(Easing.cubic),
        steadyFrames: eventSharedMotion.steadyFrames,
        maxStepMs: eventSharedMotion.steadyMaxStepMs,
      },
      (finished) => {
        // Only Reanimated's own animation helpers get auto-workletized callbacks.
        'worklet';
        if (!finished) return;
        if (transitionMetricsEnabled)
          runOnJS(markTransition)('ui-endpoint', {
            phase: 'flying',
            ui_ms: performance.now(),
            ui_wall_ms: Date.now(),
          });
        runOnJS(completeFlight)(id, 'flying');
      },
    );
  }, [cancelFlight, completeFlight, progress, sourceFrame, target]);

  /**
   * Wait for the destination cover and bitmap; text never delays take-off.
   * `afterCommit` is set when called from the destination's own layout report:
   * a bitmap that was ready before landing must not start its clock in the
   * same JS turn, or the first evaluated frame would be the heavy mount frame
   * and the next one would jump ahead. The next animation frame runs after
   * that mount and before its draw.
   */
  const tryStart = useCallback(
    (afterCommit = false) => {
      const current = flightRef.current;
      if (!current || current.phase !== 'landing' || !current.targetCover) return;
      const coverReady = !!current.coverReady || graces.current.image;
      if (coverReady) {
        if (!afterCommit) {
          startFlight();
        } else if (timers.current.takeoff == null) {
          timers.current.takeoff = requestAnimationFrame(() => {
            timers.current.takeoff = undefined;
            startFlight();
          });
        }
        return;
      }
      if (!timers.current.image) {
        timers.current.image = setTimeout(() => {
          if (flightRef.current?.id !== current.id) return;
          graces.current.image = true;
          tryStart();
        }, eventSharedMotion.imageGraceMs);
      }
    },
    [startFlight],
  );

  const markCoverReady = useCallback(
    (id: number) => {
      const current = flightRef.current;
      if (!current || current.id !== id || current.coverReady) return;
      markTransition('cover-ready', { phase: current.phase });
      setFlight({ ...current, coverReady: true });
      tryStart();
    },
    [tryStart],
  );

  const prime = useCallback<SharedTransitionActions['prime']>(
    (eventId, source) => {
      if (reducedMotion || opening.current || !root.current || !source.imageUri) return;
      const current = flightRef.current;
      if (current && current.phase !== 'primed') return;
      const generation = ++sequence.current;
      measureSource(source, root, (frames) => {
        if (!frames || generation !== sequence.current || opening.current) return;
        const existing = flightRef.current;
        if (existing && existing.phase !== 'primed') return;
        if (timers.current.prime) clearTimeout(timers.current.prime);
        const reuse =
          existing && existing.eventId === eventId && existing.imageUri === source.imageUri
            ? existing
            : undefined;
        const id = reuse ? reuse.id : generation;
        // Mount the overlay invisibly now so its bitmap decodes during the
        // press instead of after the destination has been mounted.
        setFlight(
          reuse
            ? { ...reuse, source: frames, sourceNode: source, primedAt: Date.now() }
            : {
                id,
                eventId,
                imageUri: source.imageUri,
                source: frames,
                layoutCover: frames.cover,
                sourceNode: source,
                rotation: 0,
                phase: 'primed',
                primedAt: Date.now(),
              },
        );
        timers.current.prime = setTimeout(() => {
          const stale = flightRef.current;
          if (stale?.id === id && stale.phase === 'primed') setFlight(undefined);
        }, eventSharedMotion.primedFrameTtlMs);
      });
    },
    [reducedMotion],
  );

  const open = useCallback<SharedTransitionActions['open']>(
    (eventId, source, navigate) => {
      markTransition('open-request', { phase: flightRef.current?.phase ?? 'idle' });
      const current = flightRef.current;
      if ((current && current.phase !== 'primed') || opening.current) {
        markTransition('open-rejected');
        return;
      }
      if (reducedMotion || !root.current || !source.imageUri) {
        navigate(reducedMotion);
        return;
      }
      const generation = ++sequence.current;
      const begin = (frames: SourceFrames | null, primed?: Flight) => {
        if (sequence.current !== generation) return;
        if (!frames) {
          opening.current = false;
          navigate(false);
          return;
        }
        clearTimers();
        progress.value = 0;
        target.value = null;
        sourceFrame.value = frames.cover;
        graces.current = { image: false };
        const id = primed ? primed.id : generation;
        setFlight(
          primed
            ? {
                ...primed,
                source: frames,
                sourceNode: source,
                phase: 'landing',
                primedAt: undefined,
              }
            : {
                id,
                eventId,
                imageUri: source.imageUri,
                source: frames,
                layoutCover: frames.cover,
                sourceNode: source,
                rotation: 0,
                phase: 'landing',
              },
        );
        timers.current.land = setTimeout(() => cancelFlight(id), eventSharedMotion.landTimeoutMs);
        markTransition('navigate');
        navigate(true);
      };
      opening.current = true;
      if (current) {
        const fresh =
          current.eventId === eventId &&
          current.imageUri === source.imageUri &&
          Date.now() - (current.primedAt ?? 0) < eventSharedMotion.primedFrameTtlMs;
        if (fresh) {
          begin(current.source, current);
          return;
        }
        // Primed for another card or stale: drop it and measure afresh.
        clearTimers();
        setFlight(undefined);
      }
      // Measurement can be absent for a recycled/unmounted row. Never strand a tap.
      let settled = false;
      const fallback = setTimeout(() => {
        if (settled || sequence.current !== generation) return;
        settled = true;
        opening.current = false;
        navigate(false);
      }, eventSharedMotion.measureTimeoutMs);
      timers.current.measure = fallback;
      measureSource(source, root, (frames) => {
        if (settled || sequence.current !== generation) return;
        settled = true;
        clearTimeout(fallback);
        begin(frames);
      });
    },
    [cancelFlight, progress, reducedMotion, sourceFrame, target],
  );

  const land = useCallback<SharedTransitionActions['land']>(
    (eventId, element, frame, extras) => {
      const current = flightRef.current;
      if (
        element !== 'cover' ||
        !current ||
        current.eventId !== eventId ||
        current.phase !== 'landing'
      )
        return;
      if (!isValidSharedFrame(frame)) return;
      if (current.targetCover) return;
      measureNode(root.current, (rootFrame) => {
        const latest = flightRef.current;
        if (!latest || latest.id !== current.id || latest.phase !== 'landing') return;
        markTransition('destination-measured');
        const local = toLocal(frame, rootFrame);
        const next: Flight = {
          ...latest,
          targetCover: local,
          rotation: extras?.rotation ?? 0,
          destinationRef: extras?.coverRef,
        };
        setFlight(next);
        tryStart(true);
      });
    },
    [tryStart],
  );

  const close = useCallback<SharedTransitionActions['close']>(
    (eventId, onClosed) => {
      markTransition('close-request');
      const current = flightRef.current;
      if (closeCallback.current || current?.phase === 'closing' || current?.phase === 'closed')
        return true;
      if (reducedMotion || !current || current.phase !== 'retained' || current.eventId !== eventId)
        return false;
      const generation = ++sequence.current;
      closeCallback.current = onClosed;
      let settled = false;
      const fallback = () => {
        if (settled || sequence.current !== generation) return;
        settled = true;
        cancel();
      };
      timers.current.measure = setTimeout(fallback, eventSharedMotion.measureTimeoutMs);
      measureSource(current.sourceNode, root, (frames) => {
        if (settled || sequence.current !== generation) return;
        if (!frames || frames.cover.y < 0 || frames.cover.y + frames.cover.height > height) {
          fallback();
          return;
        }
        measureNode(current.destinationRef?.current, (destination) => {
          if (settled || sequence.current !== generation) return;
          if (
            !destination ||
            !isValidSharedFrame(destination) ||
            destination.y < 0 ||
            destination.y + destination.height > height
          ) {
            fallback();
            return;
          }
          measureNode(root.current, (rootFrame) => {
            if (settled || sequence.current !== generation) return;
            settled = true;
            clearTimers();
            const targetCover = toLocal(destination, rootFrame);
            const to = center(targetCover);
            // The overlay is already mounted and loaded: write the endpoints,
            // drop live materials in this turn's commit and start the clock in
            // the same turn. Its first frame coincides with that commit's mount
            // frame and its first steps are bounded, so neither the removal nor
            // the display's refresh-rate switch can become a visible jump.
            sourceFrame.value = frames.cover;
            target.value = {
              cx: to.x,
              cy: to.y,
              width: targetCover.width,
              rotation: current.rotation,
            };
            const id = current.id;
            setFlightPhaseSilently({ ...current, source: frames, targetCover, phase: 'closing' });
            timers.current.complete = setTimeout(
              () => cancelFlight(id),
              eventSharedMotion.timeoutMs,
            );
            progress.value = 1;
            markTransition('animation-requested', { phase: 'closing' });
            progress.value = withSteadyTiming(
              0,
              {
                duration: eventSharedMotion.closeDurationMs,
                easing: Easing.out(Easing.cubic),
                steadyFrames: eventSharedMotion.steadyFrames,
                maxStepMs: eventSharedMotion.steadyMaxStepMs,
              },
              (finished) => {
                'worklet';
                if (!finished) return;
                if (transitionMetricsEnabled)
                  runOnJS(markTransition)('ui-endpoint', {
                    phase: 'closing',
                    ui_ms: performance.now(),
                    ui_wall_ms: Date.now(),
                  });
                runOnJS(completeFlight)(id, 'closing');
              },
            );
          });
        });
      });
      return true;
    },
    [cancel, cancelFlight, completeFlight, height, progress, reducedMotion, sourceFrame, target],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    return () => {
      subscription.remove();
      sequence.current += 1;
      clearTimers();
      cancelAnimation(progress);
    };
  }, [cancel, progress]);
  useEffect(() => {
    cancel();
  }, [width, height, cancel]);

  const actions = useMemo(
    () => ({ prime, open, land, cancel, close, progress, sourceFrame }),
    [prime, open, land, cancel, close, progress, sourceFrame],
  );
  // A primed overlay is invisible and private to the provider: consumers must
  // not re-render on every press-in.
  const primed = flight?.phase === 'primed';
  const eventId = primed ? undefined : flight?.eventId;
  const phase = primed ? undefined : flight?.phase;
  const sourceCover = primed ? undefined : flight?.source.cover;
  const state = useMemo<SharedTransitionState>(
    () => ({ eventId, phase, sourceCover }),
    [eventId, phase, sourceCover],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        <View ref={root} collapsable={false} style={styles.root}>
          {children}
          {flight && flight.phase !== 'closed' && (
            <FlightOverlay
              key={flight.id}
              flight={flight}
              layoutSize={layoutSize}
              progress={progress}
              target={target}
              sourceFrame={sourceFrame}
              onCoverReady={() => markCoverReady(flight.id)}
              onError={() => cancelFlight(flight.id)}
            />
          )}
        </View>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
};

/** Blur the retained source itself on Android; a sibling BlurView would sample
 * the transparent stack card instead of the feed on this navigator. */
export const EventSharedTransitionSourcePage = ({ children }: { children: ReactNode }) => {
  const { phase } = useEventSharedTransitionState();
  const { progress } = useEventSharedTransition();
  const canBlur = Platform.OS === 'android' && Number(Platform.Version) >= 31;
  // Keep radius fixed while moving, but clear it on the UI thread near the
  // source endpoint. A delayed JS completion must not leave the feed blurred.
  // Only radius changes should submit a native filter update. A fresh
  // array on every progress frame defeats Reanimated's shallow style equality.
  // Motion can begin before the `flying`/`closing` commit: a retained page whose
  // progress leaves 1 is returning, a landing page whose progress leaves 0 is opening.
  const blurRadius = useDerivedValue(() => {
    if (!canBlur) return 0;
    const p = progress.value;
    if (p <= 0.04) return 0;
    if (phase === 'closing' || (phase === 'retained' && p < 0.999))
      return eventSharedMotion.backdropBlur;
    if (phase === 'flying' || (phase === 'landing' && p > 0.001))
      return eventSharedMotion.openingBackdropBlur;
    return 0;
  });
  const style = useAnimatedStyle(() => ({
    filter: canBlur ? [{ blur: blurRadius.value }] : [],
  }));
  return <Animated.View style={[styles.root, style]}>{children}</Animated.View>;
};

type EventSharedTransitionPageProps = {
  eventId: string;
  /** False for routes that were not opened from a card; the page then renders normally. */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/**
 * Wraps a destination page so it reveals in step with the flight instead of
 * the stack's own transition. Under reduced motion, or when its flight is
 * abandoned before take-off, it fades in by itself; leaving the page releases
 * its flight.
 */
export const EventSharedTransitionPage = ({
  eventId,
  enabled = true,
  style,
  testID,
  children,
}: EventSharedTransitionPageProps) => {
  const { progress, sourceFrame, cancel, close } = useEventSharedTransition();
  const { eventId: activeEventId, phase } = useEventSharedTransitionState();
  const navigation = useContext(NavigationContext);
  const allowRemove = useRef(false);
  const removeRequested = useRef(false);
  const mounted = useRef(true);
  const removeFrame = useRef<number | null>(null);
  const { width, height } = useWindowDimensions();
  useEffect(
    () =>
      navigation?.addListener('beforeRemove', (event) => {
        if (!enabled || allowRemove.current) return;
        event.preventDefault();
        if (removeRequested.current) return;
        removeRequested.current = true;
        const finishRemoval = (sharedReturnCompleted: boolean) => {
          if (!mounted.current) return;
          const dispatchRemoval = () => {
            removeFrame.current = null;
            allowRemove.current = true;
            markTransition('close-dispatch');
            navigation.dispatch(event.data.action);
          };
          if (sharedReturnCompleted) {
            // The route was configured for instant removal before it opened.
            dispatchRemoval();
          } else {
            navigation.setOptions(fallbackSharedCoverScreenOptions);
            removeFrame.current = requestAnimationFrame(() => {
              removeFrame.current = requestAnimationFrame(dispatchRemoval);
            });
          }
        };
        if (!close(eventId, finishRemoval)) finishRemoval(false);
      }),
    [close, enabled, eventId, navigation],
  );
  const reducedMotion = useReducedMotion();
  const active = enabled && activeEventId === eventId;
  const fade = useSharedValue(enabled && reducedMotion ? 0 : 1);
  const lastPhase = useRef<SharedPhase | undefined>(undefined);
  useEffect(() => {
    if (enabled && reducedMotion) {
      fade.value = withTiming(1, { duration: eventSharedMotion.fadeMs });
    }
  }, [enabled, fade, reducedMotion]);
  // A flight released while still landing (destination never reported, or a
  // loading fallback took its place) would pop the page in; fade it instead.
  useEffect(() => {
    if (enabled && !active && lastPhase.current === 'landing') {
      fade.value = 0;
      fade.value = withTiming(1, { duration: eventSharedMotion.fadeMs });
    }
    lastPhase.current = active ? phase : undefined;
  }, [active, enabled, fade, phase]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (removeFrame.current !== null) globalThis.cancelAnimationFrame(removeFrame.current);
      if (enabled) {
        markTransition('page-unmount');
        cancel(eventId);
      }
    };
  }, [cancel, enabled, eventId]);
  // Motion may start before its commit: a landing page whose progress leaves 0
  // is opening, a retained page whose progress leaves 1 is returning.
  const landing = active && phase === 'landing';
  const retained = active && phase === 'retained';
  const committedMotion =
    active && (phase === 'flying' || phase === 'closing' || phase === 'closed');
  const surfaceStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const from = sourceFrame.value;
    const moving = committedMotion || (landing && p > 0.001) || (retained && p < 0.999);
    if (!moving || !from)
      return {
        opacity: landing ? 0 : fade.value,
        borderRadius: 0,
        transform: [{ translateX: 0 }, { translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }],
      };
    const sx = (from.width + (width - from.width) * p) / width;
    const sy = (from.height + (height - from.height) * p) / height;
    return {
      // Hide the contracted page on the UI thread before JS removes its image
      // overlay. Otherwise its white surface briefly covers the restored card.
      opacity: phase === 'closed' || p <= 0.001 ? 0 : 1,
      borderRadius:
        interpolate(
          p,
          [0, 0.85, 1],
          [eventSharedMotion.cardRadius, eventSharedMotion.surfaceRadius, 0],
          Extrapolation.CLAMP,
        ) / sx,
      transform: [
        { translateX: from.x * (1 - p) },
        { translateY: from.y * (1 - p) },
        { scaleX: sx },
        { scaleY: sy },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const from = sourceFrame.value;
    const moving = committedMotion || (landing && p > 0.001) || (retained && p < 0.999);
    if (!moving || !from) return { opacity: 1, transform: [{ scaleY: 1 }] };
    const sx = (from.width + (width - from.width) * p) / width;
    const sy = (from.height + (height - from.height) * p) / height;
    // Undo the shell's nonuniform scale: typography remains proportional and
    // appears within the page, never as a separately travelling replica.
    return {
      transform: [{ scaleY: sx / sy }],
      opacity: interpolate(p, [0, 0.35, 1], [0, 0, 1], Extrapolation.CLAMP),
    };
  });
  const backdropStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const moving = committedMotion || (landing && p > 0.001) || (retained && p < 0.999);
    return {
      opacity: moving ? interpolate(p, [0, 0.2, 0.95, 1], [0, 1, 1, 0], Extrapolation.CLAMP) : 0,
    };
  });
  return (
    <View style={styles.root}>
      {active && Platform.OS === 'ios' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={24}
            tint="light"
            experimentalBlurMethod="dimezisBlurView"
          />
        </Animated.View>
      )}
      <Animated.View
        style={[style, styles.surface, surfaceStyle]}
        pointerEvents={active && !retained ? 'none' : 'auto'}
        testID={testID}
      >
        <Animated.View style={[styles.pageContent, contentStyle]}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { position: 'absolute', overflow: 'hidden', borderCurve: 'continuous' },
  surface: { flex: 1, overflow: 'hidden', transformOrigin: 'top left' },
  pageContent: { flex: 1, transformOrigin: 'top left' },
});
