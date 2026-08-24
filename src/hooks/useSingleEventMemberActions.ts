import { useCallback, useMemo, useState } from 'react';

import { Alert } from 'react-native';

import { ApiError, requestJson } from '@api/client';
import { useAuth } from '@context/AuthContext';
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
  reportErrorMessages?: {
    empty?: string;
    duplicate?: string;
    generic?: string;
  };
}

const DEFAULT_REPORT_ERRORS = {
  empty: "Please tell us why you're reporting this member.",
  duplicate: 'You have already reported this member.',
  generic: "Couldn't submit report. Please try again.",
};

export const useSingleEventMemberActions = ({
  eventId,
  onSuccess,
  removeErrorTitle = "Couldn't remove this person",
  reportErrorMessages,
}: UseSingleEventMemberActionsOptions) => {
  const { authFetch, token } = useAuth();
  const [selectedTarget, setSelectedTarget] = useState<SingleEventMemberActionTarget | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportOverlay, setShowReportOverlay] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  const errors = {
    ...DEFAULT_REPORT_ERRORS,
    ...reportErrorMessages,
  };

  const reset = useCallback(() => {
    setSelectedTarget(null);
    setShowMenu(false);
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

  const openReportOverlay = useCallback(() => {
    setShowMenu(false);
    setReportError(null);
    setReportMessage('');
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
      setReportError(errors.empty);
      return;
    }

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
        errorMessage: errors.generic,
      });

      await onSuccess?.();
      reset();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReportError(errors.duplicate);
        return;
      }
      logger.error('Failed to submit member report', err);
      setReportError(err instanceof Error ? err.message : errors.generic);
    } finally {
      setIsSubmittingReport(false);
    }
  }, [
    authFetch,
    errors.duplicate,
    errors.empty,
    errors.generic,
    eventId,
    isSubmittingReport,
    onSuccess,
    reportMessage,
    reset,
    selectedTarget,
    token,
  ]);

  const selectedTargetFirstName = selectedTarget?.name.trim().split(/\s+/)[0] ?? 'Member';

  const menuItems = useMemo(
    () => [
      {
        label: `Report & Block ${selectedTargetFirstName}`,
        onPress: openReportOverlay,
      },
      {
        label: `Remove ${selectedTargetFirstName}`,
        onPress: handleRemoveMember,
        loading: isRemovingMember,
        destructive: true,
      },
    ],
    [handleRemoveMember, isRemovingMember, openReportOverlay, selectedTargetFirstName],
  );

  return {
    closeMenu,
    closeReportOverlay,
    handleRemoveMember,
    handleSubmitReport,
    isRemovingMember,
    isSubmittingReport,
    menuItems,
    openMenu,
    openReportOverlay,
    reportError,
    reportMessage,
    reset,
    selectedTarget,
    selectedTargetFirstName,
    setReportMessage: updateReportMessage,
    showMenu,
    showReportOverlay,
  };
};

export default useSingleEventMemberActions;
