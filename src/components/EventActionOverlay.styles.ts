import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  promptWrapper: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none' as const,
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)'
  },
  menuPrompt: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
  },
  prompt: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    paddingVertical: spacing.sm + 4,
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
    paddingVertical: spacing.sm + 4,
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
    color: '#FF383C'
  },
  promptButtons: {
    gap: spacing.sm
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: spacing.sm + 4,
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
    paddingVertical: spacing.sm + 4,
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
