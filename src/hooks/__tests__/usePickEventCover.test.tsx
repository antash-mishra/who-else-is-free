import { act, renderHook } from '@testing-library/react-native';

import { usePickEventCover } from '../usePickEventCover';

const mockPermission = jest.fn();
const mockPick = jest.fn();
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue({ granted: true });
});
it('preserves the prior photo on cancel or denied permission', async () => {
  const select = jest.fn();
  const { result } = renderHook(() => usePickEventCover(select));
  mockPick.mockResolvedValue({ canceled: true, assets: null });
  await act(async () => {
    await result.current.pick();
  });
  expect(select).not.toHaveBeenCalled();
  mockPermission.mockResolvedValue({ granted: false });
  await act(async () => {
    await result.current.pick();
  });
  expect(select).not.toHaveBeenCalled();
  expect(result.current.error).toContain('Allow photo access');
});
it('selects a local preview and reports oversized or failed picks', async () => {
  const select = jest.fn();
  const { result } = renderHook(() => usePickEventCover(select));
  mockPick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///test.jpg', mimeType: 'image/jpeg', fileSize: 100 }],
  });
  await act(async () => {
    await result.current.pick();
  });
  expect(select).toHaveBeenCalledWith({ uri: 'file:///test.jpg', mimeType: 'image/jpeg' });
  mockPick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///large.jpg', fileSize: 6 * 1024 * 1024 }],
  });
  await act(async () => {
    await result.current.pick();
  });
  expect(select).toHaveBeenCalledTimes(1);
  expect(result.current.error).toContain('5 MiB');
  mockPick.mockRejectedValue(new Error('native unavailable'));
  await act(async () => {
    await result.current.pick();
  });
  expect(result.current.error).toContain('Unable to open');
});
