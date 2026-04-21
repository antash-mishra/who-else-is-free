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
    optionRing: {
        flex: 1,
        minWidth: 0,
        borderRadius: 16,
        borderCurve: "continuous",
        padding: 2.5,
        backgroundColor: "transparent",
    },
    optionRingSelected: {
        backgroundColor: "rgba(0, 0, 0, 0.15)",
    },
    option: {
        flex: 1,
        borderRadius: 13,
        borderCurve: "continuous",
        padding: 2,
        backgroundColor: "#FFFFFF",
        overflow: "hidden",
    },
    optionSelected: {},
    optionImageWrapper: {
        borderRadius: 11,
        borderCurve: "continuous",
        overflow: "hidden",
    },
    optionImage: {
        width: "100%",
        height: 140,
    },
    checkBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        padding: 6,
        borderRadius: 999,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
});

export default styles;
