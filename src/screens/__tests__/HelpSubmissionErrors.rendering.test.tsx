import React from 'react';

import { Alert, Pressable, Text, View } from 'react-native';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import HelpContactScreen from '@screens/HelpContactScreen';
import HelpFeedbackScreen from '@screens/HelpFeedbackScreen';

const mockSubmitHelpSubmission = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('@api/adminHelp', () => ({
  MAX_HELP_MESSAGE_LENGTH: 4000,
  MAX_REPLY_EMAIL_LENGTH: 320,
  submitHelpSubmission: (...args: unknown[]) => mockSubmitHelpSubmission(...args),
}));

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ authFetch: jest.fn() }),
}));

jest.mock('@services/logger', () => ({
  logger: { error: (...args: unknown[]) => mockLoggerError(...args) },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('@components/ScreenContainer', () => ({ children }: { children: React.ReactNode }) => (
  <View>{children}</View>
));

jest.mock('@components/ScreenHeader', () => ({ title }: { title: string }) => <Text>{title}</Text>);

jest.mock('@components/EventActionBadge', () => () => null);

jest.mock(
  '@components/help/HelpForm',
  () =>
    ({
      onMessageChange,
      onSubmit,
    }: {
      onMessageChange: (message: string) => void;
      onSubmit: () => void;
    }) => (
      <View>
        <Pressable accessibilityLabel="Fill message" onPress={() => onMessageChange('Hello')}>
          <Text>Fill message</Text>
        </Pressable>
        <Pressable accessibilityLabel="Submit message" onPress={onSubmit}>
          <Text>Submit message</Text>
        </Pressable>
      </View>
    ),
);

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

describe.each([
  {
    name: 'Contact us',
    Screen: HelpContactScreen,
    logMessage: 'Failed to send contact message',
    alertTitle: "Couldn't send your message",
    alertDescription: "We couldn't send your message. Please try again.",
  },
  {
    name: 'Feedback',
    Screen: HelpFeedbackScreen,
    logMessage: 'Failed to send feedback',
    alertTitle: "Couldn't send your feedback",
    alertDescription: "We couldn't send your feedback. Please try again.",
  },
])('$name submission errors', ({ Screen, logMessage, alertTitle, alertDescription }) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitHelpSubmission.mockRejectedValue(new Error('private server details'));
  });

  it('logs the underlying failure and shows only fixed user-safe copy', async () => {
    const { getByLabelText, queryByText } = render(<Screen />);

    fireEvent.press(getByLabelText('Fill message'));
    fireEvent.press(getByLabelText('Submit message'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(alertTitle, alertDescription);
    });
    expect(mockLoggerError).toHaveBeenCalledWith(logMessage, expect.any(Error));
    expect(queryByText('private server details')).toBeNull();
  });
});
