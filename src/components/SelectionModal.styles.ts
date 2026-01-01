import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.createOverlay,
        justifyContent: "flex-end",
        paddingHorizontal: spacing.lg,
    },
    content: {
        backgroundColor: colors.card,
        borderRadius: 34,
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
        marginBottom: spacing.lg,
        // box-shadow: 0px 3px 56px 0px #00000033
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 56,
        elevation: 10,
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
        gap: 6,
        marginBottom: spacing.lg,
    },
    chip: {
        paddingHorizontal: 10,
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
