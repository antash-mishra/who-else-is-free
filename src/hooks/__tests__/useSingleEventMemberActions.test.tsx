import { act, renderHook } from '@testing-library/react-native';

import useSingleEventMemberActions from '@hooks/useSingleEventMemberActions';

const mockAuthFetch = jest.fn();

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({ authFetch: mockAuthFetch, token: 'mock-token' }),
}));

jest.mock('@services/haptics', () => ({ triggerHaptic: jest.fn() }));

const target = { userId: 2, name: 'Liam Test' };

const openReportPrompt = (result: { current: ReturnType<typeof useSingleEventMemberActions> }) => {
  act(() => result.current.openMenu(target));
  act(() => result.current.menuItems[0].onPress());
  act(() => result.current.confirmReport());
};

describe('useSingleEventMemberActions', () => {
  beforeEach(() => {
    mockAuthFetch.mockReset();
  });

  it('asks for confirmation before opening the report prompt, like Event Details', () => {
    const { result } = renderHook(() => useSingleEventMemberActions({ eventId: 7 }));

    act(() => result.current.openMenu(target));
    act(() => result.current.menuItems[0].onPress());

    expect(result.current.showMenu).toBe(false);
    expect(result.current.showReportConfirm).toBe(true);
    expect(result.current.showReportOverlay).toBe(false);

    act(() => result.current.confirmReport());

    expect(result.current.showReportConfirm).toBe(false);
    expect(result.current.showReportOverlay).toBe(true);
  });

  it('cancelling the confirmation closes it without opening the prompt', () => {
    const { result } = renderHook(() => useSingleEventMemberActions({ eventId: 7 }));

    act(() => result.current.openMenu(target));
    act(() => result.current.menuItems[0].onPress());
    act(() => result.current.cancelReport());

    expect(result.current.showReportConfirm).toBe(false);
    expect(result.current.showReportOverlay).toBe(false);
  });

  it('uses the Event Details empty-reason copy', async () => {
    const { result } = renderHook(() => useSingleEventMemberActions({ eventId: 7 }));
    openReportPrompt(result);

    await act(async () => {
      await result.current.handleSubmitReport();
    });

    expect(result.current.reportError).toBe('Please tell us why you are reporting this member.');
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('shows fixed member-report copy instead of the raw error on a network failure', async () => {
    mockAuthFetch.mockRejectedValue(new TypeError('Network request failed'));
    const { result } = renderHook(() => useSingleEventMemberActions({ eventId: 7 }));
    openReportPrompt(result);
    act(() => result.current.setReportMessage('spam'));

    await act(async () => {
      await result.current.handleSubmitReport();
    });

    expect(result.current.reportError).toBe("Couldn't report Liam. Please try again.");
  });

  it('names the member in the server-failure copy', async () => {
    mockAuthFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useSingleEventMemberActions({ eventId: 7 }));
    openReportPrompt(result);
    act(() => result.current.setReportMessage('spam'));

    await act(async () => {
      await result.current.handleSubmitReport();
    });

    expect(result.current.reportError).toBe("Couldn't report Liam. Please try again.");
  });
});
