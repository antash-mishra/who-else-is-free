import { Platform } from 'react-native';

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  LOCATION_PROMPT_SEEN_KEY,
  useLocationPermissionPrompt,
} from '../useLocationPermissionPrompt';

const mockGetForegroundPermissionsAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForegroundPermissionsAsync(...args),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

const setup = () => {
  const requestPermission = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useLocationPermissionPrompt(requestPermission));
  return { ...hook, requestPermission };
};

describe('useLocationPermissionPrompt', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockGetForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('skips the sheet when location is already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    const { result } = setup();

    await act(() => result.current.offer());

    expect(result.current.sheetProps.visible).toBe(false);
  });

  it('skips the sheet once it has been answered', async () => {
    mockGetItemAsync.mockResolvedValue('1');
    const { result } = setup();

    await act(() => result.current.offer());

    expect(mockGetItemAsync).toHaveBeenCalledWith(LOCATION_PROMPT_SEEN_KEY);
    expect(result.current.sheetProps.visible).toBe(false);
  });

  it('skips the sheet when iOS can no longer show its prompt', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const { result } = setup();

    await act(() => result.current.offer());

    expect(result.current.sheetProps.visible).toBe(false);
  });

  it("still offers the sheet on Android when expo reports it can't ask again", async () => {
    Platform.OS = 'android';
    mockGetForegroundPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    const { result } = setup();

    act(() => {
      void result.current.offer();
    });

    await waitFor(() => expect(result.current.sheetProps.visible).toBe(true));
  });

  it('Continue closes the sheet, then requests the system prompt', async () => {
    const { result, requestPermission } = setup();
    let done = false;
    act(() => {
      void result.current.offer().then(() => {
        done = true;
      });
    });
    await waitFor(() => expect(result.current.sheetProps.visible).toBe(true));

    act(() => result.current.sheetProps.onContinue());
    expect(result.current.sheetProps.visible).toBe(false);
    expect(mockSetItemAsync).toHaveBeenCalledWith(LOCATION_PROMPT_SEEN_KEY, '1');
    expect(requestPermission).not.toHaveBeenCalled();

    act(() => result.current.sheetProps.onClosed());
    await waitFor(() => expect(done).toBe(true));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('Close dismisses without the system prompt and remembers the answer', async () => {
    const { result, requestPermission } = setup();
    let done = false;
    act(() => {
      void result.current.offer().then(() => {
        done = true;
      });
    });
    await waitFor(() => expect(result.current.sheetProps.visible).toBe(true));

    act(() => result.current.sheetProps.onDismiss());
    act(() => result.current.sheetProps.onClosed());

    await waitFor(() => expect(done).toBe(true));
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockSetItemAsync).toHaveBeenCalledWith(LOCATION_PROMPT_SEEN_KEY, '1');
  });
});
