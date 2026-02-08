import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";

import { spacing, typography } from "@theme/index";

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

  useEffect(() => {
    if (!visible) {
      return;
    }

    setIsRendered(true);
    translateY.setValue(40);
    opacity.setValue(0);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(2500),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 40,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) {
        setIsRendered(false);
        onHidden?.();
      }
    });

    return () => {
      animation.stop();
    };
  }, [onHidden, opacity, translateY, visible]);

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
