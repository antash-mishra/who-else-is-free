import { useState } from 'react';

import { LayoutAnimation, Platform, UIManager } from 'react-native';

import { API_BASE_URL } from '@api/config';
import { useAuth } from '@context/AuthContext';
import { ChatJoinRequest, useChat } from '@context/ChatContext';
import { UserEvent } from '@context/EventsContext';
import { AnalyticsParams, trackEvent } from '@services/analytics';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';

import { EventDetailsNavigation } from './useEventDetailsData';

const isFabricEnabled = Boolean(
  (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager,
);

if (
  Platform.OS === 'android' &&
  !isFabricEnabled &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SelectedMember = {
  id: number;
  name: string;
  avatar?: string;
};

type UseHostRequestActionsArgs = {
  navigation: EventDetailsNavigation;
  event: UserEvent | null;
  eventNumericId: number | null;
  hostRequestStoreKey: number | null;
  isSingleEvent: boolean;
  eventAnalyticsParams: AnalyticsParams;
  pendingRequests: ChatJoinRequest[];
  acceptedRequests: ChatJoinRequest[];
  confirmedMembers: { id: number; name: string; avatar?: string }[];
  reportMessage: string;
  setReportMessage: (value: string) => void;
  setReportError: (value: string | null) => void;
  setShowReportPrompt: (value: boolean) => void;
};

/**
 * Host-side request and member actions for Event Details: accept/decline join
 * requests, request row expansion, the member menu, removing members, and
 * reporting members (shares the report prompt state owned by
 * `useEventDetailsActions`).
 */
export const useHostRequestActions = ({
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
}: UseHostRequestActionsArgs) => {
  const { token, authFetch } = useAuth();
  const {
    setActiveConversation,
    approveJoinRequest,
    denyJoinRequest,
    refreshJoinRequests,
    refreshConversations,
  } = useChat();

  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<number>>(new Set());
  const [acceptingUserId, setAcceptingUserId] = useState<number | null>(null);
  const [decliningUserId, setDecliningUserId] = useState<number | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ChatJoinRequest | null>(null);
  const [isReportingMember, setIsReportingMember] = useState(false);
  // Group member menu state
  const [selectedMember, setSelectedMember] = useState<SelectedMember | null>(null);
  const [showMemberMenu, setShowMemberMenu] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removedMemberBadgeLabel, setRemovedMemberBadgeLabel] = useState<string | null>(null);
  const [reportedMemberBadgeLabel, setReportedMemberBadgeLabel] = useState<string | null>(null);

  const handleAcceptRequest = async (request: ChatJoinRequest) => {
    if (!event || hostRequestStoreKey == null || eventNumericId == null) return;
    setAcceptingUserId(request.userId);
    try {
      await approveJoinRequest(hostRequestStoreKey, eventNumericId, request.userId);
      trackEvent('join_request_approved', eventAnalyticsParams).catch(() => undefined);
      await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      });
      await refreshConversations().catch((err) => {
        logger.error('Failed to refresh conversations after approving request', err);
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (err) {
      logger.error('Failed to accept request', err);
    } finally {
      setAcceptingUserId(null);
    }
  };

  const handleDeclineRequest = async (request: ChatJoinRequest) => {
    if (!event || hostRequestStoreKey == null || eventNumericId == null) return;
    setDecliningUserId(request.userId);
    try {
      await denyJoinRequest(hostRequestStoreKey, eventNumericId, request.userId);
      trackEvent('join_request_denied', eventAnalyticsParams).catch(() => undefined);
      await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
        includeApproved: isSingleEvent,
      });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    } catch (err) {
      logger.error('Failed to decline request', err);
    } finally {
      setDecliningUserId(null);
    }
  };

  const toggleRequestExpanded = (requestId: number) => {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  };

  const handleRequesterPress = async (request: ChatJoinRequest) => {
    if (!request.conversationId) return;
    triggerHaptic('light');
    setActiveConversation(request.conversationId);
    navigation.push('ChatThread');
  };

  const openMemberMenu = (member: SelectedMember) => {
    triggerHaptic('light');
    setSelectedMember(member);
    setShowMemberMenu(true);
  };

  const handleRemoveMember = async () => {
    if (!event || !token || !selectedMember) return;
    if (isRemovingMember) return;
    triggerHaptic('destructive');
    const removedMemberName = selectedMember.name;
    setRemoveError(null);
    setIsRemovingMember(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/chat/members/${selectedMember.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error('Unable to remove member right now.');
      }
      await refreshConversations().catch((err) => {
        logger.error('Failed to refresh conversations after removing member', err);
      });
      if (hostRequestStoreKey != null && eventNumericId != null) {
        await refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
          includeApproved: isSingleEvent,
        }).catch((err) => {
          logger.error('Failed to refresh join requests after removing member', err);
        });
      }
      setShowRemoveConfirm(false);
      setSelectedMember(null);
      const firstName = removedMemberName.trim().split(/\s+/)[0] ?? '';
      setRemovedMemberBadgeLabel(firstName.length > 0 ? `${firstName} removed` : 'Member removed');
    } catch (err) {
      logger.error('Failed to remove member', err);
      setRemoveError('Unable to remove this member. Please try again.');
    } finally {
      setIsRemovingMember(false);
    }
  };

  const handleReportMemberFromMenu = () => {
    setShowMemberMenu(false);
    setReportMessage('');
    setReportError(null);
    // Set selectedRequest-like context so handleSubmitMemberReport works
    if (selectedMember) {
      setSelectedRequest({ userId: selectedMember.id } as ChatJoinRequest);
    }
    setShowReportPrompt(true);
  };

  const handleRemovePromptFromMenu = () => {
    setShowMemberMenu(false);
    setRemoveError(null);
    setShowRemoveConfirm(true);
  };

  const handleRemoveCancel = () => {
    if (isRemovingMember) return;
    setShowRemoveConfirm(false);
  };

  const handleSubmitMemberReport = async () => {
    if (!event || !token || !selectedRequest) return;
    if (isReportingMember) return;
    const trimmed = reportMessage.trim();
    if (!trimmed.length) {
      setReportError('Please tell us why you are reporting this member.');
      return;
    }
    triggerHaptic('submit');
    setReportError(null);
    setIsReportingMember(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/events/${event.id}/members/${selectedRequest.userId}/report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: trimmed }),
        },
      );
      if (response.status === 409) {
        setReportError('You have already reported this member.');
        return;
      }
      if (!response.ok) {
        throw new Error('Unable to submit report right now.');
      }
      const reportTargetName = (
        selectedMember?.name ??
        selectedRequest.requester?.name ??
        pendingRequests.find((request) => request.userId === selectedRequest.userId)?.requester
          ?.name ??
        acceptedRequests.find((request) => request.userId === selectedRequest.userId)?.requester
          ?.name ??
        confirmedMembers.find((member) => member.id === selectedRequest.userId)?.name ??
        ''
      ).trim();
      const firstName = reportTargetName.split(/\s+/)[0] ?? '';
      setReportMessage('');
      setShowReportPrompt(false);
      setSelectedRequest(null);
      setSelectedMember(null);
      setReportedMemberBadgeLabel(
        firstName.length > 0 ? `${firstName} reported and blocked` : 'Member reported and blocked',
      );
      trackEvent('member_reported', eventAnalyticsParams).catch(() => undefined);
      // Refresh requests since the reported member should be removed
      if (hostRequestStoreKey != null && eventNumericId != null) {
        refreshJoinRequests(hostRequestStoreKey, eventNumericId, {
          includeApproved: isSingleEvent,
        });
      }
    } catch (err) {
      logger.error('Failed to submit member report', err);
      setReportError(
        err instanceof Error ? err.message : 'Unable to submit report. Please try again.',
      );
    } finally {
      setIsReportingMember(false);
    }
  };

  return {
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
  };
};
