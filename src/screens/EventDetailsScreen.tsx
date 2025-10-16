import { useMemo } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography } from '@theme/index';
import { RootStackParamList } from '@navigation/types';
import { useEvents } from '@context/EventsContext';
import { useAuth } from '@context/AuthContext';

type EventDetailsRoute = RouteProp<RootStackParamList, 'EventDetails'>;
type EventDetailsNavigation = NativeStackNavigationProp<RootStackParamList, 'EventDetails'>;

const readableDateLabel = (label: 'Today' | 'Tmrw') => (label === 'Today' ? 'Today' : 'Tomorrow');

const EventDetailsScreen = () => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const { events } = useEvents();
  const { user } = useAuth();

  const event = useMemo(() => events.find((item) => item.id === route.params.eventId), [events, route.params.eventId]);

  if (!event) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.fallbackContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={navigation.goBack}
            style={styles.fallbackBackButton}
          >
            <Feather name="chevron-left" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.fallbackText}>We couldn’t find that event.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = user?.id === event.ownerId;
  const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
  const scheduleLine = `${readableDateLabel(event.dateLabel)}, ${event.time}`;
  const ctaLabel = isOwner ? 'Manage Event' : 'Send Invite';

  const handleCtaPress = () => {
    if (isOwner) {
      Alert.alert('Manage Event', 'Event management tools are coming soon.');
      return;
    }
    Alert.alert('Send Invite', 'Invitation requests will be available in a future update.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.heroContainer}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="eventHero" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={colors.eventDetailGradientStart} />
              <Stop offset="100%" stopColor={colors.eventDetailGradientEnd} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#eventHero)" />
        </Svg>
        <Image source={{ uri: event.imageUri }} style={styles.heroImage} />
        <Pressable
          accessibilityRole="button"
          onPress={navigation.goBack}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={24} color={colors.buttonText} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      > */}
        <View style={styles.card}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.hostedBy}>{hostLine}</Text>

          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>Details</Text>
          <View style={styles.detailRow}>
            <Feather name="map-pin" size={18} color={colors.subText} style={styles.detailIcon} />
            <Text style={styles.detailText}>{event.location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="clock" size={18} color={colors.subText} style={styles.detailIcon} />
            <Text style={styles.detailText}>{scheduleLine}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="users" size={18} color={colors.subText} style={styles.detailIcon} />
            <Text style={styles.detailText}>{event.audience}</Text>
          </View>

          {!!event.description && (
            <>
              <View style={styles.divider} />
              <Text style={styles.description}>{event.description}</Text>
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.ctaContainer}>
        <Pressable
          accessibilityRole="button"
          onPress={handleCtaPress}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && styles.ctaButtonPressed
          ]}
        >
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.card
  },
  heroContainer: {
    height: 320,
    position: 'relative',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  backButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    height: 40,
    width: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: undefined,
    height: undefined,
    resizeMode: 'cover'
  },
  scrollContent: {
    paddingHorizontal:spacing.lg,
    paddingBottom: spacing.xl
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.md
  },
  title: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  hostedBy: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.cardMeta,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs
  },
  sectionHeading: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  detailIcon: {
    marginRight: spacing.sm
  },
  detailText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    flex: 1
  },
  description: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  ctaContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.card
  },
  ctaButton: {
    backgroundColor: colors.eventDetailButtonBackground,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center'
  },
  ctaButtonPressed: {
    opacity: 0.7
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.eventDetailButtonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  fallbackContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md
  },
  fallbackText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    textAlign: 'center'
  },
  fallbackBackButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg
  }
});

export default EventDetailsScreen;
