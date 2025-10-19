import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography } from '@theme/index';
import { RootStackParamList } from '@navigation/types';
import { useEvents, UserEvent } from '@context/EventsContext';
import { useAuth } from '@context/AuthContext';
import EventActionOverlay from '@components/EventActionOverlay';

type EventDetailsRoute = RouteProp<RootStackParamList, 'EventDetails'>;
type EventDetailsNavigation = NativeStackNavigationProp<RootStackParamList, 'EventDetails'>;

const readableDateLabel = (label: 'Today' | 'Tmrw') => (label === 'Today' ? 'Today' : 'Tomorrow');

const EventDetailsScreen = () => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const { events, deleteUserEvent } = useEvents();
  const { user } = useAuth();

  const rawEvent = useMemo(
    () => events.find((item) => item.id === route.params.eventId),
    [events, route.params.eventId]
  );
  const [eventSnapshot, setEventSnapshot] = useState<UserEvent | null>(() => rawEvent ?? null);
  useEffect(() => {
    if (rawEvent) {
      setEventSnapshot(rawEvent);
    }
  }, [rawEvent]);
  const event = eventSnapshot;
  const origin = route.params.origin ?? 'Events';
  const [showInvitePrompt, setShowInvitePrompt] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [showManagePrompt, setShowManagePrompt] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResultVisible, setDeleteResultVisible] = useState(false);

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
          <Text style={styles.fallbackText}>We couldn't find that event.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = user?.id === event.ownerId;
  const shouldShowInvitePrompt = showInvitePrompt && !isOwner;
  const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
  const scheduleLine = `${readableDateLabel(event.dateLabel)}, ${event.time}`;
  const ctaLabel = isOwner ? 'Manage Event' : 'Interested';

  const handleCtaPress = () => {
    if (isOwner) {
      setShowManagePrompt(true);
      return;
    }
    setShowInvitePrompt((prev) => !prev);
  };

  const handleSendInvite = () => {
    Alert.alert('Request Sent', 'Invitation requests will be available in a future update.');
    setInviteMessage('');
    setShowInvitePrompt(false);
  };

  const handleEdit = () => {
    (navigation as any).navigate('Main', { screen: 'Create', params: { editEventId: event.id } });
    setShowManagePrompt(false);
  };

  const handleDeletePrompt = () => {
    setShowManagePrompt(false);
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!event) {
      return;
    }
    if (isDeleting) {
      return;
    }
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteUserEvent(event.id);
      setShowDeleteConfirm(false);
      setDeleteResultVisible(true);
    } catch (err) {
      console.error('Failed to delete event', err);
      setDeleteError('Unable to delete this event. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (isDeleting) {
      return;
    }
    setShowDeleteConfirm(false);
  };

  const handleDismissDeleteResult = () => {
    setDeleteResultVisible(false);
    const targetTab = origin === 'MyEvents' ? 'MyEvents' : 'Events';
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          params: { screen: targetTab }
        }
      ]
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar 
        barStyle="light-content" // For white icons/text
        backgroundColor="#FF69B4" // For Android
      />

      <View style={styles.contentWrapper}>
        <View style={styles.heroContainer}>
          <Pressable
            accessibilityRole="button"
            onPress={navigation.goBack}
            style={styles.backButton}
          >
          <Feather name="chevron-left" size={24} color={colors.buttonText} />
          </Pressable>
          
          {/* Elevated Image Card */}
          <View style={styles.imageCardContainer}>
            <Image 
              source={{ uri: event.imageUri }} // or require('./path/to/image.jpg')
              style={styles.imageCard}
              resizeMode="cover"
            />
          </View>

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
            <View style={styles.detailDiv}>
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
            </View>

            {!!event.description && (
              <>
                <Text style={styles.description}>{event.description}</Text>
              </>
            )}
          </View>
        </ScrollView>
        <View style={[styles.ctaContainer, shouldShowInvitePrompt && styles.ctaContainerActive]}>
          <Pressable
            accessibilityRole="button"
            onPress={handleCtaPress}
            style={({ pressed }) => [
              styles.ctaButton,
              isOwner && styles.ownerButton,
              pressed && styles.ctaButtonPressed,
              shouldShowInvitePrompt && styles.ctaButtonDisabled
            ]}
            disabled={shouldShowInvitePrompt}
          >
            <Text style={[styles.ctaLabel, isOwner && styles.ownerLabel, shouldShowInvitePrompt && styles.ctaLabelDisabled]}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>

      <EventActionOverlay
        isVisible={shouldShowInvitePrompt}
        onBackdropPress={() => setShowInvitePrompt(false)}
        type="invite"
        inviteMessage={inviteMessage}
        onInviteMessageChange={setInviteMessage}
        onSendInvite={handleSendInvite}
      />
      <EventActionOverlay
        isVisible={showManagePrompt}
        onBackdropPress={() => setShowManagePrompt(false)}
        type="manage"
        onEdit={handleEdit}
        onDelete={handleDeletePrompt}
      />
      <EventActionOverlay
        isVisible={showDeleteConfirm}
        onBackdropPress={isDeleting ? undefined : handleDeleteCancel}
        type="confirm"
        title="Delete this event?"
        description="This will remove the event for everyone and can't be undone."
        confirmLabel="Delete event"
        cancelLabel="Keep event"
        confirmTone="destructive"
        onConfirm={handleDelete}
        onCancel={handleDeleteCancel}
        isConfirmLoading={isDeleting}
        errorMessage={deleteError}
      />
      <EventActionOverlay
        isVisible={deleteResultVisible}
        onBackdropPress={handleDismissDeleteResult}
        type="result"
        title="Event removed"
        description="We've cleared the event from the list."
        dismissLabel="Done"
        onDismiss={handleDismissDeleteResult}
        tone="default"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FF69B4'
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: colors.background // Your original background color
  },
  heroContainer: {
    height: 320,
    backgroundColor: '#FF69B4', // Your pink/gradient color
    paddingHorizontal: 20,
    paddingTop: 10,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  
  // Image card container
  imageCardContainer: {
    width: '60%', // 50% of heroContainer width
    aspectRatio: 1, // Square card
  },
  
  // The elevated image card
  imageCard: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15, // For Android
  },

  // heroImage: {
  //   position: 'absolute',
  //   top: 0,
  //   left: 0,
  //   right: 0,
  //   bottom: 0,
  //   width: undefined,
  //   height: undefined,
  //   resizeMode: 'cover'
  // },
  scrollContent: {
    paddingHorizontal:spacing.lg,
    paddingBottom: spacing.xl
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm
  },
  title: {
    fontSize: 29,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.titleLineHeight,
    letterSpacing: typography.letterSpacing
  },
  hostedBy: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
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
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: '#525252',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  detailDiv: {
    flexDirection: 'column',
    gap: 1, // 1px vertical space between child views
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    marginRight: spacing.sm
  },
  detailText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.eventDetailRowText,
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
  ctaContainerActive: {
    backgroundColor: '#F5F5F5'
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center'
  },
  ctaButtonDisabled: {
    backgroundColor: colors.eventDetailButtonBackground
  },
  ctaButtonPressed: {
    opacity: 0.7
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  ctaLabelDisabled: {
    color: colors.eventDetailButtonText
  },
  ownerButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)'
  },
  ownerLabel: {
    color: colors.text
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
