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
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type Text,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { eventSharedMotion, heroCoverSize } from '@theme/motion';

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
  title: string;
  titleStyle: StyleProp<TextStyle>;
  coverRef: RefObject<View | null>;
  titleRef: RefObject<Text | null>;
}

export interface SharedLandExtras {
  /** Resting tilt of the destination cover, in degrees. */
  rotation?: number;
  /** Text style of the destination title, so the flying replica matches it. */
  titleStyle?: StyleProp<TextStyle>;
}

/** `landing`: destination is mounting and reporting frames. `flying`: overlays are moving. */
export type SharedPhase = 'landing' | 'flying';

export interface SharedTransitionState {
  eventId?: string;
  phase?: SharedPhase;
}

interface SourceFrames {
  cover: SharedFrame;
  title?: SharedFrame;
}

interface Flight {
  id: number;
  eventId: string;
  imageUri: string;
  title: string;
  sourceTitleStyle: StyleProp<TextStyle>;
  source: SourceFrames;
  targetCover?: SharedFrame;
  rotation: number;
  targetTitle?: SharedFrame;
  targetTitleStyle?: StyleProp<TextStyle>;
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
  /** 0 → 1 over the flight; 1 whenever nothing is in flight. */
  progress: SharedValue<number>;
}

const idleProgress = makeMutable(1);

const ActionsContext = createContext<SharedTransitionActions>({
  prime: () => undefined,
  open: (_id, _source, navigate) => navigate(false),
  land: () => undefined,
  cancel: () => undefined,
  progress: idleProgress,
});

const StateContext = createContext<SharedTransitionState>({});

export const useEventSharedTransition = () => useContext(ActionsContext);
/**
 * Which event is in flight and in which phase. The tapped card hides its cover
 * and title while `flying`; the hero, the Details title, and the page hide or
 * reveal while their event is active.
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
 * Measure the pressed card's cover and title relative to the overlay root.
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
  let title: SharedFrame | null = null;
  let pending = 3;
  const step = () => {
    pending -= 1;
    if (pending > 0) return;
    if (!cover || !isValidSharedFrame(cover)) {
      onDone(null);
      return;
    }
    onDone({
      cover: toLocal(cover, rootFrame),
      title: title && isValidSharedFrame(title) ? toLocal(title, rootFrame) : undefined,
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
  measureNode(source.titleRef.current, (frame) => {
    title = frame;
    step();
  });
};

const fontSizeOf = (style: StyleProp<TextStyle>): number =>
  StyleSheet.flatten(style)?.fontSize ?? 16;

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

/**
 * The title in flight: one replica in the Details style, scaled from the
 * card's font size to its own from the shared top-left corner while it
 * travels. A single line, so a long title does not sprout its second line on
 * top of the card; the Details title takes over at hand-off, where the
 * replica is pixel-identical to its first line.
 *
 * The animated body mounts only once both frames are known, so its worklet
 * closure is constant for its whole life (see FlyingCover).
 */
const FlyingTitleBody = ({
  flight,
  from,
  to,
  progress,
}: {
  flight: Flight;
  from: SharedFrame;
  to: SharedFrame;
  progress: SharedValue<number>;
}) => {
  const startScale = fontSizeOf(flight.sourceTitleStyle) / fontSizeOf(flight.targetTitleStyle);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      // Paired with the static opacity 0: the replica only shows once this
      // animated scale has been applied, never at full size for a first frame.
      opacity: 1,
      transform: [
        { translateX: dx * p },
        { translateY: dy * p },
        { scale: startScale + (1 - startScale) * p },
      ],
    };
  });
  return (
    <Animated.Text
      testID="flying-title"
      style={[
        flight.targetTitleStyle,
        styles.title,
        { left: from.x, top: from.y, width: to.width },
        style,
      ]}
      numberOfLines={1}
    >
      {flight.title}
    </Animated.Text>
  );
};

const FlyingTitle = ({ flight, progress }: { flight: Flight; progress: SharedValue<number> }) => {
  const from = flight.source.title;
  const to = flight.targetTitle;
  // Only while flying: during the landing wait the card's own title is still
  // visible and a replica on top of it would read as a doubled title.
  if (!from || !to || flight.phase !== 'flying') return null;
  return <FlyingTitleBody flight={flight} from={from} to={to} progress={progress} />;
};

const FlightOverlay = ({
  flight,
  layoutSize,
  progress,
  onCoverReady,
  onComplete,
}: {
  flight: Flight;
  layoutSize: number;
  progress: SharedValue<number>;
  onCoverReady: () => void;
  onComplete: () => void;
}) => {
  const flying = flight.phase === 'flying';
  const started = useRef(false);
  const target = useSharedValue<CoverTarget | null>(null);
  // The provider switches to `flying` only once the destination has landed and
  // the cover bitmap is painted (or its grace passed), so take off right away.
  useEffect(() => {
    if (!flying || started.current || !flight.targetCover) return;
    started.current = true;
    const to = center(flight.targetCover);
    // Hand the UI thread the landing geometry first, then start the clock.
    target.value = {
      cx: to.x,
      cy: to.y,
      width: flight.targetCover.width,
      rotation: flight.rotation,
    };
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: eventSharedMotion.durationMs, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
  }, [flight, flying, onComplete, progress, target]);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <FlyingCover
        flight={flight}
        layoutSize={layoutSize}
        progress={progress}
        target={target}
        onLoad={onCoverReady}
        onError={onComplete}
      />
      <FlyingTitle flight={flight} progress={progress} />
    </View>
  );
};

type Timers = {
  land?: ReturnType<typeof setTimeout>;
  title?: ReturnType<typeof setTimeout>;
  image?: ReturnType<typeof setTimeout>;
  complete?: ReturnType<typeof setTimeout>;
};

/** One window-coordinate overlay shared by every event list and the Details page. */
export const EventSharedTransitionProvider = ({ children }: { children: ReactNode }) => {
  const root = useRef<View>(null);
  const sequence = useRef(0);
  const opening = useRef(false);
  const flightRef = useRef<Flight>(undefined);
  const primed = useRef<{ eventId: string; frames: SourceFrames; at: number }>(undefined);
  const timers = useRef<Timers>({});
  const graces = useRef({ title: false, image: false });
  const [flight, setFlightState] = useState<Flight>();
  // Reset to 0 at open so the page mounts invisible; the overlay drives it to 1.
  const progress = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const layoutSize = heroCoverSize(useWindowDimensions().width);

  const clearTimers = () => {
    const current = timers.current;
    if (current.land) clearTimeout(current.land);
    if (current.title) clearTimeout(current.title);
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
      if (eventId && (!flightRef.current || flightRef.current.eventId !== eventId)) return;
      clearTimers();
      opening.current = false;
      progress.value = 1;
      setFlight(undefined);
    },
    [progress],
  );

  const startFlight = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.phase !== 'landing' || !current.targetCover) return;
    clearTimers();
    setFlight({ ...current, phase: 'flying' });
    timers.current.complete = setTimeout(() => cancel(), eventSharedMotion.timeoutMs);
  }, [cancel]);

  /**
   * Take off once the cover has landed, the title has landed (or its grace
   * passed), and the cover bitmap is painted (or its grace passed). The card
   * hides its own cover at take-off, so flying before the bitmap is painted
   * would leave an empty slot for a few frames.
   */
  const tryStart = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.phase !== 'landing' || !current.targetCover) return;
    const titleReady = !!current.targetTitle || !current.source.title || graces.current.title;
    const coverReady = !!current.coverReady || graces.current.image;
    if (titleReady && coverReady) {
      startFlight();
      return;
    }
    if (!titleReady && !timers.current.title) {
      timers.current.title = setTimeout(() => {
        graces.current.title = true;
        tryStart();
      }, eventSharedMotion.titleGraceMs);
    }
    if (!coverReady && !timers.current.image) {
      timers.current.image = setTimeout(() => {
        graces.current.image = true;
        tryStart();
      }, eventSharedMotion.imageGraceMs);
    }
  }, [startFlight]);

  const markCoverReady = useCallback(() => {
    const current = flightRef.current;
    if (!current || current.coverReady) return;
    setFlight({ ...current, coverReady: true });
    tryStart();
  }, [tryStart]);

  const prime = useCallback<SharedTransitionActions['prime']>(
    (eventId, source) => {
      if (reducedMotion || flightRef.current || opening.current) return;
      measureSource(source, root, (frames) => {
        if (frames) primed.current = { eventId, frames, at: Date.now() };
      });
    },
    [reducedMotion],
  );

  const open = useCallback<SharedTransitionActions['open']>(
    (eventId, source, navigate) => {
      if (flightRef.current || opening.current) return;
      if (reducedMotion || !root.current || !source.imageUri) {
        navigate(reducedMotion);
        return;
      }
      const begin = (frames: SourceFrames | null) => {
        if (!frames) {
          opening.current = false;
          navigate(false);
          return;
        }
        progress.value = 0;
        graces.current = { title: false, image: false };
        setFlight({
          id: ++sequence.current,
          eventId,
          imageUri: source.imageUri,
          title: source.title,
          sourceTitleStyle: source.titleStyle,
          source: frames,
          rotation: 0,
          phase: 'landing',
        });
        timers.current.land = setTimeout(() => cancel(), eventSharedMotion.landTimeoutMs);
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
        if (settled) return;
        settled = true;
        opening.current = false;
        navigate(false);
      }, eventSharedMotion.measureTimeoutMs);
      measureSource(source, root, (frames) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallback);
        begin(frames);
      });
    },
    [cancel, progress, reducedMotion],
  );

  const land = useCallback<SharedTransitionActions['land']>(
    (eventId, element, frame, extras) => {
      const current = flightRef.current;
      if (!current || current.eventId !== eventId || current.phase !== 'landing') return;
      if (!isValidSharedFrame(frame)) return;
      if (element === 'cover' ? current.targetCover : current.targetTitle) return;
      measureNode(root.current, (rootFrame) => {
        const latest = flightRef.current;
        if (!latest || latest.id !== current.id || latest.phase !== 'landing') return;
        const local = toLocal(frame, rootFrame);
        const next: Flight =
          element === 'cover'
            ? { ...latest, targetCover: local, rotation: extras?.rotation ?? 0 }
            : { ...latest, targetTitle: local, targetTitleStyle: extras?.titleStyle };
        setFlight(next);
        tryStart();
      });
    },
    [tryStart],
  );

  useEffect(() => () => clearTimers(), []);

  const actions = useMemo(
    () => ({ prime, open, land, cancel, progress }),
    [prime, open, land, cancel, progress],
  );
  const eventId = flight?.eventId;
  const phase = flight?.phase;
  const state = useMemo<SharedTransitionState>(() => ({ eventId, phase }), [eventId, phase]);
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        <View ref={root} collapsable={false} style={styles.root}>
          {children}
          {flight && (
            <FlightOverlay
              key={flight.id}
              flight={flight}
              layoutSize={layoutSize}
              progress={progress}
              onCoverReady={markCoverReady}
              onComplete={cancel}
            />
          )}
        </View>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
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
  const { progress, cancel } = useEventSharedTransition();
  const { eventId: activeEventId, phase } = useEventSharedTransitionState();
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
  useEffect(
    () => () => {
      if (enabled) cancel(eventId);
    },
    [cancel, enabled, eventId],
  );
  const animatedStyle = useAnimatedStyle(() => {
    const reveal = active
      ? interpolate(
          progress.value,
          [0, eventSharedMotion.pageRevealEnd],
          [0, 1],
          Extrapolation.CLAMP,
        )
      : 1;
    return { opacity: Math.min(reveal, fade.value) };
  });
  return (
    <Animated.View
      style={[style, animatedStyle]}
      pointerEvents={active ? 'none' : 'auto'}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { position: 'absolute', overflow: 'hidden', borderCurve: 'continuous' },
  title: { position: 'absolute', transformOrigin: 'top left', opacity: 0 },
});
