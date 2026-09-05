import { StyleSheet } from 'react-native';

import { colors, componentTokens, layout, radii, shadows, typography } from '@theme/index';

const { avatarSize } = componentTokens.banner;

export const notificationBannerStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: layout.bannerZIndex,
    paddingHorizontal: componentTokens.banner.horizontalMargin,
  },
  // Dark frosted card, the same material as EventActionBadge and the Event
  // Details hero buttons, so it reads as a transient overlay on light screens.
  card: {
    borderRadius: radii.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: componentTokens.overlay.bannerBorder,
    ...shadows.floating,
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: componentTokens.overlay.bannerTint,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: componentTokens.banner.paddingVertical,
    paddingHorizontal: componentTokens.banner.paddingHorizontal,
    gap: componentTokens.banner.gap,
  },
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: avatarSize / 2,
    overflow: 'hidden',
    backgroundColor: colors.avatarOverflowBadge,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.selectedTextOnDark,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.3,
    fontFamily: typography.fontFamilySemiBold,
  },
  context: {
    color: colors.selectedTextMutedOnDark,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.2,
  },
  kind: {
    flexShrink: 0,
    color: colors.selectedTextMutedOnDark,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: typography.fontFamilyMedium,
  },
  body: {
    color: colors.selectedTextOnDark,
    opacity: 0.92,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.2,
    fontFamily: typography.fontFamilyRegular,
  },
});
