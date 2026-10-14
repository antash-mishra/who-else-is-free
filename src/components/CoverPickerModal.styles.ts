import { StyleSheet } from 'react-native';

import { colors, componentTokens, radii, spacing, typography } from '@theme/index';

// Sizes follow the Figma spec for the Choose Cover overlay (node 101:929):
// search 40h/r10, chips 36h/r10 with 15/20 labels, 3-column square tiles
// with an 18pt visual gutter.
const CHIP_HEIGHT = 36;
// Must stay within the gaps around the row: the search field's 16pt bottom
// margin above, and the 20pt gap to the grid below.
const CHIP_ROW_TOUCH_MARGIN = 12;

const styles = StyleSheet.create({
  libraryAction: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.lg },
  libraryButton: { borderRadius: radii.pill },
  pickerError: { color: colors.error, backgroundColor: colors.background, padding: spacing.sm },
  gridWithAction: { paddingBottom: componentTokens.button.height + spacing.lg },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputSurface,
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
    letterSpacing: typography.inputDetailLetterSpacing,
  },
  chipsRow: {
    flexGrow: 0,
    // ScrollView's base style has flexShrink: 1, so the maxHeight-constrained
    // overlay shrinks the row below the chip height and clips the pills.
    flexShrink: 0,
    // The scroll view is the chip height plus a touch margin above and below,
    // so a swipe that starts in the gap around the chips still scrolls the row.
    // Negative margins give the space back, so nothing on screen moves.
    height: CHIP_HEIGHT + CHIP_ROW_TOUCH_MARGIN * 2,
    marginTop: -CHIP_ROW_TOUCH_MARGIN,
    marginBottom: 20 - CHIP_ROW_TOUCH_MARGIN,
    // Full-bleed: scroll chips to the screen edges past the sheet's horizontal
    // padding instead of clipping them 16pt early; the content padding below
    // keeps the first chip aligned with the search field at rest.
    marginHorizontal: -spacing.md,
  },
  chipsContent: {
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  chip: {
    height: CHIP_HEIGHT,
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
