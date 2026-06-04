import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import ChevronLeftIcon from "@assets/ui/chevron-left.svg";
import { colors, spacing, typography } from "@theme/index";

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
}

const ScreenHeader = ({ title, onBack }: ScreenHeaderProps) => (
  <View style={styles.header}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onBack();
      }}
      hitSlop={12}
    >
      <ChevronLeftIcon width={24} height={24} color={colors.text} />
    </Pressable>
    <Text style={styles.title} numberOfLines={1} pointerEvents="none">{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
    marginLeft: -8,
  },
  title: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: -0.4,
  },
});

export default ScreenHeader;
