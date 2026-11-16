/**
 * Tests for the Dev Login presets on the shared sign-in surface (issue #186)
 */

import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react-native';

import SignInButtons from '../SignInButtons';

let mockDevLoginEnabled = false;
let mockEmailSignInEnabled = true;
jest.mock('@constants/featureFlags', () => ({
  APPLE_SIGNIN_DEV_ALL_PLATFORMS: false,
  get DEV_LOGIN_ENABLED() {
    return mockDevLoginEnabled;
  },
  get EMAIL_SIGN_IN_ENABLED() {
    return mockEmailSignInEnabled;
  },
}));

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
    signInWithDevUser: jest.fn(),
    startEmailSignIn: jest.fn(),
    verifyEmailCode: jest.fn(),
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

describe('SignInButtons email sign-in', () => {
  beforeEach(() => {
    mockDevLoginEnabled = false;
    mockEmailSignInEnabled = true;
  });

  it('hides email sign-in until sending is configured for the build', async () => {
    mockEmailSignInEnabled = false;
    render(<SignInButtons />);

    expect(await screen.findByTestId('google-sign-in-button')).toBeTruthy();
    expect(screen.queryByTestId('email-sign-in-button')).toBeNull();
  });

  it('offers email sign-in next to the provider buttons', async () => {
    render(<SignInButtons />);

    expect(await screen.findByTestId('email-sign-in-button')).toBeTruthy();
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
  });

  it('swaps the provider buttons for the email form', async () => {
    render(<SignInButtons />);

    fireEvent.press(await screen.findByTestId('email-sign-in-button'));

    expect(screen.getByTestId('email-sign-in-input')).toBeTruthy();
    expect(screen.queryByTestId('google-sign-in-button')).toBeNull();

    fireEvent.press(screen.getByTestId('email-sign-in-close'));
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
  });
});
