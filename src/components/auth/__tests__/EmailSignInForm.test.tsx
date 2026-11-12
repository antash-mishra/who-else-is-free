import React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@api/errors';

import EmailSignInForm from '../EmailSignInForm';

const mockStartEmailSignIn = jest.fn();
const mockVerifyEmailCode = jest.fn();

jest.mock('@context/AuthContext', () => ({
  useAuth: () => ({
    isSigningIn: false,
    startEmailSignIn: mockStartEmailSignIn,
    verifyEmailCode: mockVerifyEmailCode,
  }),
}));

const signedInUser = { id: 9, name: 'asha', email: 'asha@example.com', profileComplete: false };

const renderForm = () => {
  const onBack = jest.fn();
  const onSignedIn = jest.fn();
  render(<EmailSignInForm onBack={onBack} onSignedIn={onSignedIn} />);
  return { onBack, onSignedIn };
};

const goToCodeStep = async () => {
  fireEvent.changeText(screen.getByTestId('email-sign-in-input'), ' asha@example.com ');
  await act(async () => {
    fireEvent.press(screen.getByTestId('email-sign-in-send'));
  });
  await screen.findByTestId('email-sign-in-code');
};

describe('EmailSignInForm', () => {
  beforeEach(() => {
    mockStartEmailSignIn.mockReset().mockResolvedValue(undefined);
    mockVerifyEmailCode.mockReset().mockResolvedValue(signedInUser);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('titles each step like the other sheets', async () => {
    renderForm();
    expect(screen.getByText('Sign in with email')).toBeTruthy();
    expect(screen.getByText("We'll send you a 6-digit code. No password needed.")).toBeTruthy();

    await goToCodeStep();
    expect(screen.getByText('Check your email')).toBeTruthy();
  });

  it('shows each typed digit in its own box', async () => {
    renderForm();
    await goToCodeStep();

    fireEvent.changeText(screen.getByTestId('email-sign-in-code'), '12a3');

    expect(
      screen.getByTestId('email-sign-in-code-cell-0', { includeHiddenElements: true }),
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('email-sign-in-code-cell-1', { includeHiddenElements: true }),
    ).toHaveTextContent('2');
    expect(
      screen.getByTestId('email-sign-in-code-cell-2', { includeHiddenElements: true }),
    ).toHaveTextContent('3');
    expect(
      screen.getByTestId('email-sign-in-code-cell-3', { includeHiddenElements: true }),
    ).toHaveTextContent('');
    expect(
      screen.queryByTestId('email-sign-in-code-cell-6', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('enables Continue only with six digits and retries a wrong code', async () => {
    mockVerifyEmailCode.mockRejectedValueOnce(
      new ApiError("That code isn't right. Check it and try again.", 401, { code: 'code_invalid' }),
    );
    const { onSignedIn } = renderForm();
    await goToCodeStep();

    expect(screen.getByTestId('email-sign-in-verify').props.accessibilityState?.disabled).toBe(
      true,
    );
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-sign-in-code'), '000000');
    });
    await screen.findByText("That code isn't right. Check it and try again.");

    expect(screen.getByTestId('email-sign-in-code').props.editable).not.toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-verify'));
    });
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(signedInUser));
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid address without calling the server', async () => {
    renderForm();
    fireEvent.changeText(screen.getByTestId('email-sign-in-input'), 'not-an-email');
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-send'));
    });

    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(mockStartEmailSignIn).not.toHaveBeenCalled();
  });

  it('sends a code and shows the address it went to', async () => {
    renderForm();
    await goToCodeStep();

    expect(mockStartEmailSignIn).toHaveBeenCalledWith('asha@example.com');
    expect(screen.getByText('Enter the 6-digit code we sent to asha@example.com')).toBeTruthy();
  });

  it('shows the server message when sending fails', async () => {
    mockStartEmailSignIn.mockRejectedValueOnce(
      new ApiError('Too many codes requested. Wait a minute and try again.', 429),
    );
    renderForm();
    fireEvent.changeText(screen.getByTestId('email-sign-in-input'), 'asha@example.com');
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-send'));
    });

    expect(screen.getByText('Too many codes requested. Wait a minute and try again.')).toBeTruthy();
    expect(screen.queryByTestId('email-sign-in-code')).toBeNull();
  });

  it('submits once when six digits are entered and reports the user', async () => {
    const { onSignedIn } = renderForm();
    await goToCodeStep();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-sign-in-code'), '123456');
    });

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(signedInUser));
    expect(mockVerifyEmailCode).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmailCode).toHaveBeenCalledWith('asha@example.com', '123456');
  });

  it('keeps a wrong code and shows why', async () => {
    mockVerifyEmailCode.mockRejectedValueOnce(
      new ApiError("That code isn't right. Check it and try again.", 401, { code: 'code_invalid' }),
    );
    renderForm();
    await goToCodeStep();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-sign-in-code'), '000000');
    });

    expect(await screen.findByText("That code isn't right. Check it and try again.")).toBeTruthy();
    expect(screen.getByTestId('email-sign-in-code').props.value).toBe('000000');
  });

  it('clears an expired code', async () => {
    mockVerifyEmailCode.mockRejectedValueOnce(
      new ApiError('This code has expired. Request a new one.', 401, { code: 'code_expired' }),
    );
    renderForm();
    await goToCodeStep();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-sign-in-code'), '123456');
    });

    expect(await screen.findByText('This code has expired. Request a new one.')).toBeTruthy();
    expect(screen.getByTestId('email-sign-in-code').props.value).toBe('');
  });

  it('waits out the server per-address window before enabling resend', async () => {
    jest.useFakeTimers();
    renderForm();
    await goToCodeStep();

    expect(screen.getByText('Resend in 60s')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(59_000);
    });
    expect(screen.getByTestId('email-sign-in-resend').props.accessibilityState?.disabled).toBe(
      true,
    );

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('Resend code')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-resend'));
    });
    expect(mockStartEmailSignIn).toHaveBeenCalledTimes(2);
  });

  it('keeps the resend countdown when switching email and back to the same address', async () => {
    jest.useFakeTimers();
    renderForm();
    await goToCodeStep();
    fireEvent.press(screen.getByTestId('email-sign-in-change-email'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('email-sign-in-send'));
    });

    expect(mockStartEmailSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('email-sign-in-code')).toBeTruthy();
  });

  it('returns to the email step keeping the address', async () => {
    renderForm();
    await goToCodeStep();

    fireEvent.press(screen.getByTestId('email-sign-in-change-email'));

    expect(screen.getByTestId('email-sign-in-input').props.value).toBe(' asha@example.com ');
  });

  it('calls onBack from the email step', () => {
    const { onBack } = renderForm();
    fireEvent.press(screen.getByTestId('email-sign-in-back'));
    expect(onBack).toHaveBeenCalled();
  });
});
