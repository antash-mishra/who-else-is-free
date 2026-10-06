import { StyleSheet } from 'react-native';

import { colors, radii, spacing, typography } from '@theme/index';

export default StyleSheet.create({
  content: { gap: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.muted, fontSize: typography.caption },
  slider: { width: '100%' },
  done: { borderRadius: radii.pill },
  legacyNotice: { gap: spacing.sm },
});
