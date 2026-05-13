import { StyleSheet } from "react-native";

import { spacing, typography } from "@theme/index";

const styles = StyleSheet.create({
    backdrop: {
        backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
    sheet: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderCurve: "continuous",
        paddingHorizontal: spacing.md,
        paddingTop: spacing.md,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 12,
        overflow: "hidden",
    },
    keyboardContent: {
        flexShrink: 1,
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
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 80,
        backgroundColor: "rgba(120, 120, 128, 0.16)",
        justifyContent: "center",
        alignItems: "center",
    },
});

export default styles;
