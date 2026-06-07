import { StyleSheet } from 'react-native';

import { colors, componentTokens, radii, shadows, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: componentTokens.overlay.backdrop,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    ...shadows.sheet,
    overflow: 'hidden',
  },
  keyboardContent: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.5,
  },
  closeButton: {
    width: componentTokens.iconButton.sm,
    height: componentTokens.iconButton.sm,
    borderRadius: radii.pill,
    backgroundColor: componentTokens.overlay.closeButtonBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default styles;
