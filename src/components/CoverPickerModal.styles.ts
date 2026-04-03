import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    subtitle: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.cardMeta,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
        marginBottom: spacing.sm,
    },
    grid: {
        paddingBottom: spacing.sm,
    },
    column: {
        justifyContent: "space-between",
        columnGap: spacing.sm,
        marginBottom: spacing.sm,
    },
    option: {
        flex: 1,
        minWidth: 0,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: colors.createCardBorder,
        overflow: "hidden",
        backgroundColor: colors.createCardBackground,
    },
    optionSelected: {
        borderColor: colors.primary,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 4,
    },
    optionImage: {
        width: "100%",
        height: 140,
        resizeMode: "cover",
    },
});

export default styles;
