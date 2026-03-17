import { StyleSheet } from "react-native";

import { colors, spacing } from "@theme/index";

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
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 56,
        elevation: 10,
    },
});

export default styles;
