import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ScreenContainer from "@components/ScreenContainer";
import HelpForm from "@components/help/HelpForm";
import SegmentedControl, { type SegmentedOption } from "@components/SegmentedControl";
import ChevronLeftIcon from "@assets/ui/chevron-left.svg";
import ChevronRightIcon from "@assets/ui/chevron-right.svg";
import { API_BASE_URL } from "@api/config";
import { useAuth, type ApiError } from "@context/AuthContext";
import { colors, spacing, typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";

type HelpTab = "contact" | "faq" | "feedback";
type FaqAnswerBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

const HELP_TABS: SegmentedOption[] = [
  { label: "Contact us", value: "contact" },
  { label: "FAQ", value: "faq" },
  { label: "Feedback", value: "feedback" },
];

const CONTACT_CHECKBOXES = [
  { label: "Urgent safety issue", value: "urgent" },
  { label: "I want a reply", value: "reply" },
];

const FEEDBACK_BULLETS = [
  "Ideas for new features",
  "Ways to improve the app",
  "Things that feel confusing or slow",
  "General thoughts",
];

const FAQ_ITEMS: { title: string; answer: FaqAnswerBlock[] }[] = [
  {
    title: "What is WEIF?",
    answer: [
      {
        type: "paragraph",
        text: "WEIF (Who Else Is Free) helps you find people to do spontaneous plans with - like coffee, gigs, walks, drinks, cinema, or anything last-minute.",
      },
    ],
  },
  {
    title: "What kind of plans can I post?",
    answer: [
      {
        type: "paragraph",
        text: "Anything social or activity-based. If it’s something you can do with others, you can post it, for example:",
      },
      {
        type: "bullets",
        items: [
          "Coffee or food",
          "Drinks",
          "Walks or runs",
          "Events, gigs, cinema",
          "Classes or activities",
        ],
      },
    ],
  },
  {
    title: "When can I post plans?",
    answer: [
      {
        type: "paragraph",
        text: "WEIF is designed for spontaneous plans, like today, tomorrow, but you can also post slightly future events if you want to get early interest.",
      },
    ],
  },
  {
    title: "Can I join 1:1 or group plans?",
    answer: [
      { type: "paragraph", text: "Yes, you can:" },
      {
        type: "bullets",
        items: [
          "Join 1:1 plans",
          "Join group plans",
          "Host either type yourself",
        ],
      },
    ],
  },
  {
    title: "How does chat work?",
    answer: [
      {
        type: "paragraph",
        text: "Once you join a plan, you can chat with other people involved.",
      },
      {
        type: "paragraph",
        text: "Chats are temporary and disappear 24 hours after the event ends to keep things simple and low-pressure.",
      },
    ],
  },
  {
    title: "What happens after I join a plan?",
    answer: [
      { type: "paragraph", text: "You’ll be added to the event and can:" },
      {
        type: "bullets",
        items: [
          "See who else is going",
          "Chat with participants",
          "Get event details",
        ],
      },
    ],
  },
  {
    title: "Why don’t I see many events?",
    answer: [
      {
        type: "paragraph",
        text: "WEIF depends on what people around you are posting. Be default, we only show events within 50 Km radius.",
      },
    ],
  },
  {
    title: "Is WEIF safe?",
    answer: [
      { type: "paragraph", text: "We take safety seriously. You can:" },
      {
        type: "bullets",
        items: [
          "Report users or events",
          "Block people you don’t want to interact with",
          "Contact us if something feels wrong",
        ],
      },
    ],
  },
  {
    title: "How do I report someone?",
    answer: [
      { type: "paragraph", text: "Tap the event → select Report" },
      {
        type: "paragraph",
        text: "Or go to Contact Us and choose safety issue.",
      },
    ],
  },
  {
    title: "What if no one joins my plan?",
    answer: [
      { type: "paragraph", text: "That can happen sometimes. Try:" },
      {
        type: "bullets",
        items: [
          "Making the plan more specific",
          "Posting earlier in the day",
          "Adding clearer details (time, vibe, location)",
        ],
      },
    ],
  },
  {
    title: "How do I contact support?",
    answer: [
      {
        type: "paragraph",
        text: "Go to the Contact Us tab and send us a message. We usually respond within 24 hours.",
      },
    ],
  },
];

const HelpScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<HelpTab>("contact");
  const [contactMessage, setContactMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [expandedFaqIndex, setExpandedFaqIndex] = useState<number | null>(null);
  const [checkedContactOptions, setCheckedContactOptions] = useState<string[]>(
    [],
  );

  const toggleContactOption = useCallback((value: string) => {
    setCheckedContactOptions((current) =>
      current.includes(value)
        ? current.filter((option) => option !== value)
        : [...current, value],
    );
  }, []);

  const submitHelpRequest = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await authFetch(`${API_BASE_URL}/api/help-submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        const message =
          errorData.error ||
          (response.status === 401
            ? "Session expired. Please sign in again."
            : "Unable to submit right now. Please try again.");
        const apiError = new Error(message) as ApiError;
        apiError.status = response.status;
        throw apiError;
      }
    },
    [authFetch],
  );

  const handleContactSubmit = useCallback(async () => {
    const message = contactMessage.trim();
    const wantsReply = checkedContactOptions.includes("reply");
    const urgentSafetyIssue = checkedContactOptions.includes("urgent");
    const email = replyEmail.trim();

    if (!message) {
      Alert.alert("Message required", "Please describe what you need help with.");
      return;
    }
    if (wantsReply && !email) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }

    setIsSubmittingContact(true);
    try {
      await submitHelpRequest({
        type: "contact",
        message,
        urgent_safety_issue: urgentSafetyIssue,
        wants_reply: wantsReply,
        reply_email: wantsReply ? email : undefined,
      });
      Alert.alert(
        "Message sent",
        "Thanks. We will get back to you as soon as we can.",
      );
      setContactMessage("");
      setReplyEmail("");
      setCheckedContactOptions([]);
    } catch (error) {
      Alert.alert(
        "Unable to send",
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again.",
      );
    } finally {
      setIsSubmittingContact(false);
    }
  }, [checkedContactOptions, contactMessage, replyEmail, submitHelpRequest]);

  const handleFeedbackSubmit = useCallback(async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      Alert.alert("Feedback required", "Please tell us what you think.");
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      await submitHelpRequest({
        type: "feedback",
        message,
      });
      Alert.alert(
        "Feedback sent",
        "Thanks for helping us improve Who else is free.",
      );
      setFeedbackMessage("");
    } catch (error) {
      Alert.alert(
        "Unable to send",
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again.",
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [feedbackMessage, submitHelpRequest]);

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            style={styles.backButton}
            hitSlop={8}
          >
            <ChevronLeftIcon width={24} height={24} color={colors.iconColor} />
          </Pressable>
          <Text style={styles.headerTitle}>Help</Text>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <SegmentedControl
            options={HELP_TABS}
            value={activeTab}
            onChange={(value) => setActiveTab(value as HelpTab)}
          />

          {activeTab === "contact" && (
            <View style={styles.tabContent}>
              <HelpSection
                title="Need help or something not working?"
                body="Send us a message and we will help you sort it. We will get back to you as soon as we can."
              />
              <Divider />
              <HelpSection
                title="Urgent safety issue"
                body="If you feel unsafe or had a bad experience, please report it. We review all safety reports as a priority."
              />
              <Divider />
              <HelpForm
                message={contactMessage}
                onMessageChange={setContactMessage}
                buttonLabel="Send"
                replyEmail={replyEmail}
                onReplyEmailChange={setReplyEmail}
                showReplyEmailInput={checkedContactOptions.includes("reply")}
                checkboxOptions={CONTACT_CHECKBOXES}
                checkedValues={checkedContactOptions}
                onToggleCheckbox={toggleContactOption}
                onSubmit={handleContactSubmit}
                isSubmitting={isSubmittingContact}
              />
            </View>
          )}

          {activeTab === "faq" && (
            <View style={styles.faqContent}>
              {FAQ_ITEMS.map((item, index) => (
                <FaqAccordionItem
                  key={item.title}
                  title={item.title}
                  answer={item.answer}
                  isExpanded={expandedFaqIndex === index}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedFaqIndex((current) =>
                      current === index ? null : index,
                    );
                  }}
                />
              ))}
            </View>
          )}

          {activeTab === "feedback" && (
            <View style={styles.tabContent}>
              <Text style={styles.sectionTitle}>Got ideas or thoughts?</Text>
              <Text style={styles.sectionBody}>
                Tell us anything, we read it all.
              </Text>
              <View style={styles.bulletList}>
                {FEEDBACK_BULLETS.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <Text style={styles.bullet}>{"\u2022"}</Text>
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
              <Divider />
              <HelpForm
                message={feedbackMessage}
                onMessageChange={setFeedbackMessage}
                buttonLabel="Send feedback"
                onSubmit={handleFeedbackSubmit}
                isSubmitting={isSubmittingFeedback}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const HelpSection = ({ title, body }: { title: string; body: string }) => (
  <View>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionBody}>{body}</Text>
  </View>
);

const Divider = () => <View style={styles.divider} />;

const FaqAccordionItem = ({
  title,
  answer,
  isExpanded,
  onPress,
}: {
  title: string;
  answer: FaqAnswerBlock[];
  isExpanded: boolean;
  onPress: () => void;
}) => (
  <View style={styles.faqItem}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
      style={styles.faqRow}
    >
      <Text style={styles.faqQuestion}>{title}</Text>
      <ChevronRightIcon
        width={22}
        height={22}
        color={colors.iconColor}
        style={isExpanded ? styles.faqChevronExpanded : undefined}
      />
    </Pressable>
    {isExpanded && (
      <View style={styles.faqAnswer}>
        {answer.map((block, index) => {
          if (block.type === "bullets") {
            return (
              <View
                key={`bullets-${index}`}
                style={styles.faqAnswerBulletList}
              >
                {block.items.map((item) => (
                  <View key={item} style={styles.faqAnswerBulletRow}>
                    <Text style={styles.faqAnswerBullet}>{"\u2022"}</Text>
                    <Text
                      style={[
                        styles.faqAnswerText,
                        styles.faqAnswerBulletText,
                      ]}
                    >
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }

          return (
            <Text key={`paragraph-${index}`} style={styles.faqAnswerText}>
              {block.text}
            </Text>
          );
        })}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 32,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    letterSpacing: -0.4,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: spacing.xxl,
  },
  tabContent: {
    paddingTop: 34,
  },
  faqContent: {
    paddingTop: 23,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamilySemiBold,
    color: "#000000",
    letterSpacing: -0.3,
  },
  sectionBody: {
    marginTop: 19,
    color: "#000000",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
  divider: {
    height: 1,
    marginVertical: 25,
    backgroundColor: "#E3E3E3",
  },
  bulletList: {
    marginTop: 9,
    gap: 1,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 8,
  },
  bullet: {
    width: 16,
    color: "#000000",
    fontSize: 18,
    lineHeight: 20,
    fontFamily: typography.fontFamilyRegular,
  },
  bulletText: {
    flex: 1,
    color: "#000000",
    fontSize: 16,
    lineHeight: 20,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#EDEDED",
  },
  faqRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    color: "#000000",
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamilySemiBold,
    letterSpacing: -0.3,
  },
  faqChevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  faqAnswer: {
    paddingBottom: 20,
    marginTop: -3,
    gap: 10,
  },
  faqAnswerText: {
    color: "#000000",
    fontSize: 14,
    lineHeight: 17,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.2,
  },
  faqAnswerBulletList: {
    gap: 2,
  },
  faqAnswerBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 5,
  },
  faqAnswerBullet: {
    width: 16,
    color: "#000000",
    fontSize: 14,
    lineHeight: 17,
    fontFamily: typography.fontFamilyRegular,
  },
  faqAnswerBulletText: {
    flex: 1,
  },
});

export default HelpScreen;
