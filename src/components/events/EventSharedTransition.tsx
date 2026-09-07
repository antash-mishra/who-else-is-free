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
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { fallbackSharedCoverScreenOptions } from '@navigation/transitions';
import { eventSharedMotion, heroCoverSize } from '@theme/motion';
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

/** `landing`: destination is mounting and reporting frames. `flying`: overlays are moving. */
export type SharedPhase = 'landing' | 'flying' | 'returning' | 'closing' | 'closed';

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
  sourceNode: SharedTransitionSource;
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
}

const idleProgress = makeMutable(1);

const ActionsContext = createContext<SharedTransitionActions>({
  prime: () => undefined,
  open: (_id, _source, navigate) => navigate(false),
  land: () => undefined,
  cancel: () => undefined,
  close: () => false,
  progress: idleProgress,
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
 * The cover in flight. It is laid out once at hero size, centred on the card,
 * and transforms carry it to the hero, so no frame changes its layout or
 * resizes the image view. The worklet only reads shared values and per-flight
 * constants: a closure that changed at landing would reach the UI thread
 * through a React effect, which a busy JS thread delays by several frames.
 */
const FlyingCover = ({
  flight,
  layoutSize,
  progress,
  target,
  onLoad,
  onError,
}: {
  flight: Flight;
  layoutSize: number;
  progress: SharedValue<number>;
  target: SharedValue<CoverTarget | null>;
  onLoad: () => void;
  onError: () => void;
}) => {
  const from = flight.source.cover;
  const fromCenter = center(from);
  // A new source object would make expo-image re-request the bitmap when the
  // flight re-renders at take-off and blank the view for a frame.
  const source = useMemo(() => ({ uri: flight.imageUri }), [flight.imageUri]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const to = target.value;
    const toWidth = to ? to.width : from.width;
    const width = from.width + (toWidth - from.width) * p;
    const scale = width / layoutSize;
    const radius =
      eventSharedMotion.cardRadius +
      (eventSharedMotion.heroRadius - eventSharedMotion.cardRadius) * p;
    return {
      transform: [
        { translateX: to ? (to.cx - fromCenter.x) * p : 0 },
        { translateY: to ? (to.cy - fromCenter.y) * p : 0 },
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
          left: fromCenter.x - layoutSize / 2,
          top: fromCenter.y - layoutSize / 2,
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
  useAnimatedReaction(
    () => progress.value,
    (p) => {
      if (
        !emitted.value &&
        ((phase === 'flying' && p > 0 && p < 1) || (phase === 'closing' && p < 1 && p > 0))
      ) {
        emitted.value = true;
        runOnJS(markTransition)('first-ui-motion', {
          phase,
          ui_ms: performance.now(),
          ui_wall_ms: Date.now(),
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
  onCoverReady,
  onComplete,
  onError,
}: {
  flight: Flight;
  layoutSize: number;
  progress: SharedValue<number>;
  onCoverReady: () => void;
  onComplete: () => void;
  onError: () => void;
}) => {
  const flying = flight.phase === 'flying' || flight.phase === 'closing';
  const started = useRef<SharedPhase | undefined>(undefined);
  const targetCenter = flight.targetCover ? center(flight.targetCover) : null;
  const target = useSharedValue<CoverTarget | null>(
    flight.targetCover && targetCenter
      ? {
          cx: targetCenter.x,
          cy: targetCenter.y,
          width: flight.targetCover.width,
          rotation: flight.rotation,
        }
      : null,
  );
  // The provider switches to `flying` only once the destination has landed and
  // the cover bitmap is painted (or its grace passed), so take off right away.
  useEffect(() => {
    if (!flying || started.current === flight.phase || !flight.targetCover) return;
    started.current = flight.phase;
    const to = center(flight.targetCover);
    // Hand the UI thread the landing geometry first, then start the clock.
    target.value = {
      cx: to.x,
      cy: to.y,
      width: flight.targetCover.width,
      rotation: flight.rotation,
    };
    const phase = flight.phase;
    const closing = phase === 'closing';
    progress.value = closing ? 1 : 0;
    markTransition('animation-requested', { phase: flight.phase });
    progress.value = withTiming(
      closing ? 0 : 1,
      {
        duration: closing ? eventSharedMotion.closeDurationMs : eventSharedMotion.durationMs,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          if (transitionMetricsEnabled)
            runOnJS(markTransition)('ui-endpoint', {
              phase,
              ui_ms: performance.now(),
              ui_wall_ms: Date.now(),
            });
          runOnJS(onComplete)();
        }
      },
    );
  }, [flight, flying, onComplete, progress, target]);
  return (
    <View
      style={[StyleSheet.absoluteFill, flight.phase === 'returning' && { opacity: 0 }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {transitionMetricsEnabled && flying && (
        <FlightMetricProbe key={flight.phase} phase={flight.phase} progress={progress} />
      )}
      <FlyingCover
        flight={flight}
        layoutSize={layoutSize}
        progress={progress}
        target={target}
        onLoad={onCoverReady}
        onError={onError}
      />
    </View>
  );
};

type Timers = {
  measure?: ReturnType<typeof setTimeout>;
  land?: ReturnType<typeof setTimeout>;
  image?: ReturnType<typeof setTimeout>;
  complete?: ReturnType<typeof setTimeout>;
};

/** One window-coordinate overlay shared by every event list and the Details page. */
export const EventSharedTransitionProvider = ({ children }: { children: ReactNode }) => {
  const root = useRef<View>(null);
  const sequence = useRef(0);
  const opening = useRef(false);
  const flightRef = useRef<Flight>(undefined);
  const returnFlight = useRef<Flight>(undefined);
  const closeCallback = useRef<((sharedReturnCompleted: boolean) => void) | undefined>(undefined);
  const primed = useRef<{ eventId: string; frames: SourceFrames; at: number }>(undefined);
  const timers = useRef<Timers>({});
  const graces = useRef({ image: false });
  const [flight, setFlightState] = useState<Flight>();
  // Reset to 0 at open so the page mounts invisible; the overlay drives it to 1.
  const progress = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const layoutSize = heroCoverSize(width);

  const clearTimers = () => {
    const current = timers.current;
    if (current.measure) clearTimeout(current.measure);
    if (current.land) clearTimeout(current.land);
    if (current.image) clearTimeout(current.image);
    if (current.complete) clearTimeout(current.complete);
    timers.current = {};
  };
  const setFlight = (next: Flight | undefined) => {
    flightRef.current = next;
    setFlightState(next);
  };

  const cancel = useCallback<SharedTransitionActions['cancel']>(
    (eventId) => {
      if (
        eventId &&
        flightRef.current?.eventId !== eventId &&
        returnFlight.current?.eventId !== eventId
      )
        return;
      markTransition('cancel', { phase: flightRef.current?.phase ?? 'idle' });
      const returnedToSource = flightRef.current?.phase === 'closed';
      returnFlight.current = undefined;
      const finishClose = closeCallback.current;
      closeCallback.current = undefined;
      clearTimers();
      sequence.current += 1;
      primed.current = undefined;
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

  const startFlight = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.phase !== 'landing' || !current.targetCover) return;
    clearTimers();
    markTransition('takeoff-ready');
    setFlight({ ...current, phase: 'flying' });
    timers.current.complete = setTimeout(
      () => cancelFlight(current.id),
      eventSharedMotion.timeoutMs,
    );
  }, [cancelFlight]);

  /** Wait for the destination cover and bitmap; text never delays take-off. */
  const tryStart = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.phase !== 'landing' || !current.targetCover) return;
    const coverReady = !!current.coverReady || graces.current.image;
    if (coverReady) {
      startFlight();
      return;
    }
    if (!coverReady && !timers.current.image) {
      timers.current.image = setTimeout(() => {
        if (flightRef.current?.id !== current.id) return;
        graces.current.image = true;
        tryStart();
      }, eventSharedMotion.imageGraceMs);
    }
  }, [startFlight]);

  const markCoverReady = useCallback(
    (id: number) => {
      const current = flightRef.current;
      if (!current || current.id !== id || current.coverReady) return;
      markTransition('cover-ready', { phase: current.phase });
      if (current.phase === 'returning') {
        clearTimers();
        setFlight({ ...current, coverReady: true, phase: 'closing' });
        timers.current.complete = setTimeout(() => cancelFlight(id), eventSharedMotion.timeoutMs);
      } else {
        setFlight({ ...current, coverReady: true });
        tryStart();
      }
    },
    [tryStart, cancelFlight],
  );

  const prime = useCallback<SharedTransitionActions['prime']>(
    (eventId, source) => {
      if (reducedMotion || flightRef.current || opening.current) return;
      const generation = sequence.current;
      measureSource(source, root, (frames) => {
        if (frames && generation === sequence.current && !opening.current && !flightRef.current) {
          primed.current = { eventId, frames, at: Date.now() };
        }
      });
    },
    [reducedMotion],
  );

  const open = useCallback<SharedTransitionActions['open']>(
    (eventId, source, navigate) => {
      markTransition('open-request', { phase: flightRef.current?.phase ?? 'idle' });
      if (flightRef.current || opening.current) {
        markTransition('open-rejected');
        return;
      }
      if (reducedMotion || !root.current || !source.imageUri) {
        navigate(reducedMotion);
        return;
      }
      const id = ++sequence.current;
      const begin = (frames: SourceFrames | null) => {
        if (sequence.current !== id) return;
        if (!frames) {
          opening.current = false;
          navigate(false);
          return;
        }
        progress.value = 0;
        graces.current = { image: false };
        setFlight({
          id,
          eventId,
          imageUri: source.imageUri,
          source: frames,
          sourceNode: source,
          rotation: 0,
          phase: 'landing',
        });
        timers.current.land = setTimeout(() => cancelFlight(id), eventSharedMotion.landTimeoutMs);
        markTransition('navigate');
        navigate(true);
      };
      opening.current = true;
      const cached = primed.current;
      primed.current = undefined;
      if (
        cached &&
        cached.eventId === eventId &&
        Date.now() - cached.at < eventSharedMotion.primedFrameTtlMs
      ) {
        begin(cached.frames);
        return;
      }
      // Measurement can be absent for a recycled/unmounted row. Never strand a tap.
      let settled = false;
      const fallback = setTimeout(() => {
        if (settled || sequence.current !== id) return;
        settled = true;
        opening.current = false;
        navigate(false);
      }, eventSharedMotion.measureTimeoutMs);
      timers.current.measure = fallback;
      measureSource(source, root, (frames) => {
        if (settled || sequence.current !== id) return;
        settled = true;
        clearTimeout(fallback);
        begin(frames);
      });
    },
    [cancelFlight, progress, reducedMotion],
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
        tryStart();
      });
    },
    [tryStart],
  );

  const complete = useCallback(
    (id: number) => {
      const current = flightRef.current;
      if (!current || current.id !== id) return;
      clearTimers();
      opening.current = false;
      if (current.phase === 'closing') {
        // Keep the page contracted until navigation removes it. Resetting here
        // would flash a full-size Details page during the stack's close fade.
        markTransition('return-complete-js');
        setFlight({ ...current, phase: 'closed' });
        const callback = closeCallback.current;
        closeCallback.current = undefined;
        callback?.(true);
      } else if (current.phase === 'flying') {
        returnFlight.current = current;
        setFlight(undefined);
      } else {
        cancel();
      }
    },
    [cancel],
  );

  const close = useCallback<SharedTransitionActions['close']>(
    (eventId, onClosed) => {
      markTransition('close-request');
      if (
        closeCallback.current ||
        flightRef.current?.phase === 'closing' ||
        flightRef.current?.phase === 'closed'
      )
        return true;
      const previous = returnFlight.current;
      if (reducedMotion || !previous || previous.eventId !== eventId || flightRef.current)
        return false;
      returnFlight.current = undefined;
      const id = ++sequence.current;
      closeCallback.current = onClosed;
      let settled = false;
      const fallback = () => {
        if (settled || sequence.current !== id) return;
        settled = true;
        cancel();
      };
      timers.current.measure = setTimeout(fallback, eventSharedMotion.measureTimeoutMs);
      measureSource(previous.sourceNode, root, (frames) => {
        if (settled || sequence.current !== id) return;
        if (!frames || frames.cover.y < 0 || frames.cover.y + frames.cover.height > height) {
          fallback();
          return;
        }
        measureNode(previous.destinationRef?.current, (destination) => {
          if (settled || sequence.current !== id) return;
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
            if (settled || sequence.current !== id) return;
            settled = true;
            clearTimers();
            progress.value = 1;
            setFlight({
              ...previous,
              id,
              source: frames,
              targetCover: toLocal(destination, rootFrame),
              coverReady: false,
              phase: 'returning',
            });
            timers.current.image = setTimeout(
              () => cancelFlight(id),
              eventSharedMotion.imageGraceMs,
            );
          });
        });
      });
      return true;
    },
    [cancel, cancelFlight, height, progress, reducedMotion],
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
    () => ({ prime, open, land, cancel, close, progress }),
    [prime, open, land, cancel, close, progress],
  );
  const eventId = flight?.eventId;
  const phase = flight?.phase;
  const sourceCover = flight?.source.cover;
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
              onCoverReady={() => markCoverReady(flight.id)}
              onComplete={() => complete(flight.id)}
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
  const moving = phase === 'flying' || phase === 'closing';
  const canBlur = Platform.OS === 'android' && Number(Platform.Version) >= 31;
  // Keep radius fixed while moving, but clear it on the UI thread near the
  // source endpoint. A delayed JS completion must not leave the feed blurred.
  const style = useAnimatedStyle(() => ({
    filter: canBlur
      ? [{ blur: moving && progress.value > 0.04 ? eventSharedMotion.backdropBlur : 0 }]
      : [],
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
  const { progress, cancel, close } = useEventSharedTransition();
  const { eventId: activeEventId, phase, sourceCover } = useEventSharedTransitionState();
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
  const moving = active && phase !== 'landing' && phase !== 'returning';
  const surfaceStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const from = sourceCover;
    if (!moving || !from)
      return {
        opacity: active && phase === 'landing' ? 0 : fade.value,
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
    if (!moving || !sourceCover) return { opacity: 1, transform: [{ scaleY: 1 }] };
    const p = progress.value;
    const sx = (sourceCover.width + (width - sourceCover.width) * p) / width;
    const sy = (sourceCover.height + (height - sourceCover.height) * p) / height;
    // Undo the shell's nonuniform scale: typography remains proportional and
    // appears within the page, never as a separately travelling replica.
    return {
      transform: [{ scaleY: sx / sy }],
      opacity: interpolate(p, [0, 0.35, 1], [0, 0, 1], Extrapolation.CLAMP),
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: moving
      ? interpolate(progress.value, [0, 0.2, 0.95, 1], [0, 1, 1, 0], Extrapolation.CLAMP)
      : 0,
  }));
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
        pointerEvents={active ? 'none' : 'auto'}
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
