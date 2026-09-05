export const layout = {
  screenHorizontalPadding: 16,
  headerHeight: 44,
  bottomTabHeight: 72,
  sheetZIndex: 40,
  // Foreground notification banner sits above sheets and floating headers.
  bannerZIndex: 50,
  hitSlop: {
    sm: 8,
    md: 12,
    lg: 16,
  },
} as const;
