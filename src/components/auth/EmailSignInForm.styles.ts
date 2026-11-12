import { StyleSheet } from 'react-native';

import { colors, componentTokens, spacing, typography } from '@theme/index';

const { codeInput } = componentTokens;

// Mirrors the shared sheet prompts (EventActionOverlay.styles): title + muted
// description, then the field, then the primary and secondary pill buttons.
const styles = StyleSheet.create({
  // Three groups (header, field, actions) with room between them, so the
  // code step's boxes, error and buttons never read as one stack.
  container: {
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  description: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.mutedText,
    lineHeight: typography.bodyLineHeight,
    letterSpacing: typography.letterSpacing,
  },
  emphasis: {
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
  },
  field: {
    gap: spacing.sm + spacing.xs,
  },
  error: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.error,
    lineHeight: typography.caption + spacing.xs,
    letterSpacing: typography.letterSpacing,
  },
  codeRow: {
    flexDirection: 'row',
    gap: codeInput.cellGap,
  },
  codeCell: {
    flex: 1,
    height: codeInput.cellHeight,
    borderRadius: codeInput.cellRadius,
    borderCurve: 'continuous',
    borderWidth: codeInput.activeBorderWidth,
    borderColor: colors.transparent,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeCellActive: {
    borderColor: colors.text,
  },
  codeCellError: {
    borderColor: colors.error,
  },
  codeDigit: {
    fontSize: codeInput.fontSize,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
  },
  // The real input spans the boxes so taps, paste and one-time-code autofill
  // all reach it. Android still draws a transparent-coloured EditText's text,
  // so the text is also 1pt and the view nearly invisible; iOS stops hit-testing
  // views at or below 0.01 opacity, hence 0.011.
  codeInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.011,
    fontSize: 1,
    color: colors.transparent,
    backgroundColor: colors.transparent,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendHint: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.mutedText,
    letterSpacing: typography.detailLetterSpacing,
  },
  resendAction: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: typography.detailLetterSpacing,
  },
  resendActionDisabled: {
    color: colors.mutedText,
  },
  buttons: {
    gap: spacing.sm,
  },
  footer: {
    gap: spacing.md,
  },
});

export default styles;
