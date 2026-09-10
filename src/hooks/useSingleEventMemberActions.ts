import { useCallback, useMemo, useState } from 'react';

import { Alert } from 'react-native';

import { ApiError, requestJson } from '@api/client';
import { useAuth } from '@context/AuthContext';
import { getMemberReportError } from '@screens/event-details/eventDetailsErrors';
import { triggerHaptic } from '@services/haptics';
import { logger } from '@services/logger';

export interface SingleEventMemberActionTarget {
  userId: number;
  name: string;
}

interface UseSingleEventMemberActionsOptions {
  eventId?: number | null;
  onSuccess?: () => Promise<void> | void;
  removeErrorTitle?: string;
}

// Same wording as the Event Details member report prompt (useHostRequestActions).
const REPORT_REASON_REQUIRED = 'Please tell us why you are reporting this member.';

const firstNameOf = (name: string | undefined) => name?.trim().split(/\s+/)[0] ?? '';

/**
 * Report & Block / Remove actions for the other member of a 1:1 chat. The
 * report flow mirrors Event Details exactly: menu → confirmation → reason
 * prompt, with the shared `getMemberReportError` copy and never a raw error.
 */
export const useSingleEventMemberActions = ({
  eventId,
  onSuccess,
  removeErrorTitle = "Couldn't remove this person",
}: UseSingleEventMemberActionsOptions) => {
  const { authFetch, token } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState<SingleEventMemberActionTarget | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const reset = useCallback(() => {
    setSelectedTarget(null);
    setShowMenu(false);
    setShowReportConfirm(false);
    setShowReportOverlay(false);
    setReportMessage('');
    setReportError(null);
    setIsSubmittingReport(false);
    setIsRemovingMember(false);
  }, []);

  const openMenu = useCallback((target: SingleEventMemberActionTarget) => {
    triggerHaptic('light');
    setSelectedTarget(target);
    setShowMenu(true);
  }, []);

  const closeMenu = useCallback(() => {
    if (isRemovingMember) {
      return;
    }
    setShowMenu(false);
    setSelectedTarget(null);
  }, [isRemovingMember]);

  const openReportConfirm = useCallback(() => {
    setShowMenu(false);
    setReportError(null);
    setShowReportConfirm(true);
  }, []);

  const cancelReport = useCallback(() => {
    setShowReportConfirm(false);
    setSelectedTarget(null);
  }, []);

  const confirmReport = useCallback(() => {
    setShowReportConfirm(false);
    setReportMessage('');
    setReportError(null);
    setShowReportOverlay(true);
  }, []);

  const closeReportOverlay = useCallback(() => {
    if (isSubmittingReport) {
      return;
    }
    setShowReportOverlay(false);
    setReportMessage('');
    setReportError(null);
  }, [isSubmittingReport]);

  const updateReportMessage = useCallback(
    (text: string) => {
      if (reportError) {
        setReportError(null);
      }
      setReportMessage(text);
    },
    [reportError],
  );

  const handleRemoveMember = useCallback(async () => {
    if (!authFetch || !token || !eventId || !selectedTarget || isRemovingMember) {
      return;
    }

    triggerHaptic('destructive');
    setIsRemovingMember(true);
    setShowMenu(false);

    try {
      await requestJson(`/api/events/${eventId}/chat/members/${selectedTarget.userId}`, {
        method: 'DELETE',
        token,
        timeoutMs: null,
        fetchImpl: authFetch,
        errorMessage: 'Something went wrong on our end. Please try again.',
      });

      await onSuccess?.();
      reset();
    } catch (err) {
      logger.error('Failed to remove member', err);
      Alert.alert(removeErrorTitle, 'Something went wrong on our end. Please try again.');
    } finally {
      setIsRemovingMember(false);
    }
  }, [
    authFetch,
    eventId,
    isRemovingMember,
    onSuccess,
    removeErrorTitle,
    reset,
    selectedTarget,
    token,
  ]);

  const handleSubmitReport = useCallback(async () => {
    if (!authFetch || !token || !eventId || !selectedTarget || isSubmittingReport) {
      return;
    }

    const trimmed = reportMessage.trim();
    if (!trimmed.length) {
      setReportError(REPORT_REASON_REQUIRED);
      return;
    }

    const firstName = firstNameOf(selectedTarget.name);
    triggerHaptic('submit');
    setIsSubmittingReport(true);
    setReportError(null);

    try {
      await requestJson(`/api/events/${eventId}/members/${selectedTarget.userId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
        token,
        timeoutMs: null,
        fetchImpl: authFetch,
        errorMessage: (status) => getMemberReportError(status, firstName),
      });

      await onSuccess?.();
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        // Already mapped through getMemberReportError (409 duplicate or a
        // named generic failure); a duplicate is not worth a log line.
        if (err.status !== 409) {
          logger.error('Failed to submit member report', err);
        }
        setReportError(err.message);
        return;
      }
      logger.error('Failed to submit member report', err);
      setReportError(getMemberReportError(0, firstName));
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    authFetch,
    eventId,
    isSubmittingReport,
    onSuccess,
    reportMessage,
    reset,
    selectedTarget,
    token,
  ]);

  const selectedTargetFirstName = firstNameOf(selectedTarget?.name) || 'Member';

  const menuItems = useMemo(
    () => [
      {
        label: `Report & Block ${selectedTargetFirstName}`,
        onPress: openReportConfirm,
      },
      {
        label: `Remove ${selectedTargetFirstName}`,
        onPress: handleRemoveMember,
        loading: isRemovingMember,
        destructive: true,
      },
    ],
    [handleRemoveMember, isRemovingMember, openReportConfirm, selectedTargetFirstName],
  );

  return {
    cancelReport,
    closeMenu,
    closeReportOverlay,
    confirmReport,
    handleRemoveMember,
    handleSubmitReport,
    isRemovingMember,
    isSubmittingReport,
    menuItems,
    openMenu,
    reportError,
    reportMessage,
    reset,
    selectedTarget,
    selectedTargetFirstName,
    setReportMessage: updateReportMessage,
    showMenu,
    showReportConfirm,
    showReportOverlay,
  };
};

export default useSingleEventMemberActions;
