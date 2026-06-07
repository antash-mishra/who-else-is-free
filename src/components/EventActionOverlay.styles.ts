import { StyleSheet } from 'react-native';

import { colors, componentTokens, radii, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  prompt: {
    gap: spacing.sm + spacing.xs,
  },
  promptHeader: {
    gap: spacing.xs,
  },
  inviteInput: {
    minHeight: 140,
    borderRadius: radii.xl,
    backgroundColor: colors.inputSurface,
    paddingHorizontal: componentTokens.input.paddingHorizontal - spacing.xs,
    paddingVertical: componentTokens.input.paddingVertical,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: typography.letterSpacing,
    color: colors.text,
    textAlignVertical: 'top',
  },
  promptTitle: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  promptDescription: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.letterSpacing,
  },
  promptError: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.error,
    lineHeight: typography.caption + spacing.xs,
    letterSpacing: typography.letterSpacing,
  },
  sendButton: {
    backgroundColor: colors.primaryButtonBackground,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    height: componentTokens.button.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.7,
  },
  sendLabel: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.detailLetterSpacing,
  },
  promptButtons: {
    gap: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.actionSurface,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    height: componentTokens.button.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.7,
  },
  secondaryLabel: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.detailLetterSpacing,
  },
  primaryButton: {
    backgroundColor: colors.primaryButtonBackground,
    borderRadius: radii.pill,
    borderCurve: 'continuous',
    height: componentTokens.button.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryLabel: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.body + spacing.xs,
    letterSpacing: typography.detailLetterSpacing,
  },
  destructiveButton: {
    backgroundColor: colors.error,
  },
  destructiveLabel: {
    color: colors.buttonText,
  },
  introMessageText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
});

export default styles;
