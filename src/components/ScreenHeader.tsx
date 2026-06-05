import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import ChevronLeftIcon from "@assets/ui/chevron-left.svg";
import { colors, typography } from "@theme/index";

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
    <View style={styles.titleContainer} pointerEvents="none">
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    marginLeft: -8,
  },
  titleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: -0.4,
  },
});

export default ScreenHeader;
