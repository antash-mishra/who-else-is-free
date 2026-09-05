import { renderHook } from '@testing-library/react-native';

import { useEventDetailsActions } from '../useEventDetailsActions';

jest.mock('@context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@context/ChatContext', () => ({ useChat: () => ({}) }));
jest.mock('@context/EventsContext', () => ({ useEvents: () => ({}) }));

const baseProps = {
  navigation: {} as Parameters<typeof useEventDetailsActions>[0]['navigation'],
  origin: 'Events',
  event: null,
  eventAnalyticsParams: {},
  eventNumericId: null,
  requestStoreKey: null,
  eventConversation: null,
  isOwner: false,
  isSingleEvent: false,
  isConversationMember: false,
  hasPendingRequest: false,
  setHasPendingRequest: jest.fn(),
  setUserIntroMessage: jest.fn(),
  setDisableHostRequestPolling: jest.fn(),
};

test.each([
  [true, false],
  [false, true],
  [false, false],
])(
  'report plan uses normal text for joined=%s, pending=%s',
  (isConversationMember, hasPendingRequest) => {
    const { result } = renderHook(() =>
      useEventDetailsActions({ ...baseProps, isConversationMember, hasPendingRequest }),
    );
    expect(
      result.current.menuItems.find((item) => item.label === 'Report plan')?.destructive,
    ).not.toBe(true);
  },
);
test('joined menu puts report before destructive leave', () => {
  const { result } = renderHook(() =>
    useEventDetailsActions({ ...baseProps, isConversationMember: true }),
  );
  expect(result.current.menuItems.map((item) => item.label)).toEqual([
    'View intro message',
    'Report plan',
    'Leave plan',
  ]);
  expect(result.current.menuItems[2].destructive).toBe(true);
});
