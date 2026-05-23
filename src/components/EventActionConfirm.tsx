import React from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

import styles from './EventActionOverlay.styles';
import HoldToConfirmButton from './HoldToConfirmButton';

export type EventActionConfirmProps = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmTone?: 'default' | 'destructive';
  isConfirmLoading?: boolean;
  errorMessage?: string | null;
};

const EventActionConfirm: React.FC<EventActionConfirmProps> = ({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmTone = 'default',
  isConfirmLoading,
  errorMessage
}) => (
  <View style={styles.prompt}>
    <View style={styles.promptHeader}>
      <Text style={styles.promptTitle}>{title}</Text>
      {description ? <Text style={styles.promptDescription}>{description}</Text> : null}
      {errorMessage ? <Text style={styles.promptError}>{errorMessage}</Text> : null}
    </View>
    <View style={styles.promptButtons}>
      <Pressable
        accessibilityRole="button"
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCancel(); }}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.secondaryButtonPressed
        ]}
      >
        <Text style={styles.secondaryLabel}>{cancelLabel}</Text>
      </Pressable>
      {confirmTone === 'destructive' ? (
        <HoldToConfirmButton
          label={confirmLabel}
          onConfirm={onConfirm}
          disabled={isConfirmLoading}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={isConfirmLoading ? undefined : () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onConfirm(); }}
          disabled={isConfirmLoading}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !isConfirmLoading && styles.primaryButtonPressed,
            isConfirmLoading && styles.primaryButtonDisabled
          ]}
        >
          <Text style={styles.primaryLabel}>{confirmLabel}</Text>
        </Pressable>
      )}
    </View>
  </View>
);

export default EventActionConfirm;
