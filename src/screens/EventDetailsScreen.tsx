import { useEffect, useMemo, useState } from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@api/config';
import ChevronLeftIcon from '@assets/ui/chevron-left.svg';
import CloseIcon from '@assets/ui/close.svg';
import MoreHorizontalIcon from '@assets/ui/more-horizontal.svg';
import { useAuth } from '@context/AuthContext';
import { ApiEvent, mapApiEventToUserEvent, useEvents, UserEvent } from '@context/EventsContext';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';
import { colors, spacing } from '@theme/index';
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
    confirmedMembers,
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
    showManagePrompt,
    setShowManagePrompt,
    showDeleteConfirm,
    deleteError,
    isDeleting,
    showPendingRequestPrompt,
    setShowPendingRequestPrompt,
    isCancellingRequest,
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
    handleEdit,
    handleDeletePrompt,
    handleDelete,
    handleDeleteCancel,
    handleCancelRequest,
    handleOpenReportPrompt,
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
    selectedRequest,
    setSelectedRequest,
    isReportingMember,
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
    pendingRequests,
    acceptedRequests,
    confirmedMembers,
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
              accessibilityLabel="Close event details"
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
          <Text style={styles.fallbackText}>We couldn't find that event.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hostLine = isOwner ? 'Hosted by you' : `Hosted by ${event.hostName}`;
  const scheduleDateLabel = event.eventDate
    ? formatEventDetailDateLabel(event.eventDate)
    : event.dateLabel;
  const scheduleLine = `${scheduleDateLabel}, ${event.time}`;
  const audienceLine = formatEventDetailAudienceLine({
    groupType: event.groupType,
    gender: event.gender,
    minAge: event.minAge,
    maxAge: event.maxAge,
  });

  const ctaLabel = hasPendingRequest ? 'Pending Request' : 'Interested';

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
            accessibilityLabel="Close event details"
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
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
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
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
              <ChevronLeftIcon width={24} height={24} color={colors.buttonText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More event actions"
              onPress={() => {
                triggerHaptic('light');
                setShowMenuOverlay(true);
              }}
              style={[styles.menuButton, { top: floatingButtonTop }]}
            >
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
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
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
            <ChevronLeftIcon width={24} height={24} color={colors.buttonText} />
          </Pressable>
        )}
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          alwaysBounceVertical={false}
          contentContainerStyle={pageScrollContentStyle}
        >
          <EventDetailsHero imageUri={event.imageUri} topInset={heroTopInset} />
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
                confirmedMembers={confirmedMembers}
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

            {userIntroMessage && !readOnly && isConversationMember ? (
              <>
                {/* Card has no gap: set section break (20) + heading→text (12) explicitly. */}
                <View style={[styles.divider, { marginTop: 20, marginBottom: 20 }]} />
                <Text style={styles.sectionHeading}>Introduction</Text>
                <Text style={[styles.introMessageText, { marginTop: 12 }]}>
                  "{userIntroMessage}"
                </Text>
              </>
            ) : null}
          </View>
        </ScrollView>
        <EventDetailsCTA
          showStandardCta={shouldPinBottomCTA && showStandardCTA && !readOnly}
          showOpenChatCta={shouldPinBottomCTA && showOpenChatCTA && !readOnly}
          shouldShowInvitePrompt={shouldShowInvitePrompt}
          hasPendingRequest={hasPendingRequest}
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
        showManagePrompt={showManagePrompt}
        onCloseManagePrompt={() => setShowManagePrompt(false)}
        onEdit={handleEdit}
        onDeletePrompt={handleDeletePrompt}
        showDeleteConfirm={showDeleteConfirm}
        onDelete={handleDelete}
        onDeleteCancel={handleDeleteCancel}
        deleteError={deleteError}
        isDeleting={isDeleting}
        showPendingRequestPrompt={showPendingRequestPrompt}
        onClosePendingRequestPrompt={() => setShowPendingRequestPrompt(false)}
        onCancelRequest={handleCancelRequest}
        onOpenReportPrompt={handleOpenReportPrompt}
        isCancellingRequest={isCancellingRequest}
        showReportPrompt={showReportPrompt}
        onCloseReportPrompt={() => {
          setShowReportPrompt(false);
          setSelectedRequest(null);
        }}
        reportMessage={reportMessage}
        onReportMessageChange={(text) => {
          setReportMessage(text);
          if (reportError) {
            setReportError(null);
          }
        }}
        onSubmitReport={selectedRequest ? handleSubmitMemberReport : handleSubmitReport}
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
  const [isFetchingEvent, setIsFetchingEvent] = useState(() => !rawEvent && !!token && !!authFetch);

  useEffect(() => {
    setFetchedEvent((prev) => (prev?.id === routeEventId ? prev : null));
  }, [routeEventId]);

  useEffect(() => {
    if (rawEvent) {
      setIsFetchingEvent(false);
      return;
    }
    if (!authFetch || !token) {
      setIsFetchingEvent(false);
      return;
    }

    let isCancelled = false;
    setIsFetchingEvent(true);

    const fetchEvent = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/events/${routeEventId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.status === 404) {
          // The event was deleted; the "couldn't find that event" fallback
          // handles this, so don't treat it as an error.
          if (!isCancelled) {
            setFetchedEvent(null);
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const payload: { data?: ApiEvent | null } = await response.json();
        if (!isCancelled && payload.data) {
          setFetchedEvent(mapApiEventToUserEvent(payload.data));
        }
      } catch (err) {
        if (!isCancelled) {
          logger.error('Failed to fetch event details', err);
          setFetchedEvent(null);
        }
      } finally {
        if (!isCancelled) {
          setIsFetchingEvent(false);
        }
      }
    };

    fetchEvent();
    return () => {
      isCancelled = true;
    };
  }, [authFetch, rawEvent, routeEventId, token]);

  const eventSnapshot = rawEvent ?? (fetchedEvent?.id === routeEventId ? fetchedEvent : null);

  if (!eventSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.fallbackContainer}>
          {isFetchingEvent ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <>
              {isOverlay ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close event details"
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
              <Text style={styles.fallbackText}>We couldn't find that event.</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <EventDetailsScreenContent
      initialEventSnapshot={eventSnapshot}
      onOverlayClose={onOverlayClose}
    />
  );
};

export default EventDetailsScreen;
