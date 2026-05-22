import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  prompt: {
    gap: 12,
  },
  promptHeader: {
    gap: spacing.xs
  },
  inviteInput: {
    minHeight: 140,
    borderRadius: 20,
    backgroundColor: '#F4F4F4',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: typography.letterSpacing,
    color: colors.text,
    textAlignVertical: 'top'
  },
  promptTitle: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  promptDescription: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    lineHeight: 20,
    letterSpacing: typography.letterSpacing
  },
  promptError: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: '#D1382C',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  sendButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendButtonPressed: {
    opacity: 0.7
  },
  sendLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  manageButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  manageButtonPressed: {
    opacity: 0.7
  },
  manageLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  deleteLabel: {
    color: '#FF383C'
  },
  promptButtons: {
    gap: spacing.sm
  },
  secondaryButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonPressed: {
    opacity: 0.7
  },
  secondaryLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  primaryButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonPressed: {
    opacity: 0.85
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  primaryLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  destructiveButton: {
    backgroundColor: '#D1382C'
  },
  destructiveLabel: {
    color: colors.buttonText
  },
  introMessageText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  }
});

export default styles;
