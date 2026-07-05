import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { triggerHaptic } from '@services/haptics';

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
  holdToConfirm?: boolean;
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
  holdToConfirm = false,
  isConfirmLoading,
  errorMessage,
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
        onPress={() => {
          triggerHaptic('light');
          onCancel();
        }}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
      >
        <Text style={styles.secondaryLabel}>{cancelLabel}</Text>
      </Pressable>
      {holdToConfirm ? (
        <HoldToConfirmButton
          label={confirmLabel}
          onConfirm={onConfirm}
          disabled={isConfirmLoading}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: !!isConfirmLoading }}
          onPress={
            isConfirmLoading
              ? undefined
              : () => {
                  triggerHaptic(confirmTone === 'destructive' ? 'destructive' : 'submit');
                  onConfirm();
                }
          }
          disabled={isConfirmLoading}
          style={({ pressed }) => [
            styles.primaryButton,
            confirmTone === 'destructive' && styles.destructiveButton,
            pressed && !isConfirmLoading && styles.primaryButtonPressed,
            isConfirmLoading && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={[styles.primaryLabel, confirmTone === 'destructive' && styles.destructiveLabel]}>
            {isConfirmLoading ? 'Deleting...' : confirmLabel}
          </Text>
        </Pressable>
      )}
    </View>
  </View>
);

export default EventActionConfirm;
