/**
 * Tests for the Dev Login presets on the shared sign-in surface (issue #186)
 */

import React from 'react';

import { render, screen } from '@testing-library/react-native';

import SignInButtons from '../SignInButtons';

let mockDevLoginEnabled = false;
jest.mock('@constants/featureFlags', () => ({
  APPLE_SIGNIN_DEV_ALL_PLATFORMS: false,
  get DEV_LOGIN_ENABLED() {
    return mockDevLoginEnabled;
  },
}));

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
    signInWithDevUser: jest.fn(),
  }),
}));

describe('SignInButtons dev login presets', () => {
  beforeEach(() => {
    mockDevLoginEnabled = false;
  });

  it('shows only the provider buttons when dev login is off', async () => {
    render(<SignInButtons />);

    expect(await screen.findByTestId('google-sign-in-button')).toBeTruthy();
    const devLoginTestIDs = screen
      .queryAllByTestId(/^dev-login-button/)
      .map((node) => node.props.testID);
    expect(devLoginTestIDs).toEqual([]);
  });

  it('adds the dev login presets when dev login is on', async () => {
    mockDevLoginEnabled = true;
    render(<SignInButtons />);

    expect(await screen.findByTestId('google-sign-in-button')).toBeTruthy();
    expect(screen.getByTestId('dev-login-button')).toBeTruthy();
  });
});
