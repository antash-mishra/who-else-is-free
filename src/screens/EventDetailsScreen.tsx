import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@api/config';
import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import CloseIcon from '@assets/ui/close.svg';
import MoreHorizontalIcon from '@assets/ui/more-horizontal.svg';
import { AppButton } from '@components/ui';
import { EVENT_DETAILS_INFO_SEPARATOR } from '@constants/display';
import { useAuth } from '@context/AuthContext';
import { ApiEvent, mapApiEventToUserEvent, useEvents, UserEvent } from '@context/EventsContext';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, componentTokens, spacing } from '@theme/index';
import { formatEventDetailDateLabel } from '@utils/dateTime';
import { formatEventDetailAudienceLine } from '@utils/eventDisplay';

import EventDetailsCTA from './event-details/EventDetailsCTA';
import EventDetailsHero from './event-details/EventDetailsHero';
import EventDetailsInfo from './event-details/EventDetailsInfo';
import EventDetailsMembers from './event-details/EventDetailsMembers';
import EventDetailsOverlayRoutes from './event-details/EventDetailsOverlayRoutes';
import styles from './event-details/EventDetailsScreen.styles';
import HostRequestTabs from './event-details/HostRequestTabs';
import { useEventDetailsActions } from './event-details/useEventDetailsActions';
import {
  EventDetailsNavigation,
  EventDetailsRoute,
  useEventDetailsData,
} from './event-details/useEventDetailsData';
import { useHostRequestActions } from './event-details/useHostRequestActions';

// Frosted-glass backing for the floating hero buttons. Android only blurs
// with the experimental method, and its dark tint comes out lighter than the
// iOS material, so a translucent dark layer sits on top of the blur there.
const HeroButtonBlur = () => (
  <>
    <BlurView
      intensity={24}
      tint="dark"
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      style={StyleSheet.absoluteFill}
    />
    {Platform.OS === 'android' ? (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: componentTokens.overlay.heroButtonTint },
        ]}
      />
    ) : null}
  </>
);

const EventDetailsScreenContent = ({
  initialEventSnapshot,
  onOverlayClose,
}: {
  initialEventSnapshot: UserEvent;
  onOverlayClose?: () => void;
}) => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const readOnly = (route.params as { readOnly?: boolean }).readOnly ?? false;
  const isOverlay = route.name === 'EventDetailsOverlay';
  const handleOverlayClose = onOverlayClose ?? navigation.goBack;
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  // Drives the hero parallax. bounces stays disabled on the ScrollView below,
  // so this is scroll-away parallax only.
  const scrollY = useSharedValue(0);
  const handleScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const { height: screenHeight } = useWindowDimensions();
  const { user } = useAuth();
  const origin = (route.params as { origin?: string }).origin ?? 'Events';
  const showEventUpdatedBadgeParam = (route.params as { showEventUpdatedBadge?: boolean })
    .showEventUpdatedBadge;

  const {
    event,
    isOwner,
    isSingleEvent,
    eventAnalyticsParams,
    eventNumericId,
    eventConversation,
    requestStoreKey,
    hostRequestStoreKey,
    isConversationMember,
    goingParticipants,
    goingCount,
    pendingRequests,
    acceptedRequests,
    overlayMembers,
    hasPendingRequest,
    setHasPendingRequest,
    userIntroMessage,
    setUserIntroMessage,
    setDisableHostRequestPolling,
    readOnlyMembers,
    isFetchingReadOnlyMembers,
    readOnlyMembersError,
  } = useEventDetailsData({
    initialEventSnapshot,
    routeEventId: route.params.eventId,
    readOnly,
    isOverlay,
    isFocused,
  });

  const {
    setShowInvitePrompt,
    shouldShowInvitePrompt,
    signInVisible,
    setSignInVisible,
    inviteMessage,
    setInviteMessage,
    inviteError,
    setInviteError,
    isSendingInvite,
    showRequestSentBadge,
    setShowRequestSentBadge,
    showRequestCancelledBadge,
    setShowRequestCancelledBadge,
    showDeleteConfirm,
    deleteError,
    isDeleting,
    showReportPrompt,
    setShowReportPrompt,
    reportMessage,
    setReportMessage,
    reportError,
    setReportError,
    isSubmittingReport,
    showMenuOverlay,
    setShowMenuOverlay,
    showViewIntroOverlay,
    setShowViewIntroOverlay,
    showLeaveConfirm,
    isLeaving,
    leaveError,
    showEventUpdatedBadge,
    setShowEventUpdatedBadge,
    menuItems,
    handleCtaPress,
    handleOpenChat,
    handleSendInvite,
    handleDelete,
    handleDeleteCancel,
    handleSubmitReport,
    handleLeaveEvent,
    handleLeaveCancel,
  } = useEventDetailsActions({
    navigation,
    origin,
    showEventUpdatedBadgeParam,
    event,
    eventAnalyticsParams,
    eventNumericId,
    requestStoreKey,
    eventConversation,
    isOwner,
    isSingleEvent,
    isConversationMember,
    hasPendingRequest,
    setHasPendingRequest,
    setUserIntroMessage,
    setDisableHostRequestPolling,
  });

  const {
    expandedRequestIds,
    acceptingUserId,
    decliningUserId,
    reportTarget,
    setReportTarget,
    isReportingMember,
    showReportMemberConfirm,
    selectedMember,
    showMemberMenu,
    setShowMemberMenu,
    isRemovingMember,
    showRemoveConfirm,
    removeError,
    removedMemberBadgeLabel,
    setRemovedMemberBadgeLabel,
    reportedMemberBadgeLabel,
    setReportedMemberBadgeLabel,
    handleAcceptRequest,
    handleDeclineRequest,
    toggleRequestExpanded,
    handleRequesterPress,
    openMemberMenu,
    handleRemoveMember,
    handleReportMemberFromMenu,
    handleReportMemberConfirm,
    handleReportMemberCancel,
    handleRemovePromptFromMenu,
    handleRemoveCancel,
    handleSubmitMemberReport,
  } = useHostRequestActions({
    navigation,
    event,
    eventNumericId,
    hostRequestStoreKey,
    isSingleEvent,
    eventAnalyticsParams,
    reportMessage,
    setReportMessage,
    setReportError,
    setShowReportPrompt,
  });

  if (!event) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.fallbackContainer}>
          {isOverlay ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => {
                triggerHaptic('light');
                handleOverlayClose();
              }}
              style={styles.fallbackCloseButton}
            >
              <CloseIcon width={24} height={24} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={navigation.goBack}
              style={styles.fallbackBackButton}
            >
              <ChevronLeftIcon width={24} height={24} color={colors.text} />
            </Pressable>
          )}
          <Text style={styles.fallbackText}>We couldn't find that plan.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
  const scheduleDateLabel = event.eventDate
    ? formatEventDetailDateLabel(event.eventDate)
    : event.dateLabel;
  const scheduleLine = `${scheduleDateLabel}${EVENT_DETAILS_INFO_SEPARATOR}${event.time}`;
  const audienceLine = formatEventDetailAudienceLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  });

  const ctaLabel = hasPendingRequest ? 'Request pending' : 'Request to join';

  // Show standard CTA only for non-owners who haven't joined
  const showStandardCTA = !isOwner && !isConversationMember;
  // Show "Go to Chat" for:
  // - 1:1 hosts (opens accepted users list even before private chats exist)
  // - hosts/members with an existing conversation
  const showOpenChatCTA = isOwner
    ? isSingleEvent || !!eventConversation
    : isConversationMember && !!eventConversation;
  const shouldPinBottomCTA = !readOnly && (showStandardCTA || showOpenChatCTA);
  const heroTopInset = isOverlay ? 0 : insets.top;
  const floatingButtonTop = isOverlay ? 12 : insets.top + 10;
  const overlayBottomPadding = isOverlay ? Math.max(insets.bottom + spacing.lg, spacing.xl) : 0;
  const pageScrollContentStyle = [
    styles.pageScrollContent,
    shouldPinBottomCTA
      ? { paddingBottom: 70 + insets.bottom }
      : { paddingBottom: overlayBottomPadding },
  ];

  const screenContent = (
    <>
      <StatusBar
        barStyle="light-content" // For white icons/text
        translucent
        backgroundColor="transparent"
      />

      <View style={styles.contentWrapper}>
        {isOverlay ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => {
              triggerHaptic('light');
              handleOverlayClose();
            }}
            style={[
              styles.overlayCloseButton,
              styles.overlayCloseButtonFixed,
              { top: floatingButtonTop },
            ]}
            hitSlop={12}
          >
            <HeroButtonBlur />
            <CloseIcon width={24} height={24} color={colors.buttonText} />
          </Pressable>
        ) : !readOnly ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => {
                triggerHaptic('light');
                navigation.goBack();
              }}
              style={[styles.backButton, { top: floatingButtonTop }]}
            >
              <HeroButtonBlur />
              <ChevronLeftIcon width={24} height={24} color={colors.buttonText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More actions"
              onPress={() => {
                triggerHaptic('light');
                setShowMenuOverlay(true);
              }}
              style={[styles.menuButton, { top: floatingButtonTop }]}
            >
              <HeroButtonBlur />
              <MoreHorizontalIcon width={24} height={24} color={colors.buttonText} />
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              triggerHaptic('light');
              navigation.goBack();
            }}
            hitSlop={12}
            style={[styles.backButton, { top: floatingButtonTop }]}
          >
            <HeroButtonBlur />
            <ChevronLeftIcon width={24} height={24} color={colors.buttonText} />
          </Pressable>
        )}
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          contentContainerStyle={pageScrollContentStyle}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          <EventDetailsHero
            imageUri={event.imageUri}
            eventId={String(event.id)}
            sharedCover={'sharedCover' in route.params && route.params.sharedCover}
            topInset={heroTopInset}
            scrollY={scrollY}
          />
          <View style={styles.card}>
            <EventDetailsInfo
              title={event.title}
              hostLine={hostLine}
              readOnly={readOnly}
              isSingleEvent={isSingleEvent}
              goingParticipants={goingParticipants}
              goingCount={goingCount}
              location={event.location}
              scheduleLine={scheduleLine}
              audienceLine={audienceLine}
              description={event.description}
            />

            {/* Host-only: Separator, Tabs, Requests/Members lists */}
            {isOwner && !readOnly && !(isOverlay && !isSingleEvent) && (
              <HostRequestTabs
                isSingleEvent={isSingleEvent}
                pendingRequests={pendingRequests}
                acceptedRequests={acceptedRequests}
                confirmedMembers={overlayMembers}
                hostId={event.ownerId}
                expandedRequestIds={expandedRequestIds}
                acceptingUserId={acceptingUserId}
                decliningUserId={decliningUserId}
                onToggleRequestExpanded={toggleRequestExpanded}
                onAcceptRequest={handleAcceptRequest}
                onDeclineRequest={handleDeclineRequest}
                onRequesterPress={handleRequesterPress}
                onOpenMemberMenu={openMemberMenu}
              />
            )}

            {/* Overlay: Members tab for group events (all users) */}
            {!isSingleEvent && isOverlay && (isOwner || isConversationMember) && (
              <EventDetailsMembers
                variant="overlay"
                members={overlayMembers}
                currentUserId={user?.id}
                isOwner={isOwner}
                onOpenMemberMenu={openMemberMenu}
              />
            )}

            {/* Overlay: Accepted tab for 1:1 hosts (approved requesters only; no host row) */}
            {isSingleEvent && isOverlay && isOwner && (
              <EventDetailsMembers
                variant="accepted"
                members={acceptedRequests.map((request) => request.requester)}
                onOpenMemberMenu={openMemberMenu}
              />
            )}

            {readOnly && !isOverlay && (
              <EventDetailsMembers
                variant="readOnly"
                members={readOnlyMembers}
                hostId={event.ownerId}
                isLoading={isFetchingReadOnlyMembers}
                error={readOnlyMembersError}
              />
            )}
          </View>
        </Animated.ScrollView>
        <EventDetailsCTA
          showStandardCta={shouldPinBottomCTA && showStandardCTA && !readOnly}
          showOpenChatCta={shouldPinBottomCTA && showOpenChatCTA && !readOnly}
          shouldShowInvitePrompt={shouldShowInvitePrompt}
          hasPendingRequest={hasPendingRequest}
          stampKey={hasPendingRequest ? 'requested' : 'idle'}
          ctaLabel={ctaLabel}
          isOwner={isOwner}
          bottomInset={insets.bottom}
          onCtaPress={handleCtaPress}
          onOpenChat={handleOpenChat}
        />
      </View>

      <EventDetailsOverlayRoutes
        shouldShowInvitePrompt={shouldShowInvitePrompt}
        inviteMessage={inviteMessage}
        onInviteMessageChange={(text) => {
          setInviteMessage(text);
          if (inviteError) {
            setInviteError(null);
          }
        }}
        onSendInvite={handleSendInvite}
        inviteError={inviteError}
        isSendingInvite={isSendingInvite}
        onCloseInvitePrompt={() => setShowInvitePrompt(false)}
        showDeleteConfirm={showDeleteConfirm}
        onDelete={handleDelete}
        onDeleteCancel={handleDeleteCancel}
        deleteError={deleteError}
        isDeleting={isDeleting}
        showReportPrompt={showReportPrompt}
        onCloseReportPrompt={() => {
          setShowReportPrompt(false);
          setReportTarget(null);
        }}
        reportTargetName={reportTarget?.name}
        reportMessage={reportMessage}
        onReportMessageChange={(text) => {
          setReportMessage(text);
          if (reportError) {
            setReportError(null);
          }
        }}
        onSubmitReport={reportTarget ? handleSubmitMemberReport : handleSubmitReport}
        reportError={reportError}
        isSubmittingReport={isSubmittingReport || isReportingMember}
        showMenuOverlay={showMenuOverlay}
        onCloseMenuOverlay={() => setShowMenuOverlay(false)}
        menuItems={menuItems}
        showViewIntroOverlay={showViewIntroOverlay}
        onCloseViewIntroOverlay={() => setShowViewIntroOverlay(false)}
        userIntroMessage={userIntroMessage}
        showLeaveConfirm={showLeaveConfirm}
        onLeaveEvent={handleLeaveEvent}
        onLeaveCancel={handleLeaveCancel}
        isLeaving={isLeaving}
        leaveError={leaveError}
        showMemberMenu={showMemberMenu}
        onCloseMemberMenu={() => setShowMemberMenu(false)}
        selectedMemberName={selectedMember?.name}
        onReportMemberFromMenu={handleReportMemberFromMenu}
        onRemovePromptFromMenu={handleRemovePromptFromMenu}
        showReportMemberConfirm={showReportMemberConfirm}
        onReportMemberConfirm={handleReportMemberConfirm}
        onReportMemberCancel={handleReportMemberCancel}
        showRemoveConfirm={showRemoveConfirm}
        onRemoveMember={handleRemoveMember}
        onRemoveCancel={handleRemoveCancel}
        isRemovingMember={isRemovingMember}
        removeError={removeError}
        isSingleEvent={isSingleEvent}
        showEventUpdatedBadge={showEventUpdatedBadge}
        onEventUpdatedBadgeHidden={() => {
          setShowEventUpdatedBadge(false);
          navigation.setParams({ showEventUpdatedBadge: false });
        }}
        showRequestSentBadge={showRequestSentBadge}
        onRequestSentBadgeHidden={() => {
          setShowRequestSentBadge(false);
        }}
        showRequestCancelledBadge={showRequestCancelledBadge}
        onRequestCancelledBadgeHidden={() => {
          setShowRequestCancelledBadge(false);
        }}
        removedMemberBadgeLabel={removedMemberBadgeLabel}
        onRemovedMemberBadgeHidden={() => {
          setRemovedMemberBadgeLabel(null);
        }}
        reportedMemberBadgeLabel={reportedMemberBadgeLabel}
        onReportedMemberBadgeHidden={() => {
          setReportedMemberBadgeLabel(null);
        }}
        signInVisible={signInVisible}
        onCloseSignIn={() => setSignInVisible(false)}
      />
    </>
  );

  if (readOnly) {
    return (
      <SafeAreaView style={styles.safeArea} edges={[]}>
        {screenContent}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      {screenContent}
    </SafeAreaView>
  );
};

type EventDetailsScreenProps = {
  onOverlayClose?: () => void;
};

type EventDetailsLoadStatus = 'loading' | 'ready' | 'notFound' | 'error';

const EventDetailsScreen = ({ onOverlayClose }: EventDetailsScreenProps = {}) => {
  const navigation = useNavigation<EventDetailsNavigation>();
  const route = useRoute<EventDetailsRoute>();
  const { events } = useEvents();
  const { token, authFetch } = useAuth();
  const isOverlay = route.name === 'EventDetailsOverlay';
  const handleOverlayClose = onOverlayClose ?? navigation.goBack;
  const routeEventId = route.params.eventId;
  const rawEvent = useMemo(
    () => events.find((item) => item.id === routeEventId),
    [events, routeEventId],
  );
  const [fetchedEvent, setFetchedEvent] = useState<UserEvent | null>(null);
  const [loadStatus, setLoadStatus] = useState<EventDetailsLoadStatus>(() =>
    rawEvent ? 'ready' : token ? 'loading' : 'notFound',
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setFetchedEvent((prev) => (prev?.id === routeEventId ? prev : null));
  }, [routeEventId]);

  useEffect(() => {
    if (rawEvent) {
      setLoadStatus('ready');
      return;
    }
    if (!authFetch || !token) {
      setLoadStatus('notFound');
      return;
    }

    let isCancelled = false;
    setLoadStatus('loading');

    const fetchEvent = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/events/${routeEventId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.status === 404) {
          // The event was deleted; the "couldn't find that plan" fallback
          // handles this, so don't treat it as an error.
          if (!isCancelled) {
            setFetchedEvent(null);
            setLoadStatus('notFound');
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload: { data?: ApiEvent | null } = await response.json();
        if (!isCancelled && payload.data) {
          setFetchedEvent(mapApiEventToUserEvent(payload.data));
          setLoadStatus('ready');
        } else if (!isCancelled) {
          setFetchedEvent(null);
          setLoadStatus('error');
        }
      } catch (err) {
        if (!isCancelled) {
          logger.error('Failed to fetch event details', err);
          setFetchedEvent(null);
          setLoadStatus('error');
        }
      }
    };

    fetchEvent();
    return () => {
      isCancelled = true;
    };
  }, [authFetch, rawEvent, retryKey, routeEventId, token]);

  const eventSnapshot = rawEvent ?? (fetchedEvent?.id === routeEventId ? fetchedEvent : null);

  if (!eventSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.fallbackContainer}>
          {loadStatus === 'loading' ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              {isOverlay ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => {
                    triggerHaptic('light');
                    handleOverlayClose();
                  }}
                  style={styles.fallbackCloseButton}
                >
                  <CloseIcon width={24} height={24} color={colors.text} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={navigation.goBack}
                  style={styles.fallbackBackButton}
                >
                  <ChevronLeftIcon width={24} height={24} color={colors.text} />
                </Pressable>
              )}
              <Text style={styles.fallbackText}>
                {loadStatus === 'error'
                  ? 'Unable to load plan. Please try again.'
                  : "We couldn't find that plan."}
              </Text>
              {loadStatus === 'error' ? (
                <AppButton
                  label="Try again"
                  variant="secondary"
                  onPress={() => setRetryKey((value) => value + 1)}
                />
              ) : null}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <EventDetailsScreenContent
      key={routeEventId}
      initialEventSnapshot={eventSnapshot}
      onOverlayClose={onOverlayClose}
    />
  );
};

export default EventDetailsScreen;
