import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_HEIGHT = 220;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ITEM_HEIGHT) / 2; // 88

const styles = StyleSheet.create({
    // ── Picker container ──────────────────────────────────────────────
    pickerContainer: {
        position: "relative",
        marginBottom: spacing.md,
    },

    // ── Selection indicator (two thin lines around centre row) ────────
    selectionIndicator: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        zIndex: 2,
    },
    selectionLine: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(0, 0, 0, 0.15)",
        marginHorizontal: spacing.xs,
    },
    selectionSpacer: {
        height: WHEEL_ITEM_HEIGHT,
    },

    // ── Wheel row ─────────────────────────────────────────────────────
    wheelRow: {
        height: WHEEL_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        zIndex: 1,
    },
    wheelPlaceholder: {
        height: WHEEL_HEIGHT,
    },
    wheelColumn: {
        height: WHEEL_HEIGHT,
    },
    dateWheelColumn: {
        width: 148,
    },
    timeWheelColumn: {
        width: 44,
    },
    amPmWheelColumn: {
        width: 44,
    },
    wheelContentContainer: {
        paddingVertical: WHEEL_PADDING,
    },
    wheelItem: {
        height: WHEEL_ITEM_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
    },
    wheelText: {
        fontSize: 18,
        fontFamily: typography.fontFamilyMedium,
        color: "rgba(0, 0, 0, 0.3)",
        lineHeight: WHEEL_ITEM_HEIGHT,
        textAlign: "center",
        letterSpacing: -0.4,
    },
wheelTextSelected: {
        color: "#1C1C1E",
        fontFamily: typography.fontFamilyMedium,
    },
    timeSeparator: {
        fontSize: 18,
        fontFamily: typography.fontFamilyMedium,
        color: "#1C1C1E",
        marginHorizontal: 2,
    },

    // ── Fade gradients ────────────────────────────────────────────────
    fadeTop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: WHEEL_PADDING,
        zIndex: 3,
    },
    fadeBottom: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: WHEEL_PADDING,
        zIndex: 3,
    },

    // ── Confirm button ────────────────────────────────────────────────
    confirmButton: {
        backgroundColor: colors.primary,
        borderRadius: 999,
        borderCurve: "continuous",
        height: 52,
        alignItems: "center",
        justifyContent: "center",
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
