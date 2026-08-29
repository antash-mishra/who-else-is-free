import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { Animated, StyleSheet } from 'react-native';

import { colors } from '@theme/index';

interface BloomContextType {
  bloom: (onPeak: () => void) => void;
  signalReady: () => void;
  transitionComplete: boolean;
}

const BloomContext = createContext<BloomContextType>({
  bloom: () => {},
  signalReady: () => {},
  transitionComplete: false,
});

export const BloomProvider = ({ children }: { children: ReactNode }) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const isActive = useRef(false);
  const isAtPeak = useRef(false);
  const pendingFade = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transitionComplete, setTransitionComplete] = useState(false);

  const fadeOut = useCallback(() => {
    if (fallbackTimer.current) {
      clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
    isActive.current = false;
    isAtPeak.current = false;
    pendingFade.current = false;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setTransitionComplete(true);
      }
    });
  }, [opacity]);

  const bloom = useCallback(
    (onPeak: () => void) => {
      setTransitionComplete(false);
      isActive.current = true;
      isAtPeak.current = false;
      pendingFade.current = false;

      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onPeak();
        isAtPeak.current = true;
        if (pendingFade.current) {
          fadeOut();
        } else {
          // Safety fallback: never block the app for more than 3s
          fallbackTimer.current = setTimeout(fadeOut, 3000);
        }
      });
    },
    [opacity, fadeOut],
  );

  const signalReady = useCallback(() => {
    if (!isActive.current) return;
    const doFade = () => {
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
      fallbackTimer.current = setTimeout(fadeOut, 250);
    };
    if (isAtPeak.current) {
      doFade();
    } else {
      pendingFade.current = true;
    }
  }, [fadeOut]);

  return (
    <BloomContext.Provider value={{ bloom, signalReady, transitionComplete }}>
      {children}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, opacity }]}
        pointerEvents="none"
      />
    </BloomContext.Provider>
  );
};

export const useBloom = () => useContext(BloomContext);
