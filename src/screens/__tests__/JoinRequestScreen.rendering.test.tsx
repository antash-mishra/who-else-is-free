import React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import JoinRequestScreen from '../JoinRequestScreen';

const mockGoBack = jest.fn();
const mockRefreshJoinRequests = jest.fn().mockResolvedValue(undefined);
const mockApproveJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockDenyJoinRequest = jest.fn().mockResolvedValue(undefined);
const mockRefreshEvents = jest.fn().mockResolvedValue(undefined);

const routeParams: {
  conversationId?: number;
  eventId: number;
  title: string;
} = {
  eventId: 7,
  title: 'Morning Walk',
};

const pendingRequest = {
  id: 11,
  eventId: 7,
  userId: 3,
  message: 'I would love to join.',
  status: 'pending' as const,
  createdAt: '2026-08-24T10:00:00.000Z',
  requester: { id: 3, name: 'Alex Example' },
};

let mockChatValue = {
  approveJoinRequest: mockApproveJoinRequest,
  conversations: [],
  denyJoinRequest: mockDenyJoinRequest,
  joinRequestsByConversation: { [-7]: [pendingRequest] },
  refreshJoinRequests: mockRefreshJoinRequests,
};

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ name: 'JoinRequest', params: routeParams }),
}));

jest.mock('@context/ChatContext', () => ({
  useChat: () => mockChatValue,
}));

jest.mock('@context/CoversContext', () => ({
  useCovers: () => ({ getCoverSource: jest.fn(() => undefined) }),
}));

jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({
    refreshEvents: mockRefreshEvents,
    events: [
      {
        id: '7',
        title: 'Morning Walk',
        groupType: 'Single',
        dateLabel: 'Today',
      },
    ],
  }),
}));

jest.mock('@components/ScreenContainer', () => {
  const { View } = require('react-native');
  return ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
});

jest.mock('@components/FullPageEmptyState', () => {
  const { View } = require('react-native');
  return ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? <View testID="full-page-empty-state">{children}</View> : null;
});

jest.mock('@components/EmptyState', () => {
  const { Text, View } = require('react-native');
  return ({ title, description }: { title: string; description: string }) => (
    <View>
      <Text>{title}</Text>
      <Text>{description}</Text>
    </View>
  );
});

jest.mock('@components/ChatEventHeader', () => {
  const { Pressable, Text, View } = require('react-native');
  return ({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle: string }) => (
    <View>
      <Pressable accessibilityLabel="Go back" onPress={onBack} />
      <Text>{title}</Text>
      <Text>{subtitle}</Text>
    </View>
  );
});

jest.mock('@components/events', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    EventRequestRow: ({
      requester,
      message,
      onAccept,
      onDecline,
      testID,
    }: {
      requester: { name: string };
      message: string;
      onAccept: () => void;
      onDecline: () => void;
      testID: string;
    }) => (
      <View testID={testID}>
        <Text>{requester.name}</Text>
        <Text>{message}</Text>
        <Pressable accessibilityLabel="Accept" onPress={onAccept} />
        <Pressable accessibilityLabel="Decline" onPress={onDecline} />
      </View>
    ),
    EventRequestRowSeparator: () => <View />,
  };
});

describe('JoinRequestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete routeParams.conversationId;
    mockChatValue = {
      approveJoinRequest: mockApproveJoinRequest,
      conversations: [],
      denyJoinRequest: mockDenyJoinRequest,
      joinRequestsByConversation: { [-7]: [pendingRequest] },
      refreshJoinRequests: mockRefreshJoinRequests,
    };
  });

  it('loads and renders a conversation-less 1:1 request from its event key', async () => {
    const { getByText } = render(<JoinRequestScreen />);

    expect(getByText('Morning Walk')).toBeTruthy();
    expect(getByText('Alex Example')).toBeTruthy();
    await waitFor(() => {
      expect(mockRefreshEvents).toHaveBeenCalled();
      expect(mockRefreshJoinRequests).toHaveBeenCalledWith(-7, 7, {
        includeApproved: false,
      });
    });
  });

  it('accepts the request using the same event-scoped store key', async () => {
    const { getByLabelText } = render(<JoinRequestScreen />);

    fireEvent.press(getByLabelText('Accept'));

    await waitFor(() => {
      expect(mockApproveJoinRequest).toHaveBeenCalledWith(-7, 7, 3);
    });
  });

  it('uses the requested empty-state copy', () => {
    mockChatValue.joinRequestsByConversation = { [-7]: [] };

    const { getByText, getByTestId } = render(<JoinRequestScreen />);

    expect(getByTestId('full-page-empty-state')).toBeTruthy();
    expect(getByText('No requests')).toBeTruthy();
    expect(getByText('Join requests will appear here.')).toBeTruthy();
  });
});
