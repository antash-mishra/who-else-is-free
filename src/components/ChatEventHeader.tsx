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
import ScalePressable from "@components/ScalePressable";

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

  // Split "Plan name, 23 Jul Thu" on the first comma so the comma can be
  // rendered as a small dot separator (a filled circle) instead of a comma.
  const subtitleSepIndex = subtitle ? subtitle.indexOf(", ") : -1;
  const subtitleLeft = subtitleSepIndex >= 0 ? subtitle!.slice(0, subtitleSepIndex) : null;
  const subtitleRight = subtitleSepIndex >= 0 ? subtitle!.slice(subtitleSepIndex + 2) : null;

  const titleInner = (
    <>
      {leadingElement ?? (hasCover ? (
        <Image source={coverSource ?? { uri: coverUri! }} style={styles.coverImage} />
      ) : null)}
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          subtitleLeft != null && subtitleRight != null ? (
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitleInline} numberOfLines={1}>
                {subtitleLeft}
              </Text>
              <View style={styles.subtitleDot} />
              <Text style={[styles.subtitleInline, styles.subtitleRight]} numberOfLines={1}>
                {subtitleRight}
              </Text>
            </View>
          ) : (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )
        ) : null}
      </View>
    </>
  );

  // Tappable header (opens event/member details) scales like the chat rows;
  // otherwise it's a plain, non-interactive block.
  const titleContent = onTitlePress ? (
    // flex/row layout must be on the OUTER Pressable (pressableStyle) so the
    // header expands; the inner Animated.View (style) fills it and lays out the row.
    <ScalePressable
      pressableStyle={styles.titlePressable}
      style={styles.titlePressableInner}
      onPress={onTitlePress}
      accessibilityLabel={titleAccessibilityLabel ?? "View plan details"}
      testID={testID}
    >
      {titleInner}
    </ScalePressable>
  ) : (
    <View style={styles.titlePressable} testID={testID}>
      {titleInner}
    </View>
  );

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
      {titleContent}
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
    // Full-bleed bottom divider (matches the shared row separator). Negative
    // horizontal margin extends the line to the screen edges past the
    // ScreenContainer padding; paddingHorizontal keeps the content at 16px.
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    // The chevron artwork is inset ~8px inside its 24px SVG box, so pull the
    // button left by that much to align the visible chevron with the 16px
    // screen content margin (where the message rows / avatars start).
    marginLeft: -spacing.sm,
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
  // Inner Animated.View of the tappable header: fills the outer Pressable and
  // carries the same row layout so avatar + text lay out correctly.
  titlePressableInner: {
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
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
    marginTop: 2,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  subtitleInline: {
    fontSize: 13,
    fontFamily: typography.fontFamilyRegular,
    fontWeight: "400",
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#707070",
  },
  subtitleRight: {
    flexShrink: 1, // let the date truncate before the label
  },
  // Filled dot separator (replaces the comma). A small solid dot reads heavier
  // than text at the same color, so drop its opacity to match the text weight.
  subtitleDot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#707070",
    opacity: 0.6,
    marginHorizontal: 5,
  },
});

export default ChatEventHeader;
