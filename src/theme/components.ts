export const componentTokens = {
  button: {
    height: 52,
    radius: 26,
    paddingHorizontal: 32,
  },
  input: {
    height: 52,
    radius: 16,
    pillRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  checkbox: {
    size: 18,
    radius: 6,
    tickSize: 15,
  },
  iconButton: {
    sm: 32,
    md: 44,
    iconSm: 18,
    iconMd: 24,
    compactHitSlop: 18,
  },
  avatar: {
    sm: 32,
    md: 40,
    lg: 52,
  },
  overlay: {
    backdrop: 'rgba(0, 0, 0, 0.4)',
    closeButtonBackground: 'rgba(120, 120, 128, 0.16)',
    // Dark tint layered over the Android hero-button blur, which renders
    // lighter than the iOS dark material.
    heroButtonTint: 'rgba(0, 0, 0, 0.28)',
    destructiveProgressFill: 'rgba(0, 0, 0, 0.18)',
    // Foreground notification banner: dark material over the blur plus a
    // hairline edge so the card separates from light screens.
    bannerTint: 'rgba(16, 17, 20, 0.74)',
    bannerBorder: 'rgba(255, 255, 255, 0.12)',
  },
  countBadge: {
    size: 28,
    paddingHorizontal: 8,
    fontSize: 13,
  },
  segmentedControl: {
    gap: 5,
    tabGap: 4,
    tabPaddingVertical: 8,
    tabPaddingHorizontal: 10,
  },
  banner: {
    // Foreground in-app notification banner (NotificationBanner).
    holdMs: 4000,
    avatarSize: 44,
    topOffset: 6,
    horizontalMargin: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
    blurIntensity: 70,
  },
  eventList: {
    itemSeparatorHeight: 14,
    sectionSeparatorHeight: 22,
    topPadding: 24,
  },
} as const;
