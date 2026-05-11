import { StyleSheet } from "react-native";

import { colors, spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xl,
    },

    // Search Bar — prominent, premium feel
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F5F5F7",
        borderRadius: 16,
        borderCurve: "continuous",
        paddingHorizontal: spacing.md,
        paddingVertical: 14,
        marginBottom: spacing.lg,
        gap: spacing.sm,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    searchInput: {
        flex: 1,
        fontSize: 17,
        fontFamily: typography.fontFamilyRegular,
        color: "#1C1C1E",
        lineHeight: 22,
        padding: 0,
        letterSpacing: -0.3,
    },
    clearButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#C7C7CC",
        justifyContent: "center",
        alignItems: "center",
    },

    // Section label
    sectionLabel: {
        fontSize: 13,
        fontFamily: typography.fontFamilySemiBold,
        color: "#8E8E93",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: spacing.sm,
        marginLeft: 4,
    },

    // Result Row — card-like with icon
    resultRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderCurve: "continuous",
        marginBottom: 8,
        gap: 12,
        backgroundColor: "#F5F5F7",
    },
    resultRowPressed: {
        backgroundColor: "#E5E5EA",
        transform: [{ scale: 0.98 }],
    },
    resultIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: "#E5E5EA",
        justifyContent: "center",
        alignItems: "center",
    },
    resultTextContainer: {
        flex: 1,
        gap: 2,
    },
    resultMainText: {
        fontSize: 16,
        fontFamily: typography.fontFamilySemiBold,
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

    // Manual Entry — prominent button-like card
    manualEntryCard: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderCurve: "continuous",
        borderWidth: 1.5,
        borderColor: "#E5E5EA",
        borderStyle: "dashed",
        marginTop: spacing.sm,
        gap: spacing.md,
    },
    manualEntryIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderCurve: "continuous",
        backgroundColor: "#F5F5F7",
        justifyContent: "center",
        alignItems: "center",
    },
    manualEntryTextContainer: {
        flex: 1,
        gap: 2,
    },
    manualEntryText: {
        fontSize: 16,
        fontFamily: typography.fontFamilySemiBold,
        color: "#1C1C1E",
        letterSpacing: -0.3,
        lineHeight: 22,
    },
    manualEntrySubtext: {
        fontSize: 14,
        fontFamily: typography.fontFamilyRegular,
        color: "#8E8E93",
        letterSpacing: -0.2,
        lineHeight: 18,
    },
});

export default styles;
