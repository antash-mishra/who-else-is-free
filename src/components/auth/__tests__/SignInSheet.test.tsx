import React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SignInSheet from '../SignInSheet';

const mockStartEmailSignIn = jest.fn();
const mockSheetProps: { contentKey?: string; onClosed?: () => void }[] = [];

jest.mock('@constants/featureFlags', () => ({
  APPLE_SIGNIN_DEV_ALL_PLATFORMS: false,
  DEV_LOGIN_ENABLED: false,
  EMAIL_SIGN_IN_ENABLED: true,
}));

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    isSigningIn: false,
    signInWithGoogle: jest.fn(),
    signInWithApple: jest.fn(),
    startEmailSignIn: mockStartEmailSignIn,
    verifyEmailCode: jest.fn(),
  }),
}));

// Records what the sheet is told, and renders its content like an open sheet.
jest.mock('@components/BottomSheetModal', () => {
  const MockSheet = (props: {
    contentKey?: string;
    onClosed?: () => void;
    children: React.ReactNode;
  }) => {
    mockSheetProps.push({ contentKey: props.contentKey, onClosed: props.onClosed });
    return props.children;
  };
  return MockSheet;
});

const lastSheetProps = () => mockSheetProps[mockSheetProps.length - 1];

describe('SignInSheet', () => {
  beforeEach(() => {
    mockSheetProps.length = 0;
    mockStartEmailSignIn.mockReset().mockResolvedValue(undefined);
  });

  it('names each step as the sheet content so the sheet morphs between them', async () => {
    render(<SignInSheet visible onClose={jest.fn()} />);
    expect(lastSheetProps().contentKey).toBe('providers');

    fireEvent.press(await screen.findByTestId('email-sign-in-button'));
    expect(lastSheetProps().contentKey).toBe('email');

    fireEvent.changeText(screen.getByTestId('email-sign-in-input'), 'asha@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-send'));
    });
    expect(lastSheetProps().contentKey).toBe('code');
    expect(screen.getByText('Verify your email')).toBeTruthy();
  });

  it('closes the sheet from the close button and starts over once it has closed', async () => {
    const onClose = jest.fn();
    render(<SignInSheet visible onClose={onClose} />);
    fireEvent.press(await screen.findByTestId('email-sign-in-button'));

    fireEvent.press(screen.getByTestId('email-sign-in-close'));
    expect(onClose).toHaveBeenCalled();

    act(() => lastSheetProps().onClosed?.());
    expect(lastSheetProps().contentKey).toBe('providers');
    expect(screen.getByTestId('google-sign-in-button')).toBeTruthy();
  });
});
