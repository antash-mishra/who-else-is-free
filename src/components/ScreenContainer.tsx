import { ReactNode, useEffect, useRef, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
} from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { colors, spacing } from "@theme/index";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface ScreenContainerProps {
  children: ReactNode;
  edges?: Edge[];
}

interface TouchPoint {
  x: number;
  y: number;
}

interface OrbConfig {
  size: number;
  color: string;
  glowColor: string;
  initialX: number;
  initialY: number;
  duration: number;
  delay: number;
}

// Interactive floating orb with subtle touch response
const FloatingOrb = ({
  config,
  touchPoint,
  isPressed,
}: {
  config: OrbConfig;
  touchPoint: TouchPoint | null;
  isPressed: boolean;
}) => {
  const { size, color, glowColor, initialX, initialY, duration, delay } = config;

  const anim = useRef(new Animated.Value(0)).current;
  const fleeX = useRef(new Animated.Value(0)).current;
  const fleeY = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Calculate orb center in screen coordinates
  const getOrbScreenPosition = () => {
    const bottomHalfTop = SCREEN_HEIGHT * 0.5;
    return {
      x: initialX + size / 2,
      y: bottomHalfTop + initialY + size / 2,
    };
  };

  // Base floating animation
  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.loop(
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        })
      ).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, [anim, duration, delay]);

  // Subtle touch response
  useEffect(() => {
    if (touchPoint && isPressed) {
      const orbPos = getOrbScreenPosition();
      const dx = orbPos.x - touchPoint.x;
      const dy = orbPos.y - touchPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Wide influence radius for ambient feel
      const influenceRadius = 300;

      if (distance < influenceRadius) {
        // Gentle force curve
        const normalizedDist = distance / influenceRadius;
        const force = Math.pow(1 - normalizedDist, 2) * 0.8;

        // Subtle flee distance
        const maxFlee = 50;

        const len = distance || 1;
        const targetFleeX = (dx / len) * maxFlee * force;
        const targetFleeY = (dy / len) * maxFlee * force;

        // Soft spring animation
        Animated.parallel([
          Animated.spring(fleeX, {
            toValue: targetFleeX,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.spring(fleeY, {
            toValue: targetFleeY,
            friction: 7,
            tension: 40,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: force * 0.6,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else if (!isPressed) {
      // Lazy drift back
      Animated.parallel([
        Animated.spring(fleeX, {
          toValue: 0,
          friction: 5,
          tension: 12,
          useNativeDriver: true,
        }),
        Animated.spring(fleeY, {
          toValue: 0,
          friction: 5,
          tension: 12,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [touchPoint?.x, touchPoint?.y, isPressed]);

  // Organic figure-8 motion
  const translateX = anim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 40, 0, -40, 0],
  });

  const translateY = anim.interpolate({
    inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    outputRange: [0, -25, 0, 25, 0, -25, 0, 25, 0],
  });

  // Subtle breathing scale
  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.12, 1],
  });

  // Gentle rotation
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          left: initialX,
          top: initialY,
          transform: [
            { translateX: Animated.add(translateX, fleeX) },
            { translateY: Animated.add(translateY, fleeY) },
            { scale },
            { rotate },
          ],
        },
      ]}
    >
      {/* Subtle glow layer */}
      <Animated.View
        style={[
          styles.orbGlow,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: size * 0.7,
            left: -size * 0.2,
            top: -size * 0.2,
            backgroundColor: glowColor,
            opacity: glowAnim,
          },
        ]}
      />
      {/* Core orb */}
      <LinearGradient
        colors={["transparent", color, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
      />
    </Animated.View>
  );
};

const ScreenContainer = ({ children, edges }: ScreenContainerProps) => {
  const resolvedEdges: Edge[] = edges ?? ["top", "bottom"];

  // Touch tracking - using onTouch* events which fire even when children handle gestures
  const [currentTouch, setCurrentTouch] = useState<{
    point: TouchPoint | null;
    pressed: boolean;
  }>({ point: null, pressed: false });

  // Touch handlers that capture touches globally
  const handleTouchStart = (evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    setCurrentTouch({ point: { x: pageX, y: pageY }, pressed: true });
  };

  const handleTouchMove = (evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    setCurrentTouch({ point: { x: pageX, y: pageY }, pressed: true });
  };

  const handleTouchEnd = () => {
    setCurrentTouch((prev) => ({ ...prev, pressed: false }));
  };

  // Orb configurations
  const orbs = useMemo<OrbConfig[]>(
    () => [
      {
        size: 180,
        color: "rgba(255, 235, 180, 0.35)",
        glowColor: "rgba(255, 220, 150, 0.2)",
        initialX: -20,
        initialY: 20,
        duration: 12000,
        delay: 0,
      },
      {
        size: 140,
        color: "rgba(255, 220, 160, 0.25)",
        glowColor: "rgba(255, 200, 120, 0.15)",
        initialX: SCREEN_WIDTH - 100,
        initialY: 80,
        duration: 15000,
        delay: 2000,
      },
      {
        size: 100,
        color: "rgba(255, 245, 200, 0.3)",
        glowColor: "rgba(255, 230, 170, 0.2)",
        initialX: SCREEN_WIDTH / 2 - 50,
        initialY: 140,
        duration: 10000,
        delay: 1000,
      },
    ],
    []
  );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={resolvedEdges}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Top half: solid white */}
      <View style={styles.topHalf} />

      {/* Bottom half with gradient and orbs */}
      <View style={styles.bottomHalf} pointerEvents="none">
        <LinearGradient
          colors={["#FFFFFF", "#FFF6DC"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Interactive floating orbs */}
        {orbs.map((orb, index) => (
          <FloatingOrb
            key={index}
            config={orb}
            touchPoint={currentTouch.point}
            isPressed={currentTouch.pressed}
          />
        ))}
      </View>

      {/* Content layer */}
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHalf: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#FFFFFF",
  },
  bottomHalf: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  orb: {
    position: "absolute",
    overflow: "visible",
  },
  orbGlow: {
    position: "absolute",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: spacing.md,
  },
});

export default ScreenContainer;
