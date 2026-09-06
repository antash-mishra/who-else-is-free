import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useViewerLocation } from '../useViewerLocation';

const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetLastKnownPositionAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockReverseGeocodeAsync = jest.fn();

jest.mock('expo-location', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForegroundPermissionsAsync(...args),
  getLastKnownPositionAsync: (...args: unknown[]) => mockGetLastKnownPositionAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
  reverseGeocodeAsync: (...args: unknown[]) => mockReverseGeocodeAsync(...args),
}));

describe('useViewerLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetLastKnownPositionAsync.mockResolvedValue({
      coords: { latitude: 53.3498, longitude: -6.2603 },
    });
    mockGetCurrentPositionAsync.mockResolvedValue(null);
    mockReverseGeocodeAsync.mockResolvedValue([{ isoCountryCode: 'IE' }]);
  });

  it('checks silently on mount and requests location only after the explicit action', async () => {
    const { result } = renderHook(() => useViewerLocation());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.permission).toBe('undetermined');
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
    expect(result.current.coords).toEqual({ latitude: 53.3498, longitude: -6.2603 });
    expect(result.current.countryCode).toBe('ie');
    expect(mockReverseGeocodeAsync).toHaveBeenCalledWith({ latitude: 53.3498, longitude: -6.2603 });
  });
  it('still prompts when Android reports denied but will show the dialog again', async () => {
    // expo-location records "we have asked before" in SharedPreferences, so after
    // a single denial it reports DENIED rather than UNDETERMINED forever. Android
    // will still show the dialog while canAskAgain is true, so gating on
    // UNDETERMINED alone means the app silently never asks again.
    mockGetForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });

    const { result } = renderHook(() => useViewerLocation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
  });

  it('still asks when denied with canAskAgain false, which a restored flag fakes', async () => {
    // Android auto-backup restores expo.modules.permissions.asked onto a fresh
    // install, so expo reports DENIED while shouldShowRequestPermissionRationale
    // is false because Android has genuinely never asked. That pair is
    // indistinguishable from a permanent denial, so it cannot be trusted: let
    // the OS decide. A genuinely blocked request is a no-op.
    mockGetForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });

    const { result } = renderHook(() => useViewerLocation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('denied');
    expect(result.current.coords).toBeNull();
  });

  it('never asks silently on mount, whatever the reported status', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });

    renderHook(() => useViewerLocation());

    await waitFor(() => expect(mockGetForegroundPermissionsAsync).toHaveBeenCalled());
    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does not prompt when the permission is already granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: false,
    });

    const { result } = renderHook(() => useViewerLocation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(result.current.permission).toBe('granted');
  });
});
