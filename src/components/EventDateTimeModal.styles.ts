import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
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
