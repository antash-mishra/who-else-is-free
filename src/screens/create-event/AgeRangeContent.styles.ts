import { StyleSheet } from 'react-native';

import { colors, componentTokens, radii, spacing, typography } from '@theme/index';

export default StyleSheet.create({
  content: { gap: spacing.md },
  slider: { width: '100%' },
  thumbLabels: { height: 20 },
  thumbLabel: {
    position: 'absolute',
    width: componentTokens.ageRange.labelWidth,
    textAlign: 'center',
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamilyMedium,
  },
  // Extra room between the slider and Done, on top of the content gap.
  done: { borderRadius: radii.pill, marginTop: spacing.md },
  legacyNotice: { gap: spacing.sm },
});
