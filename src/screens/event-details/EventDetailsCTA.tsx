import { StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import ScalePressable from '@components/ScalePressable';

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
}: EventDetailsCTAProps) => (
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
            <Text
              style={[
                styles.ctaLabel,
                (shouldShowInvitePrompt || hasPendingRequest) && styles.ctaLabelDisabled,
              ]}
            >
              {ctaLabel}
            </Text>
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

export default EventDetailsCTA;
