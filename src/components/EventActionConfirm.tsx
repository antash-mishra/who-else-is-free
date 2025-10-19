import React from 'react';
import { View, Text, Pressable } from 'react-native';

import styles from './EventActionOverlay.styles';

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
        onPress={onCancel}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.secondaryButtonPressed
        ]}
      >
        <Text style={styles.secondaryLabel}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={isConfirmLoading ? undefined : onConfirm}
        disabled={isConfirmLoading}
        style={({ pressed }) => [
          styles.primaryButton,
          confirmTone === 'destructive' && styles.destructiveButton,
          pressed && !isConfirmLoading && styles.primaryButtonPressed,
          isConfirmLoading && styles.primaryButtonDisabled
        ]}
      >
        <Text
          style={[
            styles.primaryLabel,
            confirmTone === 'destructive' && styles.destructiveLabel
          ]}
        >
          {isConfirmLoading ? 'Deleting...' : confirmLabel}
        </Text>
      </Pressable>
    </View>
  </View>
);

export default EventActionConfirm;
