import { StyleSheet } from 'react-native';

import { colors, componentTokens, spacing, typography } from '@theme/index';

/**
 * Shared styles for the Event Details screen family
 * (`EventDetailsScreen` and the components in `src/screens/event-details/`).
 */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentWrapper: {
    flex: 1,
    backgroundColor: colors.background, // Your original background color
  },
  heroContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlayDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  heroOverlayLight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  overlayWrapper: {
    flex: 1,
    backgroundColor: componentTokens.overlay.backdrop,
  },
  overlayDismissZone: {
    height: '10%',
  },
  overlayContentContainer: {
    flex: 1,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  overlayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 10,
  },
  overlayHeaderTitle: {
    flex: 1,
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.buttonText,
    textAlign: 'center',
    marginRight: -40,
  },
  overlayCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayCloseButtonFixed: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    elevation: 10,
  },
  backButton: {
    position: 'absolute',
    top: 10,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    // Frosted glass: BlurView fills the circle; overflow clips it to the round
    // shape. Faint tint keeps the white icon readable if blur is unavailable.
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  menuButton: {
    position: 'absolute',
    top: 10,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  // Image card container
  imageCardContainer: {
    width: '60%',
    aspectRatio: 1, // Square card
  },
  imageCardContainerOverlay: {
    width: '50%',
  },

  // The elevated image card
  imageCard: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    borderCurve: 'continuous',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15, // For Android
  },

  pageScrollContent: {
    paddingBottom: 0,
  },
  card: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 20,
    gap: spacing.sm,
  },
  title: {
    fontSize: 29,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.titleLineHeight,
    letterSpacing: typography.letterSpacing,
  },
  // Groups title + host + going with NO gap, so each gap below is exactly the
  // child's marginTop (no hidden card gap). Tune the two gaps via:
  //   Gap A (title → host):   hostedBy.marginTop
  //   Gap B (host → going):   goingRow.marginTop / goingLabelStandalone.marginTop
  headerBlock: {},
  hostedBy: {
    marginTop: spacing.xs, // Gap A: title → "Hosted by"
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    lineHeight: 20,
    letterSpacing: typography.letterSpacing,
  },
  goingRow: {
    marginTop: spacing.sm, // Gap B: host → "N Going" (group)
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  goingLabelStandalone: {
    marginTop: spacing.sm, // Gap B: host → "1:1" (single event)
  },
  goingAvatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goingAvatarItem: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  goingAvatarOverlap: {
    marginLeft: -9,
  },
  goingLabel: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.iconColor,
    lineHeight: 20,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  sectionHeading: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  detailDiv: {
    flexDirection: 'column',
    paddingTop: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  detailIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    letterSpacing: -0.4,
    flex: 1,
  },
  description: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start', // top-aligned so the icon can center on the first line
    gap: 6,
    paddingVertical: 4, // match the other detail rows' rhythm
  },
  descriptionIconContainer: {
    width: 24,
    height: 22, // = description line-height, centers the icon on the first line
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionContent: {
    flex: 1,
  },
  measureContainer: {
    position: 'absolute',
    top: -9999,
    left: 0,
    right: 0,
    opacity: 0,
  },
  ctaContainer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  pinnedCtaWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
    justifyContent: 'flex-end',
  },
  ctaContainerActive: {
    backgroundColor: '#F5F5F5',
  },
  introMessageText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    fontStyle: 'italic',
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonDisabled: {
    backgroundColor: colors.eventDetailButtonDisabledBackground,
  },
  ctaButtonPressed: {
    opacity: 0.7,
  },
  ctaLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  ctaLabelDisabled: {
    color: colors.eventDetailButtonDisabledText,
  },
  ownerButton: {
    backgroundColor: colors.actionSurface,
  },
  ownerLabel: {
    color: colors.text,
  },
  fallbackContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  fallbackText: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText,
    textAlign: 'center',
  },
  fallbackBackButton: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
  },
  fallbackCloseButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },

  // Separator bar before tabs (host only)
  tabSeparator: {
    height: 8,
    backgroundColor: colors.inputSurface,
    marginHorizontal: -spacing.md,
    marginTop: spacing.md,
  },

  // List container for requests/members
  listContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },

  // See more text
  seeMoreButton: {
    alignSelf: 'flex-start', // hug the text so the press-scale is tight, not full-width
    marginTop: 2,
  },
  seeMoreText: {
    fontSize: 15,
    fontFamily: typography.fontFamilyMedium,
    color: colors.iconColor,
    lineHeight: 20,
    letterSpacing: -0.3,
  },

  // Empty state text
  emptyStateText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    textAlign: 'center',
    paddingVertical: spacing.lg,
    letterSpacing: -0.3,
  },

  // Secondary CTA button (for host)
  ctaButtonSecondary: {
    backgroundColor: colors.secondaryButtonBackground,
  },
  ctaLabelSecondary: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.5,
    textAlign: 'center',
  },

  // 1:1 event request row styles
  requestInfo: {
    flex: 1,
  },
  requesterName: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.5,
  },
  requestMessagePreview: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});

export default styles;
