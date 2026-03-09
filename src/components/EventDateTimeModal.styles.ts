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
        borderRadius: 34,
        backgroundColor: colors.card,
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
        fontSize: 20,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.text,
        lineHeight: 24,
        letterSpacing: -0.5,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 80,
        backgroundColor: "rgba(120, 120, 128, 0.16)",
        alignItems: "center",
        justifyContent: "center",
    },
    selectedValue: {
        fontSize: typography.body,
        fontFamily: typography.fontFamilyMedium,
        color: "#595858",
        marginBottom: spacing.md,
        letterSpacing: -0.3,
    },
    pickerContainer: {
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "transparent",
        marginBottom: spacing.md,
        paddingHorizontal: spacing.xs,
    },
    wheelRow: {
        position: "relative",
        zIndex: 2,
        height: 220,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
    },
    wheelColumn: {
        height: 220,
        borderRadius: 10,
        backgroundColor: "transparent",
    },
    dateWheelColumn: {
        width: 170,
    },
    timeWheelColumn: {
        width: 56,
    },
    wheelContentContainer: {
        paddingVertical: 88,
    },
    wheelItem: {
        height: 44,
        alignItems: "center",
        justifyContent: "center",
    },
    wheelText: {
        fontSize: 18,
        fontFamily: typography.fontFamilyRegular,
        color: "#A0A0A0",
        lineHeight: 44,
        textAlign: "center",
        letterSpacing: typography.letterSpacing,
    },
    dateWheelText: {
        fontSize: 16,
    },
    wheelTextSelected: {
        fontSize: 20,
        fontFamily: typography.fontFamilySemiBold,
        color: "#000000",
        lineHeight: 44,
    },
    timeSeparator: {
        marginHorizontal: spacing.xs,
        fontSize: 26,
        fontFamily: typography.fontFamilySemiBold,
        color: "#707070",
    },
    selectionOverlay: {
        position: "absolute",
        zIndex: 1,
        left: spacing.xs,
        right: spacing.xs,
        top: 88,
        height: 44,
        borderRadius: 12,
        backgroundColor: "rgba(240, 240, 240, 0.45)",
    },
    confirmButton: {
        backgroundColor: colors.primary,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.md,
    },
    confirmButtonText: {
        fontSize: 17,
        lineHeight: 24,
        fontFamily: typography.fontFamilyMedium,
        color: colors.buttonText,
        letterSpacing: -0.5,
    },
});

export default styles;
