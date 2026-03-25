import { BlurView } from "expo-blur";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, spacing } from "@theme/index";
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

const SLIDE_DURATION = 250;
const SLIDE_DISTANCE = 300;

const EventActionOverlay: React.FC<EventActionOverlayProps> = (props) => {
  const { isVisible, onBackdropPress, type } = props;
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const slideAnim = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    if (isVisible) {
      hasBeenVisible.current = true;
      setShowOverlay(true);
      slideAnim.setValue(SLIDE_DISTANCE);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: SLIDE_DURATION, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: SLIDE_DURATION, useNativeDriver: true }),
      ]).start();
    } else if (hasBeenVisible.current) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SLIDE_DISTANCE, duration: SLIDE_DURATION, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: SLIDE_DURATION, useNativeDriver: true }),
      ]).start(() => setShowOverlay(false));
    }
  }, [isVisible, slideAnim, backdropAnim]);

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
      bottom: keyboardOffset > 0 ? keyboardOffset + spacing.sm : 0,
      borderBottomLeftRadius: keyboardOffset > 0 ? 24 : 0,
      borderBottomRightRadius: keyboardOffset > 0 ? 24 : 0,
    }),
    [keyboardOffset],
  );

  const menuPromptPositionStyle = useMemo(
    () => ({
      bottom: keyboardOffset > 0 ? keyboardOffset + spacing.sm : 0,
      borderBottomLeftRadius: keyboardOffset > 0 ? 28 : 0,
      borderBottomRightRadius: keyboardOffset > 0 ? 28 : 0,
    }),
    [keyboardOffset],
  );

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
          onPress={onSendInvite}
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
      <View style={[styles.prompt, promptPositionStyle]}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
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
          onPress={onDelete}
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
          testID="action-item-cancel"
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
      <BlurView
        intensity={80}
        tint="systemMaterial"
        style={[styles.menuPrompt, menuPromptPositionStyle]}
      >
        {items.map((item, index) => {
          const isDisabled = item.loading || item.disabled;
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              onPress={item.onPress}
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
      </BlurView>
    );
  };

  const renderViewIntroPrompt = () => {
    if (props.type !== "viewIntro") return null;
    const { introMessage, onDismiss } = props;

    return (
      <View style={[styles.prompt, promptPositionStyle]}>
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>Your Introduction</Text>
          <Text style={styles.introMessageText}>"{introMessage}"</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
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
    <Modal visible={showOverlay} transparent animationType="none">
      <View style={styles.overlayContainer} pointerEvents="box-none" testID="action-menu">
        <Animated.View
          style={[styles.overlayBackdrop, { opacity: backdropAnim }]}
          pointerEvents="box-none"
        >
          <Pressable style={{ flex: 1 }} onPress={onBackdropPress} testID="action-backdrop" />
        </Animated.View>
        <Animated.View style={[styles.promptWrapper, { transform: [{ translateY: slideAnim }] }]}>
          {type === "invite" && renderInvitePrompt()}
          {type === "manage" && renderManagePrompt()}
          {type === "confirm" && renderConfirmPrompt()}
          {type === "result" && renderResultPrompt()}
          {type === "pendingRequest" && renderPendingRequestPrompt()}
          {type === "report" && renderReportPrompt()}
          {type === "menu" && renderMenuPrompt()}
          {type === "viewIntro" && renderViewIntroPrompt()}
        </Animated.View>
      </View>
    </Modal>
  );
};

export default EventActionOverlay;
