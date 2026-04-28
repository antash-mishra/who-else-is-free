import { createContext, useCallback, useContext, useRef, ReactNode } from "react";
import { Animated, StyleSheet } from "react-native";

interface BloomContextType {
  bloom: (onPeak: () => void) => void;
  signalReady: () => void;
}

const BloomContext = createContext<BloomContextType>({ bloom: () => {}, signalReady: () => {} });

export const BloomProvider = ({ children }: { children: ReactNode }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const isActive = useRef(false);
  const isAtPeak = useRef(false);
  const pendingFade = useRef(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }).start();
  }, [opacity]);

  const bloom = useCallback((onPeak: () => void) => {
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
  }, [opacity, fadeOut]);

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
    <BloomContext.Provider value={{ bloom, signalReady }}>
      {children}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF", opacity }]}
        pointerEvents="none"
      />
    </BloomContext.Provider>
  );
};

export const useBloom = () => useContext(BloomContext);
