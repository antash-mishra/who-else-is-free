import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { colors } from "@theme/index";
import BottomSheetModal from "./BottomSheetModal";
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

type MenuItemProps = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

type MenuOverlayProps = {
  type: "menu";
  items: MenuItemProps[];
};

type ViewIntroOverlayProps = {
  type: "viewIntro";
  introMessage: string;
  onDismiss: () => void;
};

type OverlayVariantProps =
  | InviteOverlayProps
  | ManageOverlayProps
  | ConfirmOverlayProps
  | ResultOverlayProps
  | PendingRequestOverlayProps
  | ReportOverlayProps
  | MenuOverlayProps
  | ViewIntroOverlayProps;

type EventActionOverlayProps = {
  isVisible: boolean;
  onBackdropPress?: () => void;
} & OverlayVariantProps;

const EventActionOverlay: React.FC<EventActionOverlayProps> = (props) => {
  const { isVisible, onBackdropPress, type } = props;

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
      <View style={styles.prompt}>
        <TextInput
          accessibilityLabel="Send an intro about you and why you would like to join."
          placeholder="Send an intro about you and why you would like to join."
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
          onPress={() => { if (!isDisabled) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSendInvite(); } }}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.sendButton,
            isDisabled && styles.primaryButtonDisabled,
            pressed && !isDisabled && styles.sendButtonPressed,
          ]}
          testID="action-item-invite"
        >
          <Text style={styles.sendLabel}>
            {inviteSubmitting ? "Sending…" : "Send Introduction"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderManagePrompt = () => {
    if (props.type !== "manage") return null;
    const { onEdit, onDelete } = props;

    return (
      <View style={styles.prompt}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEdit(); }}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
          testID="action-item-edit"
        >
          <Text style={styles.manageLabel}>Edit Event</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onDelete(); }}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
          testID="action-item-delete"
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
      <View style={styles.prompt}>
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>{title}</Text>
          {description ? (
            <Text style={styles.promptDescription}>{description}</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismiss(); }}
          style={({ pressed }) => [
            styles.primaryButton,
            tone === "error" && styles.destructiveButton,
            pressed && styles.primaryButtonPressed,
          ]}
          testID="action-item-dismiss"
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
      <View style={styles.prompt}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { if (!isCancelling) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onCancelRequest(); } }}
          disabled={isCancelling}
          style={({ pressed }) => [
            styles.manageButton,
            isCancelling && styles.primaryButtonDisabled,
            pressed && !isCancelling && styles.manageButtonPressed,
          ]}
          testID="action-item-cancel"
        >
          <Text style={styles.manageLabel}>
            {isCancelling ? "Cancelling…" : "Cancel Request"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => { if (!isCancelling) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onReportEvent(); } }}
          disabled={isCancelling}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed,
          ]}
          testID="action-item-report"
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
      <View style={styles.prompt}>
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
          onPress={() => { if (!isDisabled) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSubmitReport(); } }}
          disabled={isDisabled}
          style={({ pressed }) => [
            styles.sendButton,
            isDisabled && styles.primaryButtonDisabled,
            pressed && !isDisabled && styles.sendButtonPressed,
          ]}
          testID="action-item-submit-report"
        >
          <Text style={styles.sendLabel}>
            {reportSubmitting ? "Submitting…" : "Submit Report"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderMenuPrompt = () => {
    if (props.type !== "menu") return null;
    const { items } = props;

    return (
      <View style={styles.prompt}>
        {items.map((item, index) => {
          const isDisabled = item.loading || item.disabled;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              onPress={() => { if (!isDisabled) { item.destructive ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.onPress(); } }}
              disabled={isDisabled}
              style={({ pressed }) => [
                styles.manageButton,
                isDisabled && styles.primaryButtonDisabled,
                pressed && !isDisabled && styles.manageButtonPressed,
              ]}
              testID={`action-item-menu-${index}`}
            >
              <Text
                style={[
                  styles.manageLabel,
                  item.destructive && styles.deleteLabel,
                ]}
              >
                {item.loading ? `${item.label}…` : item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderViewIntroPrompt = () => {
    if (props.type !== "viewIntro") return null;
    const { introMessage, onDismiss } = props;

    return (
      <View style={styles.prompt}>
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Your Introduction</Text>
          <Text style={styles.introMessageText}>"{introMessage}"</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onDismiss(); }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
          testID="action-item-done"
        >
          <Text style={styles.primaryLabel}>Done</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <BottomSheetModal
      visible={isVisible}
      onClose={onBackdropPress ?? (() => {})}
    >
      {type === "invite" && renderInvitePrompt()}
      {type === "manage" && renderManagePrompt()}
      {type === "confirm" && renderConfirmPrompt()}
      {type === "result" && renderResultPrompt()}
      {type === "pendingRequest" && renderPendingRequestPrompt()}
      {type === "report" && renderReportPrompt()}
      {type === "menu" && renderMenuPrompt()}
      {type === "viewIntro" && renderViewIntroPrompt()}
    </BottomSheetModal>
  );
};

export default EventActionOverlay;
