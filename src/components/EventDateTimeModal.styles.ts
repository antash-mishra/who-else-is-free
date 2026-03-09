import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.createOverlay,
        justifyContent: "flex-end",
        paddingHorizontal: spacing.lg,
    },
    container: {
        borderRadius: 28,
        backgroundColor: "rgba(15, 21, 42, 0.96)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        paddingTop: spacing.md,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.lg,
        marginBottom: spacing.lg,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 12,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.md,
    },
    title: {
        fontSize: 26,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.createTextPrimary,
        letterSpacing: typography.letterSpacing,
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(255,255,255,0.16)",
        alignItems: "center",
        justifyContent: "center",
    },
    selectedValue: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextMuted,
        marginBottom: spacing.md,
        letterSpacing: typography.letterSpacing,
    },
    iosPicker: {
        marginHorizontal: -spacing.md,
        marginBottom: spacing.md,
    },
    androidActions: {
        marginBottom: spacing.md,
        gap: spacing.sm,
    },
    androidActionRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "rgba(255,255,255,0.12)",
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    androidActionLabel: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyRegular,
        color: colors.createTextPrimary,
        letterSpacing: typography.letterSpacing,
    },
    androidActionValue: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextMuted,
        letterSpacing: typography.letterSpacing,
    },
    androidActionButton: {
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.2)",
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    androidActionButtonText: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createTextPrimary,
    },
    confirmButton: {
        backgroundColor: colors.createButtonBackground,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.md,
    },
    confirmButtonText: {
        fontSize: 17,
        lineHeight: 24,
        fontFamily: typography.fontFamilyMedium,
        color: colors.createButtonText,
        letterSpacing: typography.letterSpacing,
    },
});

export default styles;
