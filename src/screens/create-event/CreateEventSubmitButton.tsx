import { useEffect, useRef } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import WarningIcon from '@assets/ui/error.svg';
import { Springs } from '@theme/springs';

import styles from '../CreateEventScreen.styles';

export type ButtonLayout = { x: number; y: number; width: number; height: number };

type CreateEventSubmitButtonProps = {
  label: string;
  submitError: string | null;
  isSubmitting: boolean;
  isEditing: boolean;
  onPress: () => void;
  onMeasured: (layout: ButtonLayout) => void;
};

/**
 * Create/Edit Event footer: error row plus the primary submit button with
 * press-scale motion, the "Creating..." shimmer, and window-position
 * measurement used by the EventCreated wow transition.
 */
const CreateEventSubmitButton = ({
  label,
  submitError,
  isSubmitting,
  isEditing,
  onPress,
  onMeasured,
}: CreateEventSubmitButtonProps) => {
  const primaryButtonRef = useRef<View>(null);

  // Shimmer animation for "Creating..." state
  const shimmerX = useSharedValue(-160);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }],
  }));

  const buttonScale = useSharedValue(1);
  const buttonScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  useEffect(() => {
    if (isSubmitting && !isEditing) {
      shimmerX.value = -160;
      shimmerX.value = withRepeat(
        withSequence(
          withTiming(360, { duration: 1100, easing: Easing.linear }),
          withTiming(-160, { duration: 0 }),
        ),
        -1,
      );
    }
  }, [isSubmitting]);

  return (
    <View style={styles.footer}>
      {submitError ? (
        <View style={styles.errorContainer}>
          <WarningIcon width={14} height={14} style={{ alignSelf: 'center' }} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      <Pressable
        ref={primaryButtonRef}
        onLayout={() => {
          primaryButtonRef.current?.measureInWindow((x, y, w, h) => {
            onMeasured({ x, y, width: w, height: h });
          });
        }}
        style={{ width: '100%' }}
        onPress={onPress}
        onPressIn={() => {
          if (!isSubmitting) buttonScale.value = withSpring(0.96, Springs.snappy);
        }}
        onPressOut={() => {
          buttonScale.value = withSpring(1, Springs.press);
        }}
        disabled={isSubmitting}
        accessibilityRole="button"
        testID="create-event-submit"
      >
        <Animated.View
          style={[
            styles.primaryButton,
            isSubmitting && styles.primaryButtonDisabled,
            buttonScaleStyle,
          ]}
        >
          {/* Frosted-glass backing: light blur lets the content behind show through,
              the translucent white fill (primaryButton bg) keeps it reading as white. */}
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
          {isSubmitting && !isEditing ? (
            <MaskedView
              style={shimmerStyles.root}
              maskElement={
                <View style={shimmerStyles.mask}>
                  <Text style={styles.primaryButtonText}>Creating...</Text>
                </View>
              }
            >
              <View style={shimmerStyles.mask}>
                <Text style={[styles.primaryButtonText, shimmerStyles.dimText]}>
                  Creating...
                </Text>
              </View>
              <Animated.View style={[shimmerStyles.strip, shimmerStyle]} pointerEvents="none">
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.8)', 'transparent']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </MaskedView>
          ) : (
            <Text style={styles.primaryButtonText}>{label}</Text>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
};

const shimmerStyles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  mask: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  dimText: {
    opacity: 0.45,
  },
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 160,
  },
});

export default CreateEventSubmitButton;
