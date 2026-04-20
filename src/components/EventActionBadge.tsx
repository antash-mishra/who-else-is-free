import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";

import { spacing, typography } from "@theme/index";

const BADGE_HOLD_MS = 3000;
const FADE_MS = 180;

type EventActionBadgeProps = {
  visible: boolean;
  label: string;
  topOffset?: number;
  onHidden?: () => void;
};

const EventActionBadge = ({
  visible,
  label,
  topOffset = 59,
  onHidden,
}: EventActionBadgeProps) => {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [isRendered, setIsRendered] = useState(false);
  const onHiddenRef = useRef<EventActionBadgeProps["onHidden"]>(onHidden);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  const dismiss = () => {
    animationRef.current?.stop();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsRendered(false);
        onHiddenRef.current?.();
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy < -8,
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.5) {
          dismiss();
        }
      },
    }),
  ).current;

  useEffect(() => {
    animationRef.current?.stop();
    animationRef.current = null;

    if (!visible) {
      setIsRendered(false);
      translateY.setValue(-80);
      opacity.setValue(0);
      return;
    }

    setIsRendered(true);
    translateY.setValue(-80);
    opacity.setValue(0);

    const enterAnim = Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 280,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    ]);

    const exitAnim = Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    ]);

    const animation = Animated.sequence([
      enterAnim,
      Animated.delay(BADGE_HOLD_MS),
      exitAnim,
    ]);

    animationRef.current = animation;
    animation.start(({ finished }) => {
      if (finished) {
        setIsRendered(false);
        onHiddenRef.current?.();
      }
    });

    return () => {
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [opacity, translateY, visible]);

  if (!isRendered) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.badge,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <BlurView intensity={65} tint="dark" style={[StyleSheet.absoluteFill, styles.blurClip]} />
      <View style={styles.badgeOverlay} />
      <Text style={styles.badgeText}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "92%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  blurClip: {
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  badgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000066",
    borderRadius: 16,
    borderCurve: "continuous",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
});

export default EventActionBadge;
