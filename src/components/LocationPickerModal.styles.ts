import { StyleSheet } from "react-native";

import { spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    container: {
    },

    // Search Bar — prominent, premium feel
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        borderRadius: 16,
        borderCurve: "continuous",
        paddingHorizontal: spacing.md,
        paddingVertical: 11,
        marginBottom: 0,
        gap: spacing.sm,
    },
    searchInput: {
        flex: 1,
        backgroundColor: "transparent",
        fontSize: 17,
        fontFamily: typography.fontFamilyRegular,
        color: "#1C1C1E",
        padding: 0,
        letterSpacing: -0.3,
    },
    resultsList: {
        flex: 1,
    },
    resultsContent: {
        flexGrow: 1,
        paddingBottom: 30,
    },
    resultsContentCentered: {
        justifyContent: "center",
    },

    // Result Row
    resultRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 15,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E5E5EA",
        gap: spacing.sm,
    },
    resultRowPressed: {
        opacity: 0.7,
    },
    resultTextContainer: {
        flex: 1,
        gap: 2,
    },
    resultMainText: {
        fontSize: 16,
        fontFamily: typography.fontFamilyMedium,
        color: "#1C1C1E",
        lineHeight: 22,
        letterSpacing: -0.3,
    },
    resultSecondaryText: {
        fontSize: 14,
        fontFamily: typography.fontFamilyRegular,
        color: "#8E8E93",
        lineHeight: 18,
        letterSpacing: -0.2,
    },

    // Loading State
    loadingContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.xl * 1.5,
        gap: spacing.md,
    },
    loadingText: {
        fontSize: 15,
        fontFamily: typography.fontFamilyMedium,
        color: "#8E8E93",
        letterSpacing: -0.2,
    },

    // Empty State
    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.xl * 1.5,
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontFamily: typography.fontFamilySemiBold,
        color: "#1C1C1E",
        textAlign: "center",
        letterSpacing: -0.3,
        lineHeight: 24,
    },
    emptyStateText: {
        fontSize: 15,
        fontFamily: typography.fontFamilyRegular,
        color: "#8E8E93",
        textAlign: "center",
        lineHeight: 20,
        letterSpacing: -0.2,
    },

    // Inline Hint (searching / typing / empty)
    inlineLoadingContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: spacing.md,
        paddingHorizontal: 4,
        gap: spacing.sm,
    },
    inlineHint: {
        fontSize: 15,
        fontFamily: typography.fontFamilyMedium,
        color: "#8E8E93",
        paddingTop: spacing.md,
        paddingHorizontal: 4,
        letterSpacing: -0.2,
    },
    inlineHintNopad: {
        fontSize: 15,
        fontFamily: typography.fontFamilyMedium,
        color: "#8E8E93",
        letterSpacing: -0.2,
    },

    // Error State
    errorContainer: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
        gap: spacing.sm,
    },
    errorText: {
        fontSize: 15,
        fontFamily: typography.fontFamilyMedium,
        color: "#FF3B30",
        textAlign: "center",
        lineHeight: 20,
    },
    errorRetryText: {
        fontSize: 14,
        fontFamily: typography.fontFamilyRegular,
        color: "#8E8E93",
        textAlign: "center",
    },
});

export default styles;
