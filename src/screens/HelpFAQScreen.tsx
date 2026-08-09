import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ScalePressable from '@components/ScalePressable';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { AppText } from '@components/ui';
import ChevronRightIcon from '@assets/ui/chevron-right.svg';
import { colors, typography } from '@theme/index';
import { RootStackParamList } from '@navigation/types';

type FaqAnswerBlock = { type: 'paragraph'; text: string } | { type: 'bullets'; items: string[] };

const FAQ_ITEMS: { title: string; answer: FaqAnswerBlock[] }[] = [
  {
    title: 'What is WEIF?',
    answer: [
      {
        type: 'paragraph',
        text: 'WEIF (Who Else Is Free) helps you find people to make spontaneous plans with, like coffee, gigs, walks, drinks, cinema, or anything last-minute.',
      },
    ],
  },
  {
    title: 'What kind of plans can I post?',
    answer: [
      {
        type: 'paragraph',
        text: "Anything social or activity-based. If it's something you can do with others, you can post it. For example:",
      },
      {
        type: 'bullets',
        items: [
          'Coffee or food',
          'Drinks',
          'Walks or runs',
          'Gigs, cinema or other events',
          'Classes or activities',
        ],
      },
    ],
  },
  {
    title: 'When can I post plans?',
    answer: [
      {
        type: 'paragraph',
        text: 'WEIF is designed for spontaneous plans, like today or tomorrow, but you can also post plans slightly further in the future if you want to get early interest.',
      },
    ],
  },
  {
    title: 'Can I join 1:1 or group plans?',
    answer: [
      { type: 'paragraph', text: 'Yes, you can:' },
      {
        type: 'bullets',
        items: ['Join 1:1 plans', 'Join group plans', 'Host either type yourself'],
      },
    ],
  },
  {
    title: 'How does chat work?',
    answer: [
      { type: 'paragraph', text: 'Once you join a plan, you can chat with other people involved.' },
      {
        type: 'paragraph',
        text: 'Chats are temporary and disappear 24 hours after the plan ends to keep things simple and low-pressure.',
      },
    ],
  },
  {
    title: 'What happens after I join a plan?',
    answer: [
      { type: 'paragraph', text: "You'll be added to the plan and can:" },
      {
        type: 'bullets',
        items: ['See who else is going', 'Chat with participants', 'View plan details'],
      },
    ],
  },
  {
    title: "Why don't I see many plans?",
    answer: [
      {
        type: 'paragraph',
        text: 'WEIF depends on what people around you are posting. By default, we only show plans within a 50 km radius.',
      },
    ],
  },
  {
    title: 'Is WEIF safe?',
    answer: [
      { type: 'paragraph', text: 'We take safety seriously. You can:' },
      {
        type: 'bullets',
        items: [
          'Report users or plans',
          "Block people you don't want to interact with",
          'Contact us if something feels wrong',
        ],
      },
    ],
  },
  {
    title: 'How do I report someone?',
    answer: [
      { type: 'paragraph', text: 'Tap the plan and select Report.' },
      { type: 'paragraph', text: 'Or go to Contact us and choose Urgent safety issue.' },
    ],
  },
  {
    title: 'What if no one joins my plan?',
    answer: [
      { type: 'paragraph', text: 'That can happen sometimes. Try:' },
      {
        type: 'bullets',
        items: [
          'Making the plan more specific',
          'Posting earlier',
          'Adding clearer details, such as the time, vibe or location',
        ],
      },
    ],
  },
  {
    title: 'How do I contact support?',
    answer: [
      {
        type: 'paragraph',
        text: 'Go to Contact us and send us a message. We usually respond within 24 hours.',
      },
    ],
  },
];

const FaqAccordionItem = ({
  title,
  answer,
  isExpanded,
  onPress,
  isLast,
}: {
  title: string;
  answer: FaqAnswerBlock[];
  isExpanded: boolean;
  onPress: () => void;
  isLast: boolean;
}) => (
  <View style={[styles.faqItem, isLast && styles.faqItemLast]}>
    <ScalePressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
      haptic="light"
      style={styles.faqRow}
    >
      <AppText variant="body" style={styles.faqQuestion}>
        {title}
      </AppText>
      <ChevronRightIcon
        width={22}
        height={22}
        color={colors.iconColor}
        style={isExpanded ? styles.faqChevronExpanded : styles.faqChevronCollapsed}
      />
    </ScalePressable>
    {isExpanded && (
      <View style={styles.faqAnswer}>
        {answer.map((block, index) => {
          if (block.type === 'bullets') {
            return (
              <View key={`bullets-${index}`} style={styles.faqAnswerBulletList}>
                {block.items.map((item) => (
                  <View key={item} style={styles.faqAnswerBulletRow}>
                    <Text style={styles.faqAnswerBullet}>{'•'}</Text>
                    <AppText
                      variant="body"
                      style={[styles.faqAnswerText, styles.faqAnswerBulletText]}
                    >
                      {item}
                    </AppText>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <AppText key={`paragraph-${index}`} variant="body" style={styles.faqAnswerText}>
              {block.text}
            </AppText>
          );
        })}
      </View>
    )}
  </View>
);

const HelpFAQScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="FAQ" onBack={navigation.goBack} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {FAQ_ITEMS.map((item, index) => (
          <FaqAccordionItem
            key={item.title}
            title={item.title}
            answer={item.answer}
            isLast={index === FAQ_ITEMS.length - 1}
            isExpanded={expandedIndices.has(index)}
            onPress={() => {
              setExpandedIndices((current) => {
                const next = new Set(current);
                next.has(index) ? next.delete(index) : next.add(index);
                return next;
              });
            }}
          />
        ))}
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 24,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  faqItemLast: {
    borderBottomWidth: 0,
  },
  faqRow: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
  },
  faqChevronCollapsed: {
    transform: [{ rotate: '90deg' }],
  },
  faqChevronExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  faqAnswer: {
    paddingBottom: 20,
    marginTop: -3,
    gap: 10,
  },
  faqAnswerText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
  faqAnswerBulletList: {
    gap: 2,
  },
  faqAnswerBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 5,
  },
  faqAnswerBullet: {
    width: 16,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
  },
  faqAnswerBulletText: {
    flex: 1,
  },
});

export default HelpFAQScreen;
