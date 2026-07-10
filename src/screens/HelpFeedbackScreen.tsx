import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import EventActionBadge from '@components/EventActionBadge';
import ScreenContainer from '@components/ScreenContainer';
import ScreenHeader from '@components/ScreenHeader';
import HelpForm from '@components/help/HelpForm';
import { AppText } from '@components/ui';
import { API_BASE_URL } from '@api/config';
import { useAuth, type ApiError } from '@context/AuthContext';
import { colors, typography } from '@theme/index';
import { RootStackParamList } from '@navigation/types';

const FEEDBACK_BULLETS = [
  'Ideas for new features',
  'Ways to improve the app',
  'Things that feel confusing or slow',
  'General thoughts',
];

const HelpFeedbackScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authFetch } = useAuth();
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSentBadge, setShowSentBadge] = useState(false);

  const submitHelpRequest = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await authFetch(`${API_BASE_URL}/api/help-submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        const message =
          errorData.error ||
          (response.status === 401
            ? 'Session expired. Please sign in again.'
            : 'Unable to submit right now. Please try again.');
        const apiError = new Error(message) as ApiError;
        apiError.status = response.status;
        throw apiError;
      }
    },
    [authFetch],
  );

  const handleSubmit = useCallback(async () => {
    const message = feedbackMessage.trim();
    if (!message) {
      Alert.alert('Feedback required', 'Please share your ideas or thoughts.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitHelpRequest({ type: 'feedback', message });
      setShowSentBadge(true);
      setFeedbackMessage('');
    } catch (error) {
      Alert.alert(
        'Unable to send',
        error instanceof Error ? error.message : 'Unable to submit right now. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [feedbackMessage, submitHelpRequest]);

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
            Got ideas or thoughts?
          </AppText>
          <AppText variant="body" style={styles.sectionBody}>
            Tell us anything, we read it all.
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
            placeholder="Share your ideas or thoughts"
            buttonLabel="Send feedback"
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
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
