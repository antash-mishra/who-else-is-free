import { StyleSheet } from "react-native";

import { colors, radii, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        borderRadius: radii.pill,
        borderCurve: "continuous",
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    searchInput: {
        flex: 1,
        backgroundColor: "transparent",
        fontSize: 17,
        fontFamily: typography.fontFamilyRegular,
        color: colors.text,
        padding: 0,
        letterSpacing: -0.3,
    },
    chipsRow: {
        flexGrow: 0,
        marginBottom: spacing.sm,
    },
    chipsContent: {
        gap: spacing.xs,
        paddingRight: spacing.md,
    },
    chip: {
        borderRadius: radii.sm,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.sm,
        paddingVertical: 6,
        backgroundColor: colors.background,
    },
    chipActive: {
        backgroundColor: colors.text,
        borderColor: colors.text,
    },
    chipLabel: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.text,
    },
    chipLabelActive: {
        color: colors.background,
    },
    grid: {
        paddingBottom: spacing.sm,
    },
    column: {
        columnGap: spacing.xs,
        marginBottom: spacing.xs,
    },
    optionRing: {
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        borderCurve: "continuous",
        padding: 2,
        backgroundColor: "transparent",
    },
    optionRingSelected: {
        backgroundColor: colors.text,
    },
    option: {
        flex: 1,
        borderRadius: 12,
        borderCurve: "continuous",
        padding: 1.5,
        backgroundColor: colors.background,
        overflow: "hidden",
    },
    optionImageWrapper: {
        borderRadius: 10,
        borderCurve: "continuous",
        overflow: "hidden",
    },
    optionImage: {
        width: "100%",
        aspectRatio: 1.45,
    },
    checkBadge: {
        position: "absolute",
        top: 6,
        right: 6,
        padding: 6,
        borderRadius: radii.pill,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
});

export default styles;
