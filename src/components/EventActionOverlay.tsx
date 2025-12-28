import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, spacing } from "@theme/index";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EventActionConfirm, {
  EventActionConfirmProps,
} from "./EventActionConfirm";
import styles from "./EventActionOverlay.styles";

type InviteOverlayProps = {
  type: "invite";
  inviteMessage: string;
  onInviteMessageChange: (text: string) => void;
  onSendInvite: () => void;
  inviteError?: string | null;
  inviteSubmitting?: boolean;
  inviteDisabled?: boolean;
};

type ManageOverlayProps = {
  type: "manage";
  onEdit: () => void;
  onDelete: () => void;
};

type ConfirmOverlayProps = {
  type: "confirm";
} & EventActionConfirmProps;

type ResultOverlayProps = {
  type: "result";
  title: string;
  description?: string;
  dismissLabel: string;
  onDismiss: () => void;
  tone?: "default" | "success" | "error";
};

type PendingRequestOverlayProps = {
  type: "pendingRequest";
  onCancelRequest: () => void;
  onReportEvent: () => void;
  isCancelling?: boolean;
};

type ReportOverlayProps = {
  type: "report";
  reportMessage: string;
  onReportMessageChange: (text: string) => void;
  onSubmitReport: () => void;
  reportError?: string | null;
  reportSubmitting?: boolean;
  reportDisabled?: boolean;
};

type OverlayVariantProps =
  | InviteOverlayProps
  | ManageOverlayProps
  | ConfirmOverlayProps
  | ResultOverlayProps
  | PendingRequestOverlayProps
  | ReportOverlayProps;

type EventActionOverlayProps = {
  isVisible: boolean;
  onBackdropPress?: () => void;
} & OverlayVariantProps;

const EventActionOverlay: React.FC<EventActionOverlayProps> = (props) => {
  const { isVisible, onBackdropPress, type } = props;
  const insets = useSafeAreaInsets();
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const windowHeight = Dimensions.get("window").height;
      const screenY = event.endCoordinates?.screenY ?? windowHeight;
      const keyboardHeight = Math.max(0, windowHeight - screenY);
      setKeyboardOffset(keyboardHeight);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const promptPositionStyle = useMemo(
    () => ({
      bottom:
        keyboardOffset > 0
          ? keyboardOffset + spacing.lg
          : Math.max(insets.bottom, spacing.lg) + spacing.md,
    }),
    [insets.bottom, keyboardOffset],
  );

  if (!isVisible) return null;

  const renderInvitePrompt = () => {
    if (props.type !== "invite") return null;
    const {
      inviteMessage,
      onInviteMessageChange,
      onSendInvite,
      inviteError,
      inviteSubmitting,
      inviteDisabled,
    } = props;

    const isDisabled = inviteSubmitting || inviteDisabled;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <TextInput
          accessibilityLabel="Message to the organizer"
          placeholder="Message to the organizer"
          placeholderTextColor={colors.subText}
          multiline
          value={inviteMessage}
          onChangeText={onInviteMessageChange}
          style={styles.inviteInput}
        />
        {inviteError ? (
          <Text style={styles.promptError}>{inviteError}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSendInvite}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.sendButton,
            isDisabled && styles.primaryButtonDisabled,
            pressed && !isDisabled && styles.sendButtonPressed,
          ]}
        >
          <Text style={styles.sendLabel}>
            {inviteSubmitting ? "Sending…" : "Send"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderManagePrompt = () => {
    if (props.type !== "manage") return null;
    const { onEdit, onDelete } = props;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
        >
          <Text style={styles.manageLabel}>Edit Event</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDelete}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
        >
          <Text style={[styles.manageLabel, styles.deleteLabel]}>
            Delete Event
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderConfirmPrompt = () => {
    if (props.type !== "confirm") return null;
    const {
      title,
      description,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
      confirmTone,
      isConfirmLoading,
      errorMessage,
    } = props;

    return (
      <EventActionConfirm
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmTone={confirmTone}
        isConfirmLoading={isConfirmLoading}
        errorMessage={errorMessage}
      />
    );
  };

  const renderResultPrompt = () => {
    if (props.type !== "result") return null;
    const {
      title,
      description,
      dismissLabel,
      onDismiss,
      tone = "default",
    } = props;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>{title}</Text>
          {description ? (
            <Text style={styles.promptDescription}>{description}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.primaryButton,
            tone === "error" && styles.destructiveButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text
            style={[
              styles.primaryLabel,
              tone === "error" && styles.destructiveLabel,
            ]}
          >
            {dismissLabel}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderPendingRequestPrompt = () => {
    if (props.type !== "pendingRequest") return null;
    const { onCancelRequest, onReportEvent, isCancelling } = props;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancelRequest}
          disabled={isCancelling}
          style={({ pressed }) => [
            styles.manageButton,
            isCancelling && styles.primaryButtonDisabled,
            pressed && !isCancelling && styles.manageButtonPressed,
          ]}
        >
          <Text style={styles.manageLabel}>
            {isCancelling ? "Cancelling…" : "Cancel Request"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onReportEvent}
          disabled={isCancelling}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
        >
          <Text style={[styles.manageLabel, styles.deleteLabel]}>
            Report Event
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderReportPrompt = () => {
    if (props.type !== "report") return null;
    const {
      reportMessage,
      onReportMessageChange,
      onSubmitReport,
      reportError,
      reportSubmitting,
      reportDisabled,
    } = props;

    const isDisabled = reportSubmitting || reportDisabled;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <TextInput
          accessibilityLabel="Tell us why you are reporting this event"
          placeholder="Tell us why you are reporting this event"
          placeholderTextColor={colors.subText}
          multiline
          value={reportMessage}
          onChangeText={onReportMessageChange}
          style={styles.inviteInput}
        />
        {reportError ? (
          <Text style={styles.promptError}>{reportError}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onSubmitReport}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.sendButton,
            isDisabled && styles.primaryButtonDisabled,
            pressed && !isDisabled && styles.sendButtonPressed,
          ]}
        >
          <Text style={styles.sendLabel}>
            {reportSubmitting ? "Submitting…" : "Submit Report"}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      <Pressable style={styles.overlayBackdrop} onPress={onBackdropPress} />
      {type === "invite" && renderInvitePrompt()}
      {type === "manage" && renderManagePrompt()}
      {type === "confirm" && renderConfirmPrompt()}
      {type === "result" && renderResultPrompt()}
      {type === "pendingRequest" && renderPendingRequestPrompt()}
      {type === "report" && renderReportPrompt()}
    </View>
  );
};

export default EventActionOverlay;
