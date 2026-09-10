import { useEffect } from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import WarningIcon from '@assets/ui/error.svg';
import { FrostedSurface } from '@components/ui';
import { Springs } from '@theme/springs';
import { spacing } from '@theme/index';

import styles from '../CreateEventScreen.styles';

type CreateEventSubmitButtonProps = {
  label: string;
  submitError: string | null;
  isSubmitting: boolean;
  isEditing: boolean;
  bottomInset: number;
  onPress: () => void;
};

/**
 * Create/Edit Event footer: error row plus the primary submit button with
 * press-scale motion and the "Creating..." shimmer.
 */
const CreateEventSubmitButton = ({
  label,
  submitError,
  isSubmitting,
  isEditing,
  bottomInset,
  onPress,
}: CreateEventSubmitButtonProps) => {
  const reducedMotion = useReducedMotion();
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
    cancelAnimation(shimmerX);
    if (isSubmitting && !isEditing && !reducedMotion) {
      shimmerX.value = -160;
      shimmerX.value = withRepeat(
        withSequence(
          withTiming(360, { duration: 1100, easing: Easing.linear }),
          withTiming(-160, { duration: 0 }),
        ),
        -1,
      );
    }
    return () => cancelAnimation(shimmerX);
  }, [isSubmitting, isEditing, reducedMotion, shimmerX]);

  return (
    <View
      style={[styles.footer, { paddingBottom: spacing.xl + bottomInset }]}
      testID="create-event-footer"
    >
      {submitError ? (
        <View style={styles.errorContainer}>
          <WarningIcon width={14} height={14} style={{ alignSelf: 'center' }} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      <Pressable
        style={{ width: '100%' }}
        onPress={onPress}
        onPressIn={() => {
          if (!isSubmitting && !reducedMotion) buttonScale.value = withSpring(0.96, Springs.snappy);
        }}
        onPressOut={() => {
          buttonScale.value = reducedMotion ? 1 : withSpring(1, Springs.press);
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
          {/* Frosted-glass backing over the translucent white fill (primaryButton bg)
              that keeps it reading as white. */}
          <FrostedSurface tint="light" intensity={60} style={StyleSheet.absoluteFill} />
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
                <Text style={[styles.primaryButtonText, shimmerStyles.dimText]}>Creating...</Text>
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
