/**
 * Guards issue #217: a guest who signs in from the join sheet as the plan's
 * host must not send a request to their own plan, and a 409 means "already
 * asked" only when the server says so.
 */
import { act, renderHook } from '@testing-library/react-native';

import { UserEvent } from '@context/EventsContext';

import { useEventDetailsActions } from '../useEventDetailsActions';

type MockAuth = { user: { id: number } | null; token: string | null; authFetch: jest.Mock };

const mockAuthFetch = jest.fn();
const mockRefreshConversations = jest.fn(() => Promise.resolve());
const mockMarkEventRequested = jest.fn();
let mockAuth: MockAuth = { user: null, token: null, authFetch: mockAuthFetch };

jest.mock('@context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@context/ChatContext', () => ({
  useChat: () => ({
    setActiveConversation: jest.fn(),
    refreshConversations: mockRefreshConversations,
  }),
}));
jest.mock('@context/EventsContext', () => ({
  useEvents: () => ({
    markEventRequested: mockMarkEventRequested,
    unmarkEventRequested: jest.fn(),
  }),
}));

const HOST_ID = 55;
const event = { id: '591', ownerId: HOST_ID, title: 'Test plan', groupType: 'Single' } as UserEvent;
const navigation = { reset: jest.fn() };

const baseProps = {
  navigation: navigation as unknown as Parameters<typeof useEventDetailsActions>[0]['navigation'],
  origin: 'Events',
  event,
  eventAnalyticsParams: {},
  eventNumericId: 591,
  requestStoreKey: null,
  eventConversation: null,
  isOwner: false,
  isSingleEvent: true,
  isConversationMember: false,
  hasPendingRequest: false,
  setHasPendingRequest: jest.fn(),
  setUserIntroMessage: jest.fn(),
  setDisableHostRequestPolling: jest.fn(),
};

const jsonResponse = (status: number, body: object) => ({
  status,
  ok: status >= 200 && status < 300,
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { user: null, token: null, authFetch: mockAuthFetch };
});

// A guest opens the join sheet, writes an intro and taps Send request, which
// asks them to sign in first.
const sendAsGuest = async () => {
  const hook = renderHook((props: typeof baseProps) => useEventDetailsActions(props), {
    initialProps: baseProps,
  });
  act(() => hook.result.current.handleCtaPress());
  act(() => hook.result.current.setInviteMessage('Hi, can I join?'));
  await act(async () => {
    await hook.result.current.handleSendInvite();
  });
  expect(hook.result.current.signInVisible).toBe(true);
  expect(mockAuthFetch).not.toHaveBeenCalled();
  return hook;
};

test('signing in as the host drops the queued request', async () => {
  const { result, rerender } = await sendAsGuest();

  mockAuth = { user: { id: HOST_ID }, token: 'host-token', authFetch: mockAuthFetch };
  await act(async () => {
    rerender({ ...baseProps, isOwner: true });
  });

  expect(mockAuthFetch).not.toHaveBeenCalled();
  expect(baseProps.setHasPendingRequest).not.toHaveBeenCalled();
  expect(mockMarkEventRequested).not.toHaveBeenCalled();
  expect(result.current.signInVisible).toBe(false);
  expect(result.current.shouldShowInvitePrompt).toBe(false);
  expect(result.current.inviteMessage).toBe('');
});

test('signing in as someone else still sends the queued request', async () => {
  mockAuthFetch.mockResolvedValue(jsonResponse(201, {}));
  const { result, rerender } = await sendAsGuest();

  mockAuth = { user: { id: 77 }, token: 'guest-token', authFetch: mockAuthFetch };
  await act(async () => {
    rerender({ ...baseProps });
  });

  expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  expect(mockAuthFetch.mock.calls[0][0]).toMatch(/\/api\/events\/591\/chat\/requests$/);
  expect(baseProps.setHasPendingRequest).toHaveBeenCalledWith(true);
  expect(mockMarkEventRequested).toHaveBeenCalledWith('591');
  expect(result.current.showRequestSentBadge).toBe(true);
});

test('an already_member conflict refreshes chats instead of marking a request', async () => {
  mockAuth = { user: { id: 77 }, token: 'member-token', authFetch: mockAuthFetch };
  mockAuthFetch.mockResolvedValue(
    jsonResponse(409, { error: 'already a member of this chat', code: 'already_member' }),
  );
  const { result } = renderHook(() => useEventDetailsActions(baseProps));
  act(() => result.current.setInviteMessage('Hi, can I join?'));

  await act(async () => {
    await result.current.handleSendInvite();
  });

  expect(baseProps.setHasPendingRequest).not.toHaveBeenCalled();
  expect(mockMarkEventRequested).not.toHaveBeenCalled();
  expect(mockRefreshConversations).toHaveBeenCalledTimes(1);
  expect(result.current.inviteError).toBeNull();
});

test('a request_exists conflict marks the plan as requested', async () => {
  mockAuth = { user: { id: 77 }, token: 'guest-token', authFetch: mockAuthFetch };
  mockAuthFetch.mockResolvedValue(
    jsonResponse(409, { error: 'a pending request already exists', code: 'request_exists' }),
  );
  const { result } = renderHook(() => useEventDetailsActions(baseProps));
  act(() => result.current.setInviteMessage('Hi, can I join?'));

  await act(async () => {
    await result.current.handleSendInvite();
  });

  expect(baseProps.setHasPendingRequest).toHaveBeenCalledWith(true);
  expect(mockMarkEventRequested).toHaveBeenCalledWith('591');
  expect(result.current.inviteError).toBe('You already have a pending request for this plan.');
});

test('signing in from the plan keeps it open unless onboarding is needed', () => {
  const { result } = renderHook(() => useEventDetailsActions(baseProps));

  result.current.handleSignInSuccess(true);
  expect(navigation.reset).not.toHaveBeenCalled();

  result.current.handleSignInSuccess(false);
  expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Onboarding' }] });
});
