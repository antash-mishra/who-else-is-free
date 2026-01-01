import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: colors.createOverlay,
        justifyContent: "flex-end",
    },
    content: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        width: "100%",
        gap: spacing.md,
        maxHeight: "80%",
        minHeight: "55%",
    },
    header: {
        gap: spacing.xs,
        marginBottom: spacing.sm,
    },
    title: {
        fontSize: typography.subtitle,
        fontFamily: typography.fontFamilySemiBold,
        color: colors.text,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
    },
    subtitle: {
        fontSize: typography.caption,
        fontFamily: typography.fontFamilyMedium,
        color: colors.cardMeta,
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
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
    footer: {
        height: spacing.md,
    },
});

export default styles;
