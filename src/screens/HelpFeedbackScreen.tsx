import { useCallback, useState } from 'react';

import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { MAX_HELP_MESSAGE_LENGTH, submitHelpSubmission } from '@api/adminHelp';
import EventActionBadge from '@components/EventActionBadge';
import HelpForm from '@components/help/HelpForm';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import { AppText } from '@components/ui';
import { useAuth } from '@context/AuthContext';
import { RootStackParamList } from '@navigation/types';
import { logger } from '@services/logger';
import { colors, typography } from '@theme/index';

const FEEDBACK_BULLETS = [
  'Ideas for new features',
  'Ways we can improve the app',
  'Things that feel confusing or slow',
  'Anything else on your mind',
];

const HelpFeedbackScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authFetch } = useAuth();
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSentBadge, setShowSentBadge] = useState(false);

  const handleSubmit = useCallback(async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      Alert.alert('Feedback required', 'Please share your feedback.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitHelpSubmission(authFetch, { type: 'feedback', message });
      setShowSentBadge(true);
      setFeedbackMessage('');
    } catch (error) {
      logger.error('Failed to send feedback', error);
      Alert.alert(
        "Couldn't send your feedback",
        "We couldn't send your feedback. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [authFetch, feedbackMessage]);

  return (
    <ScreenContainer edges={['top']}>
      <ScreenHeader title="Feedback" onBack={navigation.goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <AppText variant="body" style={styles.sectionTitle}>
            Got ideas or feedback?
          </AppText>
          <AppText variant="body" style={styles.sectionBody}>
            Tell us what you think. We read every message.
          </AppText>
          <View style={styles.bulletList}>
            {FEEDBACK_BULLETS.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <AppText variant="body" style={styles.bulletMark}>
                  {'•'}
                </AppText>
                <AppText variant="body" style={styles.bulletText}>
                  {item}
                </AppText>
              </View>
            ))}
          </View>
          <HelpForm
            message={feedbackMessage}
            onMessageChange={setFeedbackMessage}
            placeholder="Share your feedback"
            buttonLabel="Send feedback"
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            messageMaxLength={MAX_HELP_MESSAGE_LENGTH}
          />
        </View>
      </ScrollView>
      <EventActionBadge
        visible={showSentBadge}
        label="Feedback sent"
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
  bulletList: {
    marginTop: 12,
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulletMark: {
    color: '#828282',
    fontSize: 15,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
});

export default HelpFeedbackScreen;
