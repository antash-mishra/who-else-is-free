import { useCallback, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ChevronLeftIcon from "@assets/ui/chevron-left.svg";
import ScreenContainer from "@components/ScreenContainer";
import { colors, spacing, typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";
import privacyPolicyMarkdown from "../content/privacyPolicyMarkdown";

type PolicyBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "ordered"; items: string[] };

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const LINK_TEXTS = ["Google API Services User Data Policy", "xyz@weif.com"];

const SECTION_SCROLL_OFFSET = 16;

const stripMarkdown = (value: string) =>
  value
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();

const splitLinkedText = (
  text: string,
  base: Omit<InlineSegment, "text"> = {},
): InlineSegment[] => {
  if (!text) {
    return [];
  }

  let earliestIndex = -1;
  let earliestLink = "";

  LINK_TEXTS.forEach((linkText) => {
    const index = text.indexOf(linkText);
    if (index !== -1 && (earliestIndex === -1 || index < earliestIndex)) {
      earliestIndex = index;
      earliestLink = linkText;
    }
  });

  if (earliestIndex === -1) {
    return [{ text, ...base }];
  }

  return [
    ...splitLinkedText(text.slice(0, earliestIndex), base),
    { text: earliestLink, ...base, underline: true },
    ...splitLinkedText(text.slice(earliestIndex + earliestLink.length), base),
  ];
};

const parseInlineText = (text: string): InlineSegment[] => {
  const segments: InlineSegment[] = [];
  const pattern = /\[([^\]]+)\]\([^)]+\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let currentIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    segments.push(...splitLinkedText(text.slice(currentIndex, match.index)));

    if (match[1]) {
      segments.push({ text: match[1], underline: true });
    } else if (match[2]) {
      segments.push(
        ...splitLinkedText(match[2], {
          bold: true,
          underline: LINK_TEXTS.includes(match[2]),
        }),
      );
    } else if (match[3]) {
      segments.push(...splitLinkedText(match[3], { italic: true }));
    }

    currentIndex = pattern.lastIndex;
  }

  segments.push(...splitLinkedText(text.slice(currentIndex)));
  return segments;
};

const parsePolicyMarkdown = (markdown: string): PolicyBlock[] => {
  const lines = markdown.split(/\r?\n/);
  const blocks: PolicyBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line || line === "# Privacy Policy" || line.startsWith("[Old")) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{2,4})\s+/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith("- ") &&
      !/^\d+\.\s/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
};

const policyBlocks = parsePolicyMarkdown(privacyPolicyMarkdown);

const sectionNumberFromHeading = (text: string) => {
  const match = stripMarkdown(text).match(/^(\d+)\./);
  return match ? Number(match[1]) : undefined;
};

const InlineText = ({
  text,
  style,
}: {
  text: string;
  style?: object;
}) => (
  <>
    {parseInlineText(text).map((segment, index) => (
      <Text
        key={`${segment.text}-${index}`}
        style={[
          style,
          segment.bold && styles.strong,
          segment.italic && styles.emphasis,
          segment.underline && styles.link,
        ]}
      >
        {segment.text}
      </Text>
    ))}
  </>
);

const PolicyHeading = ({
  block,
  onSectionLayout,
}: {
  block: Extract<PolicyBlock, { type: "heading" }>;
  onSectionLayout?: (sectionNumber: number, y: number) => void;
}) => {
  const cleanText = stripMarkdown(block.text);
  const sectionNumber = sectionNumberFromHeading(block.text);

  if (block.level === 2) {
    return (
      <Text style={styles.documentTitle}>
        {cleanText.replace("WEIF - PRIVACY POLICY", "WEIF PRIVACY POLICY")}
      </Text>
    );
  }

  if (block.level === 4) {
    return <Text style={styles.updatedAt}>{cleanText}</Text>;
  }

  const isSectionHeading = cleanText === "TABLE OF CONTENTS" || /^\d+\./.test(cleanText);

  return (
    <View
      onLayout={(event) => {
        if (sectionNumber) {
          onSectionLayout?.(sectionNumber, event.nativeEvent.layout.y);
        }
      }}
      style={isSectionHeading ? styles.sectionHeadingBlock : styles.subheadingBlock}
    >
      <Text style={isSectionHeading ? styles.sectionHeading : styles.subheading}>
        <InlineText text={block.text} />
      </Text>
    </View>
  );
};

const PolicyParagraph = ({ text }: { text: string }) => (
  <Text style={styles.paragraph}>
    <InlineText text={text} />
  </Text>
);

const PolicyBullets = ({ items }: { items: string[] }) => (
  <View style={styles.listBlock}>
    {items.map((item, index) => (
      <View
        key={`${item}-${index}`}
        style={[styles.bulletRow, index === items.length - 1 && styles.lastListRow]}
      >
        <Text style={styles.bulletMark}>{"\u2022"}</Text>
        <Text style={styles.bulletText}>
          <InlineText text={item} />
        </Text>
      </View>
    ))}
  </View>
);

const PolicyOrderedList = ({
  items,
  onItemPress,
}: {
  items: string[];
  onItemPress?: (index: number) => void;
}) => (
  <View style={styles.listBlock}>
    {items.map((item, index) => (
      <Pressable
        key={`${item}-${index}`}
        accessibilityRole={onItemPress ? "button" : undefined}
        accessibilityLabel={onItemPress ? `Jump to ${stripMarkdown(item)}` : undefined}
        disabled={!onItemPress}
        onPress={() => onItemPress?.(index)}
        style={({ pressed }) => [
          styles.orderedRow,
          onItemPress && styles.tocRow,
          pressed && styles.tocRowPressed,
          index === items.length - 1 && styles.lastListRow,
        ]}
      >
        <Text style={styles.orderedNumber}>{`${index + 1}.`}</Text>
        <Text style={styles.orderedText}>
          <InlineText text={item} style={styles.orderedText} />
        </Text>
      </Pressable>
    ))}
  </View>
);

const PrivacyPolicyScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<number, number>>({});

  const handleSectionLayout = useCallback((sectionNumber: number, y: number) => {
    sectionOffsets.current[sectionNumber] = y;
  }, []);

  const handleTocPress = useCallback((index: number) => {
    const sectionNumber = index + 1;
    const y = sectionOffsets.current[sectionNumber];

    void Haptics.selectionAsync();
    if (typeof y !== "number") {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, y - SECTION_SCROLL_OFFSET),
      animated: true,
    });
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          hitSlop={12}
        >
          <ChevronLeftIcon width={24} height={24} color={colors.iconColor} />
        </Pressable>
        <Text style={styles.headerTitle}>Help</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {policyBlocks.map((block, index) => {
          if (block.type === "heading") {
            return (
              <PolicyHeading
                key={`${block.text}-${index}`}
                block={block}
                onSectionLayout={handleSectionLayout}
              />
            );
          }
          if (block.type === "bullets") {
            return <PolicyBullets key={`bullets-${index}`} items={block.items} />;
          }
          if (block.type === "ordered") {
            const previousBlock = policyBlocks[index - 1];
            const isTableOfContents =
              previousBlock?.type === "heading" &&
              stripMarkdown(previousBlock.text) === "TABLE OF CONTENTS";

            return (
              <PolicyOrderedList
                key={`ordered-${index}`}
                items={block.items}
                onItemPress={isTableOfContents ? handleTocPress : undefined}
              />
            );
          }
          return <PolicyParagraph key={`${block.text}-${index}`} text={block.text} />;
        })}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    marginLeft: -8,
  },
  headerTitle: {
    marginLeft: 14,
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 20,
    letterSpacing: 0,
    lineHeight: 26,
  },
  scrollContent: {
    paddingTop: 32,
    paddingBottom: spacing.xxl,
  },
  documentTitle: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 22,
    marginBottom: 12,
  },
  updatedAt: {
    color: colors.muted,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 22,
    marginBottom: 28,
  },
  paragraph: {
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 23,
    marginBottom: 16,
  },
  strong: {
    fontFamily: typography.fontFamilySemiBold,
  },
  emphasis: {
    fontStyle: "italic",
  },
  link: {
    textDecorationLine: "underline",
  },
  sectionHeadingBlock: {
    marginTop: 24,
    marginBottom: 28,
  },
  sectionHeading: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 22,
  },
  subheadingBlock: {
    marginBottom: 16,
  },
  subheading: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 22,
  },
  listBlock: {
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  bulletMark: {
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    lineHeight: 23,
    marginRight: 10,
    width: 16,
  },
  bulletText: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 16,
    letterSpacing: 0,
    lineHeight: 23,
  },
  orderedRow: {
    flexDirection: "row",
    marginBottom: 0,
  },
  tocRow: {
    borderRadius: 6,
  },
  tocRowPressed: {
    opacity: 0.55,
  },
  lastListRow: {
    marginBottom: 0,
  },
  orderedNumber: {
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
    width: 28,
  },
  orderedText: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: 0,
    lineHeight: 22,
  },
});

export default PrivacyPolicyScreen;
