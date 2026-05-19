import { memo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { colors, spacing, typography } from "@theme/index";

export interface HelpCheckboxOption {
  label: string;
  value: string;
}

interface HelpFormProps {
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  buttonLabel: string;
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
  replyEmail = "",
  onReplyEmailChange,
  showReplyEmailInput = false,
  checkedValues = [],
  checkboxOptions = [],
  onToggleCheckbox,
  isSubmitting = false,
}: HelpFormProps) => (
  <View>
    <TextInput
      accessibilityLabel="Help message"
      multiline
      value={message}
      onChangeText={onMessageChange}
      placeholder="Describe in detail what you need help with"
      placeholderTextColor="#8B8B8B"
      style={styles.messageInput}
      textAlignVertical="top"
    />

    {checkboxOptions.length > 0 && (
      <View style={styles.checkboxList}>
        {checkboxOptions.map((option) => {
          const isChecked = checkedValues.includes(option.value);

          return (
            <Pressable
              key={option.value}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isChecked }}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onToggleCheckbox?.(option.value);
              }}
              style={styles.checkboxRow}
            >
              <View
                style={[styles.checkbox, isChecked && styles.checkboxChecked]}
              >
                {isChecked && <Text style={styles.checkboxTick}>{"\u2713"}</Text>}
              </View>
              <Text style={styles.checkboxLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    )}

    {showReplyEmailInput && (
      <TextInput
        accessibilityLabel="Reply email address"
        value={replyEmail}
        onChangeText={onReplyEmailChange}
        placeholder="Enter your email address"
        placeholderTextColor="#8B8B8B"
        style={styles.emailInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
    )}

    <Pressable
      accessibilityRole="button"
      disabled={isSubmitting}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSubmit();
      }}
      style={styles.submitButton}
    >
      {isSubmitting ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.submitButtonText}>{buttonLabel}</Text>
      )}
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  messageInput: {
    minHeight: 140,
    borderRadius: 20,
    backgroundColor: "#F4F4F4",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    color: colors.text,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: typography.letterSpacing,
  },
  checkboxList: {
    marginTop: 13,
    gap: 13,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  checkbox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D0D0D0",
    backgroundColor: "#FFFFFF",
  },
  checkboxChecked: {
    borderColor: "#000000",
    backgroundColor: "#000000",
  },
  checkboxTick: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 16,
    fontFamily: typography.fontFamilySemiBold,
  },
  checkboxLabel: {
    color: "#000000",
    fontSize: 14,
    lineHeight: 18,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.2,
  },
  emailInput: {
    height: 51,
    marginTop: 23,
    borderRadius: 26,
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 20,
    color: "#000000",
    fontSize: 16,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
  submitButton: {
    height: 51,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 29,
    borderRadius: 26,
    backgroundColor: "#000000",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.35,
  },
});

export default memo(HelpForm);
