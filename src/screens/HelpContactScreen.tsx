import { useCallback, useState } from 'react';

import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  MAX_HELP_MESSAGE_LENGTH,
  MAX_REPLY_EMAIL_LENGTH,
  submitHelpSubmission,
} from '@api/adminHelp';
import EventActionBadge from '@components/EventActionBadge';
import HelpForm from '@components/help/HelpForm';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { AppText } from '@components/ui';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { colors, typography } from '@theme/index';

const CONTACT_CHECKBOXES = [
  { label: 'Urgent safety issue', value: 'urgent' },
  { label: 'I need a reply', value: 'reply' },
];

const HelpContactScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authFetch } = useAuth();
  const [contactMessage, setContactMessage] = useState('');
  const [replyEmail, setReplyEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkedOptions, setCheckedOptions] = useState<string[]>([]);
  const [showSentBadge, setShowSentBadge] = useState(false);

  const toggleOption = useCallback((value: string) => {
    setCheckedOptions((current) =>
      current.includes(value) ? current.filter((o) => o !== value) : [...current, value],
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    const message = contactMessage.trim();
    const wantsReply = checkedOptions.includes('reply');
    const email = replyEmail.trim();

    if (!message) {
      Alert.alert('Message required', 'Please describe what you need help with.');
      return;
    }
    if (wantsReply && !email) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitHelpSubmission(authFetch, {
        type: 'contact',
        message,
        urgentSafetyIssue: checkedOptions.includes('urgent'),
        wantsReply,
        replyEmail: wantsReply ? email : undefined,
      });
      setShowSentBadge(true);
      setContactMessage('');
      setReplyEmail('');
      setCheckedOptions([]);
    } catch (error) {
      Alert.alert(
        "Couldn't send your message.",
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [authFetch, checkedOptions, contactMessage, replyEmail]);

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="Contact us" onBack={navigation.goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <AppText variant="body" style={styles.sectionTitle}>
            Need help with anything?
          </AppText>
          <AppText variant="body" style={styles.sectionBody}>
            If you feel unsafe, had a bad experience, or something isn't working, we're here to
            help. Safety reports are reviewed as a priority, and we'll get back to you as soon as
            we can.
          </AppText>
          <HelpForm
            message={contactMessage}
            onMessageChange={setContactMessage}
            buttonLabel="Send message"
            replyEmail={replyEmail}
            onReplyEmailChange={setReplyEmail}
            showReplyEmailInput={checkedOptions.includes('reply')}
            checkboxOptions={CONTACT_CHECKBOXES}
            checkedValues={checkedOptions}
            onToggleCheckbox={toggleOption}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            messageMaxLength={MAX_HELP_MESSAGE_LENGTH}
            replyEmailMaxLength={MAX_REPLY_EMAIL_LENGTH}
          />
        </View>
      </ScrollView>
      <EventActionBadge
        visible={showSentBadge}
        label="Message sent"
        onHidden={() => setShowSentBadge(false)}
      />
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
    color: colors.text,
    letterSpacing: -0.3,
  },
  sectionBody: {
    marginTop: 19,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
});

export default HelpContactScreen;
