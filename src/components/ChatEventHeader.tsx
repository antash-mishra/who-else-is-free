import { ReactNode } from "react";
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing, typography } from "@theme/index";
import ChevronLeftIcon from "@assets/ui/chevron-left.svg";

interface ChatEventHeaderProps {
  onBack: () => void;
  title: string;
  subtitle?: string;
  coverUri?: string | null;
  coverSource?: ImageSourcePropType;
  leadingElement?: ReactNode;
  onTitlePress?: () => void;
  titleAccessibilityLabel?: string;
  rightElement?: ReactNode;
  testID?: string;
}

const ChatEventHeader = ({
  onBack,
  title,
  subtitle,
  coverUri,
  coverSource,
  leadingElement,
  onTitlePress,
  titleAccessibilityLabel,
  rightElement,
  testID,
}: ChatEventHeaderProps) => {
  const hasCover = coverSource != null || (coverUri != null && coverUri !== "");

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={onBack}
        style={styles.backButton}
        hitSlop={8}
      >
        <ChevronLeftIcon width={24} height={24} color={colors.text} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.titlePressable, pressed && { opacity: 0.7 }]}
        onPress={onTitlePress}
        accessibilityRole={onTitlePress ? "button" : undefined}
        accessibilityLabel={titleAccessibilityLabel ?? "View event details"}
        testID={testID}
      >
        {leadingElement ?? (hasCover ? (
          <Image
            source={coverSource ?? { uri: coverUri! }}
            style={styles.coverImage}
          />
        ) : null)}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {rightElement ?? null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  backButton: {
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  titlePressable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
  },
  coverImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    fontWeight: "500",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#000000",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
    marginTop: 2,
  },
});

export default ChatEventHeader;
