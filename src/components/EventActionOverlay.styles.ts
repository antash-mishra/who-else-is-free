import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)'
  },
  prompt: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl + spacing.md,
    backgroundColor: colors.background,
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    gap: spacing.md
  },
  promptHeader: {
    gap: spacing.xs
  },
  inviteInput: {
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: '#f1f1f1',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
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
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  promptError: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: '#E73737',
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing
  },
  sendButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center'
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
    paddingVertical: spacing.md,
    alignItems: 'center'
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
    color: '#E73737'
  },
  promptButtons: {
    gap: spacing.sm
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  secondaryButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.05)'
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
    paddingVertical: spacing.md,
    alignItems: 'center'
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
    backgroundColor: '#E73737'
  },
  destructiveLabel: {
    color: colors.buttonText
  }
});

export default styles;
