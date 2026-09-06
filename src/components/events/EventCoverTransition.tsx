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

import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { eventCoverMotion } from '@theme/motion';

export interface CoverFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CoverFlight {
  id: number;
  eventId: string;
  imageUri: string;
  source: CoverFrame;
  target?: CoverFrame;
  rotation?: number;
}

interface CoverTransitionContextValue {
  activeEventId?: string;
  open: (
    eventId: string,
    imageUri: string,
    ref: RefObject<View | null>,
    navigate: (shared: boolean) => void,
  ) => void;
  land: (eventId: string, frame: CoverFrame, rotation: number) => void;
  cancel: () => void;
}

const Context = createContext<CoverTransitionContextValue>({
  open: (_id, _uri, _ref, navigate) => navigate(false),
  land: () => undefined,
  cancel: () => undefined,
});

export const useEventCoverTransition = () => useContext(Context);

export const isValidCoverFrame = (frame: CoverFrame): boolean =>
  Object.values(frame).every(Number.isFinite) && frame.width > 0 && frame.height > 0;

const FlyingCover = ({ flight, onComplete }: { flight: CoverFlight; onComplete: () => void }) => {
  const progress = useSharedValue(0);
  const [loaded, setLoaded] = useState(false);
  const { source, target, rotation = 0 } = flight;
  useEffect(() => {
    if (!target || !loaded) return;
    progress.value = withTiming(
      1,
      {
        duration: eventCoverMotion.durationMs,
        easing: Easing.inOut(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(onComplete)();
      },
    );
  }, [loaded, onComplete, progress, target]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const end = target ?? source;
    return {
      left: source.x + (end.x - source.x) * p,
      top: source.y + (end.y - source.y) * p,
      width: source.width + (end.width - source.width) * p,
      height: source.height + (end.height - source.height) * p,
      borderRadius:
        eventCoverMotion.cardRadius +
        (eventCoverMotion.heroRadius - eventCoverMotion.cardRadius) * p,
      transform: [{ rotate: `${rotation * p}deg` }],
    };
  });
  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.cover, style]}>
        <Image
          source={{ uri: flight.imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
          onLoad={() => setLoaded(true)}
          onError={onComplete}
        />
      </Animated.View>
    </View>
  );
};

/** One window-coordinate overlay shared by all event lists and the detail hero. */
export const EventCoverTransitionProvider = ({ children }: { children: ReactNode }) => {
  const root = useRef<View>(null);
  const sequence = useRef(0);
  const opening = useRef(false);
  const [flight, setFlight] = useState<CoverFlight>();
  const reducedMotion = useReducedMotion();
  const cancel = useCallback(() => {
    opening.current = false;
    setFlight(undefined);
  }, []);
  useEffect(() => {
    if (!flight) return;
    const timeout = setTimeout(cancel, eventCoverMotion.timeoutMs);
    return () => clearTimeout(timeout);
  }, [flight, cancel]);
  const open = useCallback<CoverTransitionContextValue['open']>(
    (eventId, imageUri, ref, navigate) => {
      if (opening.current) return;
      if (reducedMotion || !ref.current || !root.current || !imageUri) {
        navigate(reducedMotion);
        return;
      }
      opening.current = true;
      // Measurement can be absent for a recycled/unmounted row. Never strand a tap.
      let settled = false;
      const fallback = setTimeout(() => {
        if (settled) return;
        settled = true;
        opening.current = false;
        navigate(false);
      }, eventCoverMotion.measureTimeoutMs);
      ref.current.measureInWindow((x, y, width, height) => {
        root.current?.measureInWindow((rootX, rootY) => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          const source = { x: x - rootX, y: y - rootY, width, height };
          if (!isValidCoverFrame(source)) {
            opening.current = false;
            navigate(false);
            return;
          }
          setFlight({ id: ++sequence.current, eventId, imageUri, source });
          navigate(true);
        });
      });
    },
    [reducedMotion],
  );
  const land = useCallback<CoverTransitionContextValue['land']>((eventId, frame, rotation) => {
    if (!isValidCoverFrame(frame)) return;
    root.current?.measureInWindow((x, y) => {
      setFlight((current) =>
        current?.eventId === eventId && !current.target
          ? { ...current, target: { ...frame, x: frame.x - x, y: frame.y - y }, rotation }
          : current,
      );
    });
  }, []);
  const value = useMemo(
    () => ({ activeEventId: flight?.eventId, open, land, cancel }),
    [flight?.eventId, open, land, cancel],
  );
  return (
    <Context.Provider value={value}>
      <View ref={root} collapsable={false} style={styles.root}>
        {children}
        {flight && <FlyingCover key={flight.id} flight={flight} onComplete={cancel} />}
      </View>
    </Context.Provider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  cover: { position: 'absolute', overflow: 'hidden', borderCurve: 'continuous' },
});
