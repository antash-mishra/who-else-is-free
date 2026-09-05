/* eslint-disable react-hooks/immutability, react-hooks/refs, react-hooks/set-state-in-effect -- Reanimated banner shared values are mutated by gesture worklets and transitions, and mount state follows the animations. */
import { useCallback, useEffect, useRef, useState } from 'react';

import { AccessibilityInfo, LayoutChangeEvent, Platform, Text, View } from 'react-native';

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppNotification } from '@api/mappers/notifications';
import ScalePressable from '@components/ScalePressable';
import UserAvatar from '@components/UserAvatar';
import { triggerHaptic } from '@services/haptics';
import { componentTokens } from '@theme/index';
import { Springs, durations } from '@theme/springs';
import { buildBannerContent } from '@utils/notificationBanner';
import { notificationPlainText } from '@utils/notificationDisplay';

import { notificationBannerStyles as styles } from './NotificationBanner.styles';

// Same commit thresholds as AnimatedPager so swipes feel consistent app-wide.
const SWIPE_DISTANCE = 50;
const SWIPE_VELOCITY = 500; // px/s
const SNAPBACK_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) } as const;
const EXIT_TIMING = { duration: durations.outgoingFade * 1.5, easing: Easing.in(Easing.cubic) };
// Used until the first layout reports the real height.
const FALLBACK_HIDDEN_Y = -160;

export type NotificationBannerProps = {
  /** The notification to show; `null` hides the banner. */
  notification: AppNotification | null;
  /** Fallback image when the notification payload carries none; else a seeded monogram. */
  imageUri?: string;
  onPress: (notification: AppNotification) => void;
  /** Fired once the exit animation has finished (auto-hide, swipe, or tap). */
  onDismissed: () => void;
  holdMs?: number;
  testID?: string;
};

/**
 * NotificationBanner: a top-anchored, tappable, swipe-up-to-dismiss preview of
 * an inbox row that just arrived while the app is in the foreground. It is
 * rendered once by NotificationBannerHost above the navigator; screens must
 * not mount their own.
 */
const NotificationBanner = ({
  notification,
  imageUri,
  onPress,
  onDismissed,
  holdMs = componentTokens.banner.holdMs,
  testID = 'notification-banner',
}: NotificationBannerProps) => {
  const { top: safeTop } = useSafeAreaInsets();
  const topOffset = safeTop + componentTokens.banner.topOffset;
  // Keep the last notification mounted through the exit animation.
  const [displayed, setDisplayed] = useState<AppNotification | null>(notification);
  // Fall back to the monogram when the cover fails to load (e.g. missing asset).
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const translateY = useSharedValue(FALLBACK_HIDDEN_Y);
  const hiddenY = useSharedValue(FALLBACK_HIDDEN_Y);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissedRef = useRef(onDismissed);

  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const finishDismiss = useCallback(() => {
    setDisplayed(null);
    onDismissedRef.current();
  }, []);

  const dismiss = useCallback(() => {
    clearHoldTimer();
    cancelAnimation(translateY);
    translateY.value = withTiming(hiddenY.value, EXIT_TIMING, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)();
      }
    });
  }, [clearHoldTimer, finishDismiss, hiddenY, translateY]);

  const startHoldTimer = useCallback(() => {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(dismiss, holdMs);
  }, [clearHoldTimer, dismiss, holdMs]);

  // Enter (or replace in place) when a notification arrives; exit when cleared.
  useEffect(() => {
    if (notification) {
      setDisplayed(notification);
      cancelAnimation(translateY);
      translateY.value = withSpring(0, Springs.bouncyUp);
      triggerHaptic('light');
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibility(notificationPlainText(notification));
      }
      startHoldTimer();
      return clearHoldTimer;
    }
    if (displayed) {
      dismiss();
    }
    return undefined;
    // `displayed` is intentionally omitted: it only gates the exit branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification, clearHoldTimer, dismiss, startHoldTimer, translateY]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0) {
        hiddenY.value = -(height + topOffset);
      }
    },
    [hiddenY, topOffset],
  );

  const handlePress = useCallback(() => {
    if (!displayed) return;
    onPress(displayed);
    dismiss();
  }, [dismiss, displayed, onPress]);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-25, 25])
    .onBegin(() => {
      runOnJS(clearHoldTimer)();
    })
    .onUpdate((event) => {
      // Follow the finger upward only; downward drags stay pinned.
      translateY.value = Math.min(0, event.translationY);
    })
    .onEnd((event) => {
      const committed = event.translationY < -SWIPE_DISTANCE || event.velocityY < -SWIPE_VELOCITY;
      if (committed) {
        translateY.value = withTiming(hiddenY.value, EXIT_TIMING, (finished) => {
          if (finished) {
            runOnJS(finishDismiss)();
          }
        });
      } else {
        translateY.value = withTiming(0, SNAPBACK_TIMING);
        runOnJS(startHoldTimer)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!displayed) {
    return null;
  }

  const plainText = notificationPlainText(displayed);
  const content = buildBannerContent(displayed);
  const avatarUri = content.avatar.imageUri ?? imageUri;
  const showImage = !!avatarUri && failedImageUri !== avatarUri;

  return (
    <View
      style={[styles.wrapper, { top: topOffset }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      testID={`${testID}-wrapper`}
    >
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, animatedStyle]} onLayout={handleLayout}>
          <BlurView
            intensity={componentTokens.banner.blurIntensity}
            tint="dark"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={styles.blur}
          />
          <View pointerEvents="none" style={styles.tint} />
          <ScalePressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`${content.kindLabel}. ${plainText}`}
            haptic="light"
            testID={testID}
          >
            <View style={styles.content}>
              <View style={styles.avatar}>
                {showImage ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    transition={150}
                    onError={() => setFailedImageUri(avatarUri)}
                    accessibilityElementsHidden
                  />
                ) : (
                  <UserAvatar
                    name={content.avatar.name}
                    seed={content.avatar.seed}
                    size={componentTokens.banner.avatarSize}
                  />
                )}
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>
                    {content.title}
                    {content.context ? (
                      <Text style={styles.context}>{`  ·  ${content.context}`}</Text>
                    ) : null}
                  </Text>
                  <Text style={styles.kind} numberOfLines={1}>
                    {content.kindLabel}
                  </Text>
                </View>
                {content.body ? (
                  <Text style={styles.body} numberOfLines={2}>
                    {content.body}
                  </Text>
                ) : null}
              </View>
            </View>
          </ScalePressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

export default NotificationBanner;
