import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "transparent",
    },
    safeArea: {
        flex: 1,
    },
    backgroundImage: {
        ...StyleSheet.absoluteFillObject,
    },
    backgroundOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
    },
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
    content: {
        paddingBottom: spacing.lg,
    },
    footer: {
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
        position: "relative",
    },
    spacer: {
        flexGrow: 1,
        minHeight: spacing.md,
    },
    headerRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingTop: spacing.sm,
        paddingBottom: spacing.sm,
        position: "relative",
    },
    pageTitle: {
        fontSize: typography.header,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.card,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    dismissButton: {
        position: "absolute",
        right: 0,
        padding: spacing.sm,
    },
    coverCard: {
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.createCardBackground,
        width: "65%",
        aspectRatio: 1,
        alignSelf: "center",
        justifyContent: "flex-end",
        alignItems: "center",
        position: "relative",
        marginBottom: spacing.md,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
    coverImage: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        resizeMode: "cover",
    },
    coverChip: {
        position: "absolute",
        bottom: spacing.sm,
        right: spacing.sm,
        padding: spacing.sm,
        borderRadius: 999,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1,
    },
    fieldCard: {
        // Layered gradient: rgba(255,255,255,0.19) on rgba(0,0,0,0.04)
        backgroundColor: "rgba(255, 255, 255, 0.19)",
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        // Border: 1px top, 1px right, 0px bottom, 1px left
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 0,
        borderLeftWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.04)",
    },
    fieldDivider: {
        height: 1,
        backgroundColor: "rgba(255, 255, 255, 0.1)",
        marginVertical: spacing.xs,
        // Extend to full width by negating parent's horizontal padding
        marginHorizontal: -spacing.md,
    },
    textInput: {
        fontSize: 17,
        fontFamily: typography.fontFamilyMedium,
        color: "rgba(255, 255, 255, 0.78)",
        letterSpacing: typography.letterSpacing,
    },
    compactInput: {
        backgroundColor: colors.createChipBackground,
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        fontSize: typography.body,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    fieldLabel: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextLabel,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    fieldValuePill: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: 8,
        // Layered gradient effect: rgba(0,0,0,0.04) on rgba(255,255,255,0.24)
        backgroundColor: "rgba(255, 255, 255, 0.24)",
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.04)",
    },
    fieldValueText: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    dateRow: {
        gap: spacing.md,
    },
    dateTimeContainer: {
        flexDirection: "row",
        gap: spacing.sm,
    },
    timeInlineContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: 10,
        backgroundColor: colors.createChipBackground,
        borderWidth: 1,
        borderColor: colors.createCardBorder,
    },
    locationRow: {
        alignItems: "center",
        gap: spacing.md,
    },
    locationInput: {
        flex: 1,
        textAlignVertical: "center",
    },
    timeInputInline: {
        width: 32,
        height: 26,
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        textAlign: "center",
        padding: 0,
    },
    timeSeparatorInline: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
        marginHorizontal: spacing.xs,
    },
    errorContainer: {
        position: "absolute",
        top: spacing.xs,
        left: 0,
        right: 0,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
    },
    errorText: {
        color: "#FF9C9C",
        fontSize: 16,
        fontFamily: typography.fontFamilyMedium,
        lineHeight: 24,
        letterSpacing: -0.5,
    },
    primaryButton: {
        backgroundColor: colors.createButtonBackground,
        borderRadius: 999,
        paddingVertical: spacing.md,
        alignItems: "center",
        width: "100%",
    },
    primaryButtonDisabled: {
        opacity: 0.7,
    },
    primaryButtonText: {
        color: colors.createButtonText,
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilySemiBold,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
});

export default styles;
