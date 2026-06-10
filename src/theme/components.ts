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
  },
  avatar: {
    sm: 32,
    md: 40,
    lg: 52,
  },
  overlay: {
    backdrop: 'rgba(0, 0, 0, 0.4)',
    closeButtonBackground: 'rgba(120, 120, 128, 0.16)',
    destructiveProgressFill: 'rgba(0, 0, 0, 0.18)',
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
  eventList: {
    itemSeparatorHeight: 14,
    sectionSeparatorHeight: 22,
    topPadding: 24,
  },
} as const;
