import { useEffect, useRef } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import ScalePressable from '@components/ScalePressable';
import { triggerHaptic } from '@services/haptics';
import { Motion } from '@theme/motion';

import styles from './EventDetailsScreen.styles';

type EventDetailsCTAProps = {
  showStandardCta: boolean;
  showOpenChatCta: boolean;
  shouldShowInvitePrompt: boolean;
  hasPendingRequest: boolean;
  ctaLabel: string;
  isOwner: boolean;
  bottomInset: number;
  onCtaPress: () => void;
  onOpenChat: () => void;
  /** Change this to replay the stamp, e.g. 'idle' -> 'requested'. */
  stampKey?: string;
};

/**
 * Pinned bottom CTAs for Event Details: the Interested/Pending Request button
 * and the Go to Chat button, each over a white fade gradient.
 */
const EventDetailsCTA = ({
  showStandardCta,
  showOpenChatCta,
  shouldShowInvitePrompt,
  hasPendingRequest,
  ctaLabel,
  isOwner,
  bottomInset,
  onCtaPress,
  onOpenChat,
  stampKey,
}: EventDetailsCTAProps) => {
  const reducedMotion = useReducedMotion();
  const stampScale = useSharedValue(1);
  const stampRotate = useSharedValue(0);
  const previousStampKey = useRef(stampKey);

  useEffect(() => {
    if (stampKey === previousStampKey.current) {
      return;
    }
    previousStampKey.current = stampKey;
    if (reducedMotion || stampKey == null) {
      return;
    }
    triggerHaptic('success');
    stampScale.value = withSequence(withTiming(1.4, { duration: 0 }), withSpring(1, Motion.settle));
    stampRotate.value = withSequence(withTiming(-4, { duration: 0 }), withSpring(0, Motion.settle));
  }, [reducedMotion, stampKey, stampRotate, stampScale]);

  const stampStyle = useAnimatedStyle(() => ({
    transform: [{ scale: stampScale.value }, { rotate: `${stampRotate.value}deg` }],
  }));

  return (
    <>
      {showStandardCta && (
        <View style={styles.pinnedCtaWrapper}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']}
            locations={[0, 0.4]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.ctaContainer,
              shouldShowInvitePrompt && styles.ctaContainerActive,
              { paddingBottom: bottomInset + 4 },
            ]}
          >
            <ScalePressable
              onPress={onCtaPress}
              disabled={shouldShowInvitePrompt || hasPendingRequest}
              style={[
                styles.ctaButton,
                (shouldShowInvitePrompt || hasPendingRequest) && styles.ctaButtonDisabled,
              ]}
            >
              <Animated.Text
                style={[
                  styles.ctaLabel,
                  (shouldShowInvitePrompt || hasPendingRequest) && styles.ctaLabelDisabled,
                  stampStyle,
                ]}
              >
                {ctaLabel}
              </Animated.Text>
            </ScalePressable>
          </View>
        </View>
      )}
      {showOpenChatCta ? (
        <View style={styles.pinnedCtaWrapper}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.8)']}
            locations={[0, 0.4]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.ctaContainer, { paddingBottom: bottomInset + 4 }]}>
            <ScalePressable
              onPress={onOpenChat}
              style={[styles.ctaButton, isOwner && styles.ctaButtonSecondary]}
            >
              <Text style={[styles.ctaLabel, isOwner && styles.ctaLabelSecondary]}>Go to chat</Text>
            </ScalePressable>
          </View>
        </View>
      ) : null}
    </>
  );
};

export default EventDetailsCTA;
