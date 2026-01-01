import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.createOverlay,
        justifyContent: "flex-end",
        alignItems: "center",
    },
    content: {
        backgroundColor: colors.card,
        borderRadius: 24,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.xl,
        width: "100%",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacing.md,
    },
    title: {
        fontSize: 20,
        fontFamily: typography.fontFamilySemiBold,
        color: "rgba(0, 0, 0, 1)",
        lineHeight: 24,
        letterSpacing: -0.5,
        textAlign: "center",
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 80,
        backgroundColor: "rgba(120, 120, 128, 0.16)",
        justifyContent: "center",
        alignItems: "center",
    },
    chipsContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    chip: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E6E6E6",
        backgroundColor: "transparent",
    },
    chipSelected: {
        backgroundColor: "rgba(0, 0, 0, 1)",
        borderColor: "rgba(0, 0, 0, 1)",
    },
    chipText: {
        fontSize: 15,
        fontFamily: typography.fontFamilyMedium,
        color: "#494949",
        lineHeight: 20,
        letterSpacing: -0.3,
    },
    chipTextSelected: {
        color: "#FFFFFF",
    },
    selectButton: {
        backgroundColor: colors.primary,
        borderRadius: 999,
        paddingVertical: spacing.md,
        alignItems: "center",
    },
    selectButtonText: {
        color: colors.buttonText,
        fontSize: 17,
        fontFamily: typography.fontFamilyMedium,
        lineHeight: 24,
        letterSpacing: -0.5,
        textAlign: "center",
    },
});

export default styles;
