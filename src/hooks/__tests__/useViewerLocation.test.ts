import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useViewerLocation } from '../useViewerLocation';

const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetLastKnownPositionAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();

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
  });
});
