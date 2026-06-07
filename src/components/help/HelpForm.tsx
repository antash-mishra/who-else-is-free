import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, CheckboxRow, TextField } from '@components/ui';
import { spacing } from '@theme/index';

export interface HelpCheckboxOption {
  label: string;
  value: string;
}

interface HelpFormProps {
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  buttonLabel: string;
  placeholder?: string;
  replyEmail?: string;
  onReplyEmailChange?: (value: string) => void;
  showReplyEmailInput?: boolean;
  checkedValues?: string[];
  checkboxOptions?: HelpCheckboxOption[];
  onToggleCheckbox?: (value: string) => void;
  isSubmitting?: boolean;
}

const HelpForm = ({
  message,
  onMessageChange,
  onSubmit,
  buttonLabel,
  placeholder = 'Describe in detail what you need help with',
  replyEmail = '',
  onReplyEmailChange,
  showReplyEmailInput = false,
  checkedValues = [],
  checkboxOptions = [],
  onToggleCheckbox,
  isSubmitting = false,
}: HelpFormProps) => (
  <View>
    <TextField
      accessibilityLabel="Help message"
      multiline
      value={message}
      onChangeText={onMessageChange}
      placeholder={placeholder}
      style={styles.messageInput}
    />

    {checkboxOptions.length > 0 && (
      <View style={styles.checkboxList}>
        {checkboxOptions.map((option) => {
          const isChecked = checkedValues.includes(option.value);
          return (
            <CheckboxRow
              key={option.value}
              label={option.label}
              checked={isChecked}
              onPress={() => onToggleCheckbox?.(option.value)}
            />
          );
        })}
      </View>
    )}

    {showReplyEmailInput && (
      <TextField
        accessibilityLabel="Reply email address"
        value={replyEmail}
        onChangeText={onReplyEmailChange}
        placeholder="Enter your email address"
        style={styles.emailInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
    )}

    <AppButton
      label={buttonLabel}
      loading={isSubmitting}
      disabled={isSubmitting}
      onPress={onSubmit}
      haptic="submit"
      style={styles.submitButton}
    />
  </View>
);

const styles = StyleSheet.create({
  messageInput: {
    marginTop: 29,
    paddingVertical: spacing.sm + 4,
  },
  checkboxList: {
    marginTop: 20,
    gap: 16,
  },
  emailInput: {
    marginTop: 23,
  },
  submitButton: {
    marginTop: 32,
  },
});

export default memo(HelpForm);
