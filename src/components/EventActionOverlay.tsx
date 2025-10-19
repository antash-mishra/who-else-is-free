import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';

import { colors } from '@theme/index';
import EventActionConfirm, { EventActionConfirmProps } from './EventActionConfirm';
import styles from './EventActionOverlay.styles';

type InviteOverlayProps = {
  type: 'invite';
  inviteMessage: string;
  onInviteMessageChange: (text: string) => void;
  onSendInvite: () => void;
};

type ManageOverlayProps = {
  type: 'manage';
  onEdit: () => void;
  onDelete: () => void;
};

type ConfirmOverlayProps = {
  type: 'confirm';
} & EventActionConfirmProps;

type ResultOverlayProps = {
  type: 'result';
  title: string;
  description?: string;
  dismissLabel: string;
  onDismiss: () => void;
  tone?: 'default' | 'success' | 'error';
};

type OverlayVariantProps = InviteOverlayProps | ManageOverlayProps | ConfirmOverlayProps | ResultOverlayProps;

type EventActionOverlayProps = {
  isVisible: boolean;
  onBackdropPress?: () => void;
} & OverlayVariantProps;

const EventActionOverlay: React.FC<EventActionOverlayProps> = (props) => {
  const { isVisible, onBackdropPress, type } = props;

  if (!isVisible) return null;

  const renderInvitePrompt = () => {
    if (props.type !== 'invite') return null;
    const { inviteMessage, onInviteMessageChange, onSendInvite } = props;

    return (
      <View style={styles.prompt}>
        <TextInput
          accessibilityLabel="Message to the organizer"
          placeholder="Message to the organizer"
          placeholderTextColor={colors.subText}
          multiline
          value={inviteMessage}
          onChangeText={onInviteMessageChange}
          style={styles.inviteInput}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onSendInvite}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.sendButtonPressed
          ]}
        >
          <Text style={styles.sendLabel}>Send</Text>
        </Pressable>
      </View>
    );
  };

  const renderManagePrompt = () => {
    if (props.type !== 'manage') return null;
    const { onEdit, onDelete } = props;

    return (
      <View style={styles.prompt}>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed
          ]}
        >
          <Text style={styles.manageLabel}>Edit Event</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDelete}
          style={({ pressed }) => [
            styles.manageButton,
            pressed && styles.manageButtonPressed
          ]}
        >
          <Text style={[styles.manageLabel, styles.deleteLabel]}>Delete Event</Text>
        </Pressable>
      </View>
    );
  };

  const renderConfirmPrompt = () => {
    if (props.type !== 'confirm') return null;
    const {
      title,
      description,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
      confirmTone,
      isConfirmLoading,
      errorMessage
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
    if (props.type !== 'result') return null;
    const { title, description, dismissLabel, onDismiss, tone = 'default' } = props;

    return (
      <View style={styles.prompt}>
        <View style={styles.promptHeader}>
          <Text style={styles.promptTitle}>{title}</Text>
          {description ? <Text style={styles.promptDescription}>{description}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.primaryButton,
            tone === 'error' && styles.destructiveButton,
            pressed && styles.primaryButtonPressed
          ]}
        >
          <Text
            style={[
              styles.primaryLabel,
              tone === 'error' && styles.destructiveLabel
            ]}
          >
            {dismissLabel}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      <Pressable style={styles.overlayBackdrop} onPress={onBackdropPress} />
      {type === 'invite' && renderInvitePrompt()}
      {type === 'manage' && renderManagePrompt()}
      {type === 'confirm' && renderConfirmPrompt()}
      {type === 'result' && renderResultPrompt()}
    </View>
  );
};

export default EventActionOverlay;
