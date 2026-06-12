import { StyleSheet } from 'react-native';

import { colors, radii, spacing, typography } from '@theme/index';

// Sizes follow the Figma spec for the Choose Cover overlay (node 101:929):
// search 40h/r10, chips 36h/r10 with 15/20 labels, 3-column square tiles
// with an 18pt visual gutter.
const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: radii.md,
    borderCurve: 'continuous',
    height: 40,
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    padding: 0,
    letterSpacing: typography.detailLetterSpacing,
  },
  chipsRow: {
    flexGrow: 0,
    // ScrollView's base style has flexShrink: 1, so the maxHeight-constrained
    // overlay shrinks the row below the chip height and clips the pills.
    flexShrink: 0,
    height: 36,
    marginBottom: 20,
  },
  chipsContent: {
    gap: 6,
    alignItems: 'center',
    paddingRight: spacing.md,
  },
  chip: {
    height: 36,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: typography.detailLetterSpacing,
    color: colors.muted,
  },
  chipLabelActive: {
    color: colors.background,
  },
  gridContainer: {
    flex: 1,
  },
  grid: {
    paddingBottom: spacing.sm,
  },
  column: {
    // 18pt visual gutter minus the ring (2) + card (1.5) insets on each tile.
    columnGap: 11,
    marginBottom: 11,
  },
  optionRing: {
    flex: 1,
    minWidth: 0,
    // Cap cells so partial last rows (catalog size % 3 !== 0) keep
    // 3-column tile sizing instead of stretching across the row.
    maxWidth: '33.33%',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 2,
    backgroundColor: 'transparent',
  },
  optionRingSelected: {
    backgroundColor: colors.text,
  },
  option: {
    flex: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 1.5,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  optionImageWrapper: {
    borderRadius: radii.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  optionImage: {
    width: '100%',
    aspectRatio: 1,
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    padding: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default styles;
