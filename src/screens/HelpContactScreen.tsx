import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ScreenContainer from "@components/ScreenContainer";
import ScreenHeader from "@components/ScreenHeader";
import HelpForm from "@components/help/HelpForm";
import { API_BASE_URL } from "@api/config";
import { useAuth, type ApiError } from "@context/AuthContext";
import { typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";

const CONTACT_CHECKBOXES = [
  { label: "Urgent safety issue", value: "urgent" },
  { label: "I want a reply", value: "reply" },
];

const HelpContactScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authFetch } = useAuth();
  const [contactMessage, setContactMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkedOptions, setCheckedOptions] = useState<string[]>([]);

  const toggleOption = useCallback((value: string) => {
    setCheckedOptions((current) =>
      current.includes(value)
        ? current.filter((o) => o !== value)
        : [...current, value],
    );
  }, []);

  const submitHelpRequest = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await authFetch(`${API_BASE_URL}/api/help-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
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

  const handleSubmit = useCallback(async () => {
    const message = contactMessage.trim();
    const wantsReply = checkedOptions.includes("reply");
    const email = replyEmail.trim();

    if (!message) {
      Alert.alert("Message required", "Please describe what you need help with.");
      return;
    }
    if (wantsReply && !email) {
      Alert.alert("Email required", "Please enter your email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitHelpRequest({
        type: "contact",
        message,
        urgent_safety_issue: checkedOptions.includes("urgent"),
        wants_reply: wantsReply,
        reply_email: wantsReply ? email : undefined,
      });
      Alert.alert("Message sent", "Thanks. We will get back to you as soon as we can.");
      setContactMessage("");
      setReplyEmail("");
      setCheckedOptions([]);
    } catch (error) {
      Alert.alert(
        "Unable to send",
        error instanceof Error ? error.message : "Unable to submit right now. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [checkedOptions, contactMessage, replyEmail, submitHelpRequest]);

  return (
    <ScreenContainer edges={["top"]}>
      <ScreenHeader title="Contact us" onBack={navigation.goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Need help with anything?</Text>
          <Text style={styles.sectionBody}>
            If you feel unsafe, had a bad experience, or something's not working, we're here. We review all safety reports as a priority and will get back to you as soon as we can.
          </Text>
          <HelpForm
            message={contactMessage}
            onMessageChange={setContactMessage}
            buttonLabel="Send message"
            replyEmail={replyEmail}
            onReplyEmailChange={setReplyEmail}
            showReplyEmailInput={checkedOptions.includes("reply")}
            checkboxOptions={CONTACT_CHECKBOXES}
            checkedValues={checkedOptions}
            onToggleCheckbox={toggleOption}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  content: {
    paddingTop: 32,
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontFamily: typography.fontFamilyMedium,
    color: "#000000",
    letterSpacing: -0.3,
  },
  sectionBody: {
    marginTop: 19,
    color: "#000000",
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
});

export default HelpContactScreen;
