import React, { useEffect } from 'react';

import { render } from '@testing-library/react-native';

import { setOnboardingNavigationActive } from '@services/systemNavigation';

import { useOnboardingNavigationBar } from '../useOnboardingNavigationBar';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
jest.mock('@services/systemNavigation', () => ({
  setOnboardingNavigationActive: jest.fn(),
}));

const OnboardingRoute = () => {
  useOnboardingNavigationBar();
  return null;
};

describe('onboarding system navigation ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
  });

  it('restores other screens even when onboarding stays mounted behind them', () => {
    const route = render(<OnboardingRoute />);
    expect(setOnboardingNavigationActive).toHaveBeenLastCalledWith(true);

    mockFocused = false;
    route.rerender(<OnboardingRoute />);
    expect(setOnboardingNavigationActive).toHaveBeenLastCalledWith(false);

    mockFocused = true;
    route.rerender(<OnboardingRoute />);
    expect(setOnboardingNavigationActive).toHaveBeenLastCalledWith(true);

    route.unmount();
    expect(setOnboardingNavigationActive).toHaveBeenLastCalledWith(false);
    expect(setOnboardingNavigationActive).toHaveBeenCalledTimes(4);
  });

  it('does not change the window when an unfocused onboarding route mounts', () => {
    mockFocused = false;
    const route = render(<OnboardingRoute />);
    route.unmount();
    expect(setOnboardingNavigationActive).not.toHaveBeenCalled();
  });
});
