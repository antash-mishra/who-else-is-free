import { Platform, StyleSheet } from 'react-native';

import { colors, spacing, typography } from '@theme/index';

const styles = StyleSheet.create({
  // ┌─────────────────────────────────────────────────────────────┐
  // │ 1. SCREEN SHELL                                            │
  // │    Outermost layers: root, background image, dark overlay  │
  // └─────────────────────────────────────────────────────────────┘

  // Fullscreen wrapper
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // Blurred cover photo behind everything
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  // Semi-transparent dark overlay on top of background image
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  // Safe area (respects notch/status bar)
  safeArea: {
    flex: 1,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 2. HEADER — "Create Event" title + ✕ dismiss button        │
  // │    Fixed at top, outside the scroll view                   │
  // └─────────────────────────────────────────────────────────────┘

  // Row: centers title, positions dismiss button absolutely right
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: 12,
  },
  // Invisible spacer on the left, same width as dismissButton, to keep title truly centered
  headerSpacer: {
    width: 40,
  },
  // "Create Event" text
  pageTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.card,
    lineHeight: typography.header,
    letterSpacing: -0.3,
  },
  // ✕ close button (top-right corner)
  dismissButton: {
    width: 40,
    alignItems: 'flex-end',
    padding: spacing.sm,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 3. SCROLLABLE CONTENT AREA                                 │
  // │    Wraps everything below the header                       │
  // └─────────────────────────────────────────────────────────────┘

  // Horizontal padding for the scroll area
  overlay: {
    flex: 1,
    paddingTop: 0,
    paddingHorizontal: spacing.lg,
  },
  contentWrapper: {
    flex: 1,
  },
  formScroll: {
    flex: 1,
  },
  // Inner content container of the scroll view
  content: {
    paddingBottom: 0,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 4. COVER IMAGE CARD                                        │
  // │    Square card with event cover + upload icon chip          │
  // └─────────────────────────────────────────────────────────────┘

  // Outer card container
  coverCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.createCardBackground,
    width: 180,
    height: 180,
    aspectRatio: 1,
    alignSelf: 'center',
    justifyContent: 'flex-end',
    alignItems: 'center',
    position: 'relative',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    // Match iOS: the cover sits flush on Android rather than gaining an
    // Android-only elevation shadow behind its rounded edges.
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.text,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        }
      : {}),
  },
  // Cover photo (fills the card)
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
  },
  // Upload icon badge (bottom-right of cover card)
  coverChip: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    padding: spacing.sm,
    borderRadius: 999,
    overflow: 'hidden',
    // Faint dark tint over the (lighter) blur so the white icon keeps contrast
    // on bright covers.
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 5. SHARED: FIELD CARD                                      │
  // │    Rounded card that wraps each form section                │
  // │    Used by: Event Name + Description,                      │
  // │             Group Type,                                     │
  // │             Gender + Age,                                   │
  // │             Date + Location                                 │
  // └─────────────────────────────────────────────────────────────┘

  // Outer layer: white 19%
  fieldCard: {
    backgroundColor: colors.createFieldCardBackground,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderLeftWidth: 1,
    borderColor: colors.createFieldCardBorder,
    marginBottom: spacing.sm,
  },
  // Inner layer: black 4% (carries the padding)
  fieldCardInner: {
    backgroundColor: colors.createFieldCardInnerBackground,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingLeft: 10,
    paddingRight: 6,
  },
  // Horizontal line between fields within the same card
  // (Event Name / Description, Gender / Age, Date / Location)
  fieldDivider: {
    height: 1,
    backgroundColor: colors.createFieldDivider,
    marginLeft: -10,
    marginRight: -6,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 6. EVENT NAME — text input (top of first fieldCard)        │
  // │    Single-line, "Done" dismisses keyboard                  │
  // └─────────────────────────────────────────────────────────────┘
  // ┌─────────────────────────────────────────────────────────────┐
  // │ 7. DESCRIPTION — text input (bottom of first fieldCard)    │
  // │    Multiline, expands vertically as text grows             │
  // └─────────────────────────────────────────────────────────────┘
  // Both Event Name and Description share this base style
  textInput: {
    fontSize: 18,
    fontFamily: typography.fontFamilyMedium,
    color: 'rgba(255, 255, 255, 1)',
    letterSpacing: typography.inputDetailLetterSpacing,
    lineHeight: 22,
    paddingVertical: 12,
    paddingRight: 10,
  },
  // Description is now a tappable preview row that opens the editor sheet
  // (not an inline input), so it matches the other option rows.
  descriptionRow: {
    paddingVertical: 13,
    paddingRight: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  descriptionValue: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: 'rgba(255, 255, 255, 0.9)', // softened body without thinning the strokes
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  // Empty state matches the old "Description" placeholder look (Medium/17/faint).
  descriptionPlaceholder: {
    fontSize: 16, // match the field labels (Gender / Age) — 16 Medium faint
    fontFamily: typography.fontFamilyMedium,
    color: colors.createTextFaint,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 8. SHARED: FIELD ROW                                       │
  // │    Horizontal row with label on left + value pill on right  │
  // │    Used by: Group Type, Gender, Age, Date, Location        │
  // └─────────────────────────────────────────────────────────────┘

  // Row container
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 46,
  },
  // Left-side label text ("Group Type", "Gender", "Age", etc.)
  fieldLabel: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    color: colors.createTextFaint,
    lineHeight: typography.lineHeight,
    letterSpacing: -0.3,
  },
  // Right-side pill showing current value ("Single", "Any", etc.)
  fieldValuePill: {
    paddingHorizontal: 10,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: colors.createFieldValuePillBackground,
    borderWidth: 1,
    borderColor: colors.createFieldCardBorder,
  },
  // Text inside the value pill
  fieldValueText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: typography.lineHeight,
    color: colors.createTextPrimary,
    letterSpacing: -0.3,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 9. GROUP TYPE — single fieldRow in its own fieldCard        │
  // │    Uses: fieldCard > fieldRow + fieldLabel + fieldValuePill │
  // │    No extra styles needed                                  │
  // └─────────────────────────────────────────────────────────────┘

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 10. GENDER — top fieldRow in Gender + Age fieldCard         │
  // │     Uses: fieldRow + fieldLabel + fieldValuePill            │
  // │     No extra styles needed                                 │
  // └─────────────────────────────────────────────────────────────┘

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 11. AGE — bottom fieldRow in Gender + Age fieldCard         │
  // │     Uses: fieldRow + fieldLabel + fieldValuePill            │
  // │     No extra styles needed                                 │
  // └─────────────────────────────────────────────────────────────┘

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 12. DATE & TIME — top row of Date + Location fieldCard     │
  // │     Row: "Date & Time" label + current date-time pill      │
  // └─────────────────────────────────────────────────────────────┘

  // Extra gap between label and date/time controls
  dateRow: {
    gap: spacing.md,
  },
  dateTimeValuePill: {
    flexShrink: 1,
    maxWidth: '72%',
  },
  dateTimeValueText: {},

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 13. LOCATION — bottom row of Date + Location fieldCard     │
  // │     Row: "Location" label + search text input              │
  // └─────────────────────────────────────────────────────────────┘

  // Extra alignment + gap for location row
  locationRow: {
    alignItems: 'center',
    gap: spacing.md,
  },
  // Location text input (extends textInput + compactInput)
  locationInput: {
    flex: 0.7,
    paddingLeft: 11,
    paddingRight: 11,
    lineHeight: 20,
    paddingTop: 7,
    paddingBottom: 7,
    textAlignVertical: 'center',
  },
  // Compact search-style input (used by Location)
  compactInput: {
    backgroundColor: colors.createChipBackground,
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    height: 36,
    fontSize: typography.body,
  },
  locationValuePill: {
    flexShrink: 1,
    maxWidth: '65%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
  },
  locationPlaceholder: {
    color: colors.createTextPlaceholder,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 14. SPACER — flexible gap pushing footer to bottom         │
  // └─────────────────────────────────────────────────────────────┘

  spacer: {
    flexGrow: 1,
    minHeight: spacing.xs,
  },

  // ┌─────────────────────────────────────────────────────────────┐
  // │ 15. FOOTER — error message + "Create Event" button         │
  // │     Pinned to bottom of scroll content                     │
  // └─────────────────────────────────────────────────────────────┘

  // Footer wrapper
  footer: {
    paddingTop: spacing.sm,
    position: 'relative',
  },
  // Error row
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  // Error message text
  errorText: {
    color: colors.createErrorText,
    fontSize: 14,
    fontFamily: typography.fontFamilyMedium,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  // "Create Event" / "Update Event" / "Sign Up or Log In" button
  primaryButton: {
    // Frosted glass: translucent white fill over a BlurView (see CreateEventSubmitButton).
    // overflow clips the blur to the pill; hairline border defines the edge.
    backgroundColor: colors.createButtonGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.createButtonGlassBorder,
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  // Dimmed state while submitting
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  // Button label text
  primaryButtonText: {
    color: colors.createButtonText,
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
});

export default styles;
