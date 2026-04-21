import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
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
        borderCurve: "continuous",
        overflow: "hidden",
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
        borderCurve: "continuous",
        height: 52,
        alignItems: "center",
        justifyContent: "center",
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
