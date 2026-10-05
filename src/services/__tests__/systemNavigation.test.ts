import { Platform } from 'react-native';

import { requireNativeModule } from 'expo-modules-core';

import { logger } from '../logger';
import { setOnboardingNavigationActive } from '../systemNavigation';

jest.mock('expo-modules-core', () => ({ requireNativeModule: jest.fn() }));
jest.mock('../logger', () => ({ logger: { error: jest.fn() } }));

describe('system navigation platform boundary', () => {
  const originalOS = Platform.OS;
  const setOnboardingActive = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    setOnboardingActive.mockResolvedValue(undefined);
    jest.mocked(requireNativeModule).mockReturnValue({ setOnboardingActive });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('leaves iOS untouched without loading an Android-only module', () => {
    Platform.OS = 'ios';
    setOnboardingNavigationActive(true);
    setOnboardingNavigationActive(false);
    expect(requireNativeModule).not.toHaveBeenCalled();
  });

  it('sends both onboarding entry and exit to the Android window', () => {
    Platform.OS = 'android';
    setOnboardingNavigationActive(true);
    setOnboardingNavigationActive(false);
    expect(setOnboardingActive.mock.calls).toEqual([[true], [false]]);
  });

  it('handles a failed native window update without an unhandled rejection', async () => {
    Platform.OS = 'android';
    const error = new Error('No activity');
    setOnboardingActive.mockRejectedValueOnce(error);
    setOnboardingNavigationActive(true);
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(
      'Unable to update onboarding system navigation',
      error,
    );
  });
});
