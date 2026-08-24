import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { RootStackParamList } from '@navigation/types';
import { triggerHaptic } from '@services/haptics';
import { colors, spacing, typography } from '@theme/index';

import privacyPolicyMarkdown from '../content/privacyPolicyMarkdown';

type PolicyBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'ordered'; items: string[] };

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const LINK_TEXTS = [
  'Google API Services User Data Policy',
  'xyz@weif.com',
  'data subject access request',
];

const SECTION_SCROLL_OFFSET = 16;

const stripMarkdown = (value: string) =>
  value
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

const splitLinkedText = (text: string, base: Omit<InlineSegment, 'text'> = {}): InlineSegment[] => {
  if (!text) {
    return [];
  }

  let earliestIndex = -1;
  let earliestLink = '';

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

    if (!line || line === '# Privacy Policy') {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2],
      });
      index += 1;
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ''));
        index += 1;
      }
      blocks.push({ type: 'ordered', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{2,4})\s+/.test(lines[index].trim()) &&
      !lines[index].trim().startsWith('- ') &&
      !/^\d+\.\s/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
};

const policyBlocks = parsePolicyMarkdown(privacyPolicyMarkdown);

const sectionNumberFromHeading = (text: string) => {
  const match = stripMarkdown(text).match(/^(\d+)\./);
  return match ? Number(match[1]) : undefined;
};

const InlineText = ({ text, style }: { text: string; style?: object }) => (
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
  block: Extract<PolicyBlock, { type: 'heading' }>;
  onSectionLayout?: (sectionNumber: number, y: number) => void;
}) => {
  const cleanText = stripMarkdown(block.text);
  const sectionNumber = sectionNumberFromHeading(block.text);

  if (block.level === 2) {
    return (
      <Text style={styles.documentTitle}>
        {cleanText.replace('WEIF - PRIVACY POLICY', 'WEIF PRIVACY POLICY')}
      </Text>
    );
  }

  if (block.level === 4) {
    return <Text style={styles.updatedAt}>{cleanText}</Text>;
  }

  const isSectionHeading = cleanText === 'TABLE OF CONTENTS' || /^\d+\./.test(cleanText);

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
        <Text style={styles.bulletMark}>{'•'}</Text>
        <Text style={styles.bulletText}>
          <InlineText text={item} />
        </Text>
      </View>
    ))}
  </View>
);

const toSentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const PolicyOrderedList = ({
  items,
  onItemPress,
  isToc,
}: {
  items: string[];
  onItemPress?: (index: number) => void;
  isToc?: boolean;
}) => (
  <View style={styles.listBlock}>
    {items.map((item, index) => (
      <Pressable
        key={`${item}-${index}`}
        accessibilityRole={onItemPress ? 'button' : undefined}
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
        <Text style={[styles.orderedNumber, isToc && styles.tocText]}>{`${index + 1}.`}</Text>
        <Text style={[styles.orderedText, isToc && styles.tocText]}>
          <InlineText
            text={isToc ? toSentenceCase(item) : item}
            style={[styles.orderedText, isToc && styles.tocText]}
          />
        </Text>
      </Pressable>
    ))}
  </View>
);

const PrivacyPolicyScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<number, number>>({});

  const handleSectionLayout = useCallback((sectionNumber: number, y: number) => {
    sectionOffsets.current[sectionNumber] = y;
  }, []);

  const handleTocPress = useCallback((index: number) => {
    const sectionNumber = index + 1;
    const y = sectionOffsets.current[sectionNumber];

    triggerHaptic('selection');
    if (typeof y !== 'number') {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, y - SECTION_SCROLL_OFFSET),
      animated: true,
    });
  }, []);

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="Privacy policy" onBack={navigation.goBack} />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {policyBlocks.map((block, index) => {
          if (block.type === 'heading') {
            return (
              <PolicyHeading
                key={`${block.text}-${index}`}
                block={block}
                onSectionLayout={handleSectionLayout}
              />
            );
          }
          if (block.type === 'bullets') {
            return <PolicyBullets key={`bullets-${index}`} items={block.items} />;
          }
          if (block.type === 'ordered') {
            const previousBlock = policyBlocks[index - 1];
            const isTableOfContents =
              previousBlock?.type === 'heading' &&
              stripMarkdown(previousBlock.text) === 'TABLE OF CONTENTS';

            return (
              <PolicyOrderedList
                key={`ordered-${index}`}
                items={block.items}
                onItemPress={isTableOfContents ? handleTocPress : undefined}
                isToc={isTableOfContents}
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
  scrollContent: {
    paddingTop: 32,
    paddingBottom: spacing.xxl,
  },
  documentTitle: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  updatedAt: {
    color: colors.muted,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 48,
    textAlign: 'center',
  },
  paragraph: {
    color: colors.text,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 20,
  },
  strong: {
    fontFamily: typography.fontFamilySemiBold,
  },
  emphasis: {
    fontStyle: 'italic',
  },
  link: {
    color: colors.secondary,
    textDecorationLine: 'underline',
  },
  sectionHeadingBlock: {
    marginTop: 28,
    marginBottom: 24,
  },
  sectionHeading: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  subheadingBlock: {
    marginTop: 16,
    marginBottom: 16,
  },
  subheading: {
    color: colors.text,
    fontFamily: typography.fontFamilySemiBold,
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  listBlock: {
    marginTop: -8,
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  bulletMark: {
    color: '#828282',
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    lineHeight: 22,
    marginRight: 10,
  },
  bulletText: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  orderedRow: {
    flexDirection: 'row',
    marginBottom: 12,
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
    letterSpacing: -0.2,
    lineHeight: 22,
    width: 28,
  },
  orderedText: {
    color: colors.text,
    flex: 1,
    fontFamily: typography.fontFamilyRegular,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  tocText: {
    color: colors.secondary,
  },
});

export default PrivacyPolicyScreen;
