import { useCallback, useEffect, useMemo, useState } from 'react';

import { StackActions } from '@react-navigation/native';

import { API_BASE_URL } from '@api/config';
import { useAuth } from '@context/AuthContext';
import { ChatConversation, useChat } from '@context/ChatContext';
import { useEvents, UserEvent } from '@context/EventsContext';
import { AnalyticsParams, trackEvent } from '@services/analytics';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';

import {
  getJoinRequestError,
  getPlanReportError,
  JOIN_REQUEST_GENERIC_ERROR,
  PLAN_REPORT_GENERIC_ERROR,
} from './eventDetailsErrors';
import { EventDetailsNavigation } from './useEventDetailsData';

type UseEventDetailsActionsArgs = {
  navigation: EventDetailsNavigation;
  origin: string;
  showEventUpdatedBadgeParam?: boolean;
  event: UserEvent | null;
  eventAnalyticsParams: AnalyticsParams;
  eventNumericId: number | null;
  requestStoreKey: number | null;
  eventConversation: ChatConversation | null | undefined;
  isOwner: boolean;
  isSingleEvent: boolean;
  isConversationMember: boolean;
  hasPendingRequest: boolean;
  setHasPendingRequest: (value: boolean) => void;
  setUserIntroMessage: (value: string | null) => void;
  setDisableHostRequestPolling: (value: boolean) => void;
};

/**
 * Guest/owner actions for Event Details: join request send/cancel (with
 * sign-in redirect and auto-send after sign-in), edit, delete, report, leave,
 * CTA press, open chat, and the three-dot menu items. Owns the overlay/prompt
 * visibility state those flows drive.
 */
export const useEventDetailsActions = ({
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
}: UseEventDetailsActionsArgs) => {
  const { deleteUserEvent, markEventRequested, unmarkEventRequested, markEventReported } =
    useEvents();
  const { user, token, authFetch } = useAuth();
  const { setActiveConversation, refreshConversations } = useChat();

  const [showInvitePrompt, setShowInvitePrompt] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);
  const [pendingSendAfterSignIn, setPendingSendAfterSignIn] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [showRequestSentBadge, setShowRequestSentBadge] = useState(false);
  const [showRequestCancelledBadge, setShowRequestCancelledBadge] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showMenuOverlay, setShowMenuOverlay] = useState(false);
  const [showViewIntroOverlay, setShowViewIntroOverlay] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [showEventUpdatedBadge, setShowEventUpdatedBadge] = useState(false);

  useEffect(() => {
    if (user && signInVisible) {
      setSignInVisible(false);
    }
  }, [user, signInVisible]);

  useEffect(() => {
    if (!showEventUpdatedBadgeParam) {
      return;
    }
    // Delay so the badge appears after the pop-to-EventDetails transition
    // settles. A prior `transitionEnd` listener missed the event because it
    // attached after `popTo` had already fired it, so no toast showed.
    const timer = setTimeout(() => setShowEventUpdatedBadge(true), 350);
    return () => clearTimeout(timer);
  }, [showEventUpdatedBadgeParam]);

  const shouldShowInvitePrompt = showInvitePrompt && !isOwner;

  const handleCtaPress = () => {
    // Pending state: CTA is disabled, actions handled via three-dot menu
    if (hasPendingRequest) {
      return;
    }
    if (isConversationMember) {
      return;
    }
    triggerHaptic('light');
    if (!showInvitePrompt) {
      trackEvent('join_request_started', {
        ...eventAnalyticsParams,
        source: 'event_details_cta',
      }).catch(() => undefined);
    }
    setShowInvitePrompt((prev) => !prev);
  };

  const handleOpenChat = () => {
    triggerHaptic('light');
    if (event && isOwner && isSingleEvent && eventNumericId != null && requestStoreKey != null) {
      navigation.navigate('JoinRequests', {
        conversationId: requestStoreKey,
        eventId: eventNumericId,
        title: event.title,
        groupType: 'Single',
      });
      return;
    }

    if (!eventConversation) {
      return;
    }
    setActiveConversation(eventConversation.id);
    navigation.push('ChatThread');
  };

  const handleSendInvite = useCallback(async () => {
    if (!event) {
      return;
    }
    if (!user || !token) {
      trackEvent('guest_join_requires_auth', {
        ...eventAnalyticsParams,
        source: 'event_details_invite',
      }).catch(() => undefined);
      setPendingSendAfterSignIn(true);
      setSignInVisible(true);
      return;
    }
    if (isSendingInvite) {
      return;
    }
    const trimmed = inviteMessage.trim();
    if (!trimmed.length) {
      setInviteError('Add a short intro for the host.');
      return;
    }
    triggerHaptic('submit');
    setInviteError(null);
    setIsSendingInvite(true);
    trackEvent('join_request_submitted', eventAnalyticsParams).catch(() => undefined);
    let failureTracked = false;
    try {
      const response = await authFetch(`${API_BASE_URL}/api/events/${event.id}/chat/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed }),
      });
      if (response.status === 409) {
        setHasPendingRequest(true);
        markEventRequested(event.id);
        setInviteError(getJoinRequestError(response.status));
        trackEvent('join_request_failed', {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: 'duplicate_request',
        }).catch(() => undefined);
        return;
      }
      if (response.status === 401) {
        trackEvent('join_request_failed', {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: 'unauthorized',
        }).catch(() => undefined);
        setSignInVisible(true);
        return;
      }
      if (!response.ok) {
        logger.warn(`Join request failed: status=${response.status}`);
        if (response.status === 403) {
          failureTracked = true;
          trackEvent('join_request_failed', {
            ...eventAnalyticsParams,
            status_code: response.status,
            reason_category: 'forbidden',
          }).catch(() => undefined);
          setInviteError(getJoinRequestError(response.status));
          return;
        }
        if (response.status === 404) {
          failureTracked = true;
          trackEvent('join_request_failed', {
            ...eventAnalyticsParams,
            status_code: response.status,
            reason_category: 'not_found',
          }).catch(() => undefined);
          setInviteError(getJoinRequestError(response.status));
          return;
        }
        failureTracked = true;
        trackEvent('join_request_failed', {
          ...eventAnalyticsParams,
          status_code: response.status,
          reason_category: 'api_error',
        }).catch(() => undefined);
        setInviteError(getJoinRequestError(response.status));
        return;
      }
      setInviteMessage('');
      setShowInvitePrompt(false);
      setHasPendingRequest(true);
      markEventRequested(event.id);
      setShowRequestSentBadge(true);
      trackEvent('join_request_succeeded', eventAnalyticsParams).catch(() => undefined);
    } catch (err) {
      if (!failureTracked) {
        trackEvent('join_request_failed', {
          ...eventAnalyticsParams,
          reason_category: 'network_error',
        }).catch(() => undefined);
      }
      logger.error('Failed to send invite', err);
      setInviteError(JOIN_REQUEST_GENERIC_ERROR);
    } finally {
      setIsSendingInvite(false);
    }
  }, [
    authFetch,
    event,
    eventAnalyticsParams,
    inviteMessage,
    isSendingInvite,
    markEventRequested,
    setHasPendingRequest,
    token,
    user,
  ]);

  // Auto-send invite after sign-in completes.
  // handleSendInvite is intentionally omitted from the dependency list to keep
  // the original firing semantics: its identity changes every render (it
  // closes over per-render analytics params), and the effect must only re-run
  // when the sign-in state itself changes.
  useEffect(() => {
    if (user && token && pendingSendAfterSignIn) {
      setPendingSendAfterSignIn(false);
      handleSendInvite();
    }
  }, [user, token, pendingSendAfterSignIn]);

  const handleEdit = () => {
    if (!event) {
      return;
    }
    navigation.dispatch(StackActions.push('CreateEvent', { editEventId: event.id }));
  };

  const handleDeletePrompt = () => {
    setDeleteError(null);
    triggerHaptic('destructive');
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!event) {
      return;
    }
    if (isDeleting) {
      return;
    }
    triggerHaptic('destructive');
    setDeleteError(null);
    setIsDeleting(true);
    setDisableHostRequestPolling(true);
    try {
      await deleteUserEvent(event.id);
      setShowDeleteConfirm(false);
      const targetTab = origin === 'MyEvents' ? 'MyEvents' : 'Events';
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: {
              screen: targetTab,
              params: { showEventDeletedBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      logger.error('Failed to delete event', err);
      setDeleteError("Couldn't delete this plan. Please try again.");
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

  const handleCancelRequest = async () => {
    if (!event || !token) {
      return;
    }
    if (isCancellingRequest) {
      return;
    }
    triggerHaptic('submit');
    setIsCancellingRequest(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/api/events/${event.id}/chat/requests/me`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Unable to cancel request right now.');
      }
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      setShowRequestCancelledBadge(true);
      trackEvent('join_request_cancelled', eventAnalyticsParams).catch(() => undefined);
    } catch (err) {
      logger.error('Failed to cancel request', err);
    } finally {
      setIsCancellingRequest(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!event || !token) {
      return;
    }
    if (isSubmittingReport) {
      return;
    }
    const trimmed = reportMessage.trim();
    if (!trimmed.length) {
      setReportError("Please tell us why you're reporting this plan.");
      return;
    }
    triggerHaptic('submit');
    setReportError(null);
    setIsSubmittingReport(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/api/events/${event.id}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (response.status === 409) {
        setReportError(getPlanReportError(response.status));
        return;
      }
      if (!response.ok) {
        setReportError(getPlanReportError(response.status));
        return;
      }
      setReportMessage('');
      setShowReportPrompt(false);
      markEventReported(event.id);
      trackEvent('event_reported', eventAnalyticsParams).catch(() => undefined);
      // Clear local state for pending request since backend also cancels it
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      await refreshConversations().catch((err) => {
        logger.error('Failed to refresh conversations after report', err);
      });
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: {
              screen: 'Events',
              params: { showEventReportedBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      logger.error('Failed to submit report', err);
      setReportError(PLAN_REPORT_GENERIC_ERROR);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const replaceMenuOverlay = (fn: () => void) => {
    setShowMenuOverlay(false);
    fn();
  };

  const handleLeavePrompt = () =>
    replaceMenuOverlay(() => {
      triggerHaptic('destructive');
      setLeaveError(null);
      setShowLeaveConfirm(true);
    });

  const handleLeaveEvent = async () => {
    if (!event || !user || !token) {
      return;
    }
    if (isLeaving) {
      return;
    }
    triggerHaptic('destructive');
    setLeaveError(null);
    setIsLeaving(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/members/${user.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error('leave failed');
      }
      setHasPendingRequest(false);
      unmarkEventRequested(event.id);
      setUserIntroMessage(null);
      await refreshConversations().catch((err) => {
        logger.error('Failed to refresh conversations after leaving event', err);
      });
      setShowLeaveConfirm(false);
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            params: {
              screen: 'Events',
              params: { showEventLeftBadge: true },
            },
          },
        ],
      });
    } catch (err) {
      logger.error('Failed to leave event', err);
      setLeaveError("Couldn't leave this plan. Please try again.");
    } finally {
      setIsLeaving(false);
    }
  };

  const handleLeaveCancel = () => {
    if (isLeaving) {
      return;
    }
    setShowLeaveConfirm(false);
  };

  const handleMenuReportEvent = () =>
    replaceMenuOverlay(() => {
      triggerHaptic('destructive');
      setReportMessage('');
      setReportError(null);
      setShowReportPrompt(true);
    });

  const handleMenuCancelRequest = () => {
    setShowMenuOverlay(false);
    handleCancelRequest();
  };

  const handleMenuViewIntro = () => replaceMenuOverlay(() => setShowViewIntroOverlay(true));

  const handleMenuEdit = () => replaceMenuOverlay(handleEdit);

  const handleMenuDelete = () => replaceMenuOverlay(handleDeletePrompt);

  const menuItems = useMemo(() => {
    if (isOwner) {
      // Host: Edit plan, Delete plan
      return [
        { label: 'Edit plan', onPress: handleMenuEdit },
        { label: 'Delete plan', onPress: handleMenuDelete, destructive: true },
      ];
    }
    if (isConversationMember) {
      // Joined: View intro message, Leave plan, Report plan
      return [
        { label: 'View intro message', onPress: handleMenuViewIntro },
        { label: 'Leave plan', onPress: handleLeavePrompt, destructive: true },
        {
          label: 'Report plan',
          onPress: handleMenuReportEvent,
          destructive: true,
        },
      ];
    }
    if (hasPendingRequest) {
      // Pending: View intro message, Cancel request, Report plan
      return [
        { label: 'View intro message', onPress: handleMenuViewIntro },
        {
          label: 'Cancel request',
          onPress: handleMenuCancelRequest,
          loading: isCancellingRequest,
        },
        {
          label: 'Report plan',
          onPress: handleMenuReportEvent,
          destructive: true,
        },
      ];
    }
    // Not joined: Report plan
    return [
      {
        label: 'Report plan',
        onPress: handleMenuReportEvent,
        destructive: true,
      },
    ];
  }, [isOwner, isConversationMember, hasPendingRequest, isCancellingRequest]);

  return {
    showInvitePrompt,
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
    handleSubmitReport,
    handleLeaveEvent,
    handleLeaveCancel,
  };
};
