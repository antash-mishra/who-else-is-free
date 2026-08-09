import React from 'react';

import { Pressable, Text, TextInput, View } from 'react-native';

import { SheetActionList } from '@components/sheets';
import { triggerHaptic } from '@services/haptics';
import { colors } from '@theme/index';

import EventActionConfirm, { EventActionConfirmProps } from './EventActionConfirm';
import styles from './EventActionOverlay.styles';

export type InvitePromptProps = {
  inviteMessage: string;
  onInviteMessageChange: (text: string) => void;
  onSendInvite: () => void;
  inviteError?: string | null;
  inviteSubmitting?: boolean;
  inviteDisabled?: boolean;
};

export type ManageEventMenuProps = {
  onEdit: () => void;
  onDelete: () => void;
};

export type ConfirmActionSheetProps = EventActionConfirmProps;

export type ResultPromptProps = {
  title: string;
  description?: string;
  dismissLabel: string;
  onDismiss: () => void;
  tone?: 'default' | 'success' | 'error';
};

export type PendingRequestMenuProps = {
  onCancelRequest: () => void;
  onReportEvent: () => void;
  isCancelling?: boolean;
};

export type ReportPromptProps = {
  reportMessage: string;
  onReportMessageChange: (text: string) => void;
  onSubmitReport: () => void;
  reportError?: string | null;
  reportSubmitting?: boolean;
  reportDisabled?: boolean;
};

export type ActionMenuItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
};

export type ActionMenuProps = {
  items: ActionMenuItem[];
};

export type IntroMessagePromptProps = {
  introMessage: string;
  onDismiss: () => void;
};

export const InvitePrompt = ({
  inviteMessage,
  onInviteMessageChange,
  onSendInvite,
  inviteError,
  inviteSubmitting,
  inviteDisabled,
}: InvitePromptProps) => {
  const isDisabled = inviteSubmitting || inviteDisabled;

  return (
    <View style={styles.prompt}>
      <TextInput
        accessibilityLabel="Share a short intro with the host"
        placeholder="Share a short intro with the host"
        placeholderTextColor={colors.subText}
        multiline
        value={inviteMessage}
        onChangeText={onInviteMessageChange}
        style={styles.inviteInput}
      />
      {inviteError ? <Text style={styles.promptError}>{inviteError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        onPress={() => {
          if (!isDisabled) {
            triggerHaptic('submit');
            onSendInvite();
          }
        }}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.sendButton,
          isDisabled && styles.primaryButtonDisabled,
          pressed && !isDisabled && styles.sendButtonPressed,
        ]}
        testID="action-item-invite"
      >
        <Text style={styles.sendLabel}>{inviteSubmitting ? 'Sending…' : 'Send request'}</Text>
      </Pressable>
    </View>
  );
};

export const ManageEventMenu = ({ onEdit, onDelete }: ManageEventMenuProps) => (
  <SheetActionList
    items={[
      { label: 'Edit Event', onPress: onEdit, testID: 'action-item-edit' },
      {
        label: 'Delete Event',
        onPress: onDelete,
        destructive: true,
        testID: 'action-item-delete',
      },
    ]}
  />
);

export const ConfirmActionSheet = (props: ConfirmActionSheetProps) => (
  <EventActionConfirm {...props} />
);

export const ResultPrompt = ({
  title,
  description,
  dismissLabel,
  onDismiss,
  tone = 'default',
}: ResultPromptProps) => (
  <View style={styles.prompt}>
    <View style={styles.promptHeader}>
      <Text style={styles.promptTitle}>{title}</Text>
      {description ? <Text style={styles.promptDescription}>{description}</Text> : null}
    </View>
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        triggerHaptic('light');
        onDismiss();
      }}
      style={({ pressed }) => [
        styles.primaryButton,
        tone === 'error' && styles.destructiveButton,
        pressed && styles.primaryButtonPressed,
      ]}
      testID="action-item-dismiss"
    >
      <Text style={[styles.primaryLabel, tone === 'error' && styles.destructiveLabel]}>
        {dismissLabel}
      </Text>
    </Pressable>
  </View>
);

export const PendingRequestMenu = ({
  onCancelRequest,
  onReportEvent,
  isCancelling,
}: PendingRequestMenuProps) => (
  <SheetActionList
    items={[
      {
        label: isCancelling ? 'Cancelling…' : 'Cancel Request',
        onPress: onCancelRequest,
        loading: isCancelling,
        disabled: isCancelling,
        testID: 'action-item-cancel',
      },
      {
        label: 'Report Event',
        onPress: onReportEvent,
        destructive: true,
        disabled: isCancelling,
        testID: 'action-item-report',
      },
    ]}
  />
);

export const ReportPrompt = ({
  reportMessage,
  onReportMessageChange,
  onSubmitReport,
  reportError,
  reportSubmitting,
  reportDisabled,
}: ReportPromptProps) => {
  const isDisabled = reportSubmitting || reportDisabled;

  return (
    <View style={styles.prompt}>
      <TextInput
        accessibilityLabel="Tell us why you're reporting this plan"
        placeholder="Tell us why you're reporting this plan"
        placeholderTextColor={colors.subText}
        multiline
        value={reportMessage}
        onChangeText={onReportMessageChange}
        style={styles.inviteInput}
      />
      {reportError ? <Text style={styles.promptError}>{reportError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        onPress={() => {
          if (!isDisabled) {
            triggerHaptic('submit');
            onSubmitReport();
          }
        }}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.sendButton,
          isDisabled && styles.primaryButtonDisabled,
          pressed && !isDisabled && styles.sendButtonPressed,
        ]}
        testID="action-item-submit-report"
      >
        <Text style={styles.sendLabel}>{reportSubmitting ? 'Submitting…' : 'Submit report'}</Text>
      </Pressable>
    </View>
  );
};

export const ActionMenu = ({ items }: ActionMenuProps) => (
  <SheetActionList
    items={items.map((item, index) => ({
      ...item,
      testID: `action-item-menu-${index}`,
    }))}
  />
);

export const IntroMessagePrompt = ({ introMessage, onDismiss }: IntroMessagePromptProps) => (
  <View style={styles.prompt}>
    <View style={styles.promptHeader}>
      <Text style={styles.promptTitle}>Your intro</Text>
      <Text style={styles.introMessageText}>{`"${introMessage}"`}</Text>
    </View>
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        triggerHaptic('light');
        onDismiss();
      }}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
      testID="action-item-done"
    >
      <Text style={styles.primaryLabel}>Done</Text>
    </Pressable>
  </View>
);
