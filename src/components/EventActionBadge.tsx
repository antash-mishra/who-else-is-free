import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";

import { spacing, typography } from "@theme/index";

const BADGE_ANIMATION_MS = 200;
const BADGE_VISIBLE_TOTAL_MS = 2000;
const BADGE_HOLD_MS = BADGE_VISIBLE_TOTAL_MS - BADGE_ANIMATION_MS * 2;

type EventActionBadgeProps = {
  visible: boolean;
  label: string;
  bottomOffset?: number;
  onHidden?: () => void;
};

const EventActionBadge = ({
  visible,
  label,
  bottomOffset = spacing.md,
  onHidden,
}: EventActionBadgeProps) => {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [isRendered, setIsRendered] = useState(false);
  const onHiddenRef = useRef<EventActionBadgeProps["onHidden"]>(onHidden);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  useEffect(() => {
    animationRef.current?.stop();
    animationRef.current = null;

    if (!visible) {
      setIsRendered(false);
      translateY.setValue(40);
      opacity.setValue(0);
      return;
    }

    setIsRendered(true);
    translateY.setValue(40);
    opacity.setValue(0);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: BADGE_ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: BADGE_ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(BADGE_HOLD_MS),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 40,
          duration: BADGE_ANIMATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: BADGE_ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]),
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
          bottom: bottomOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.badgeOverlay} />
      <Text style={styles.badgeText}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    alignSelf: "center",
    minWidth: 112,
    minHeight: 32,
    paddingVertical: 10,
    paddingHorizontal: 11,
    gap: spacing.xs,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#00000099",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 14,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.2,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});

export default EventActionBadge;
