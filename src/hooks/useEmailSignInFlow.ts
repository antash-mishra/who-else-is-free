/* global setInterval, clearInterval */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError } from '@api/errors';
import { useAuth, type AuthUser } from '@context/AuthContext';
import { triggerHaptic } from '@services/haptics';

/** What the sign-in sheet shows: the provider buttons, then the two email steps. */
export type SignInView = 'providers' | 'email' | 'code';

export const EMAIL_CODE_LENGTH = 6;
// Matches the server's one-code-per-minute limit for an address.
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';
const SEND_FAILED_MESSAGE = "We couldn't send the code. Please try again.";
const SIGN_IN_FAILED_MESSAGE = 'Unable to sign in. Please try again.';

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export type EmailSignInFlow = {
  view: SignInView;
  email: string;
  code: string;
  sentTo: string;
  error: string | null;
  isSending: boolean;
  isVerifying: boolean;
  resendSeconds: number;
  showEmail: () => void;
  /** Back to the provider buttons with an empty form, e.g. once the sheet has closed. */
  reset: () => void;
  changeEmail: (text: string) => void;
  sendCode: () => Promise<void>;
  changeCode: (text: string, onSignedIn: (user: AuthUser) => void) => void;
  submitCode: (value: string, onSignedIn: (user: AuthUser) => void) => Promise<void>;
};

/**
 * State for the email sign-in steps. It lives with whoever owns the sign-in sheet,
 * not inside the sheet's content: the sheet re-keys its content on every step so it
 * can morph between them, which remounts everything rendered inside it.
 */
export const useEmailSignInFlow = (): EmailSignInFlow => {
  const { startEmailSignIn, verifyEmailCode } = useAuth();
  const [view, setView] = useState<SignInView>('providers');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verifyingRef = useRef(false);

  const isCountingDown = resendSeconds > 0;
  useEffect(() => {
    if (!isCountingDown) {
      return undefined;
    }
    const timer = setInterval(() => {
      setResendSeconds((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isCountingDown]);

  const showEmail = useCallback(() => setView('email'), []);

  const reset = useCallback(() => {
    setView('providers');
    setEmail('');
    setCode('');
    setSentTo('');
    setError(null);
    setResendSeconds(0);
  }, []);

  const changeEmail = useCallback((text: string) => {
    setEmail(text);
    setError(null);
  }, []);

  const sendCode = useCallback(async () => {
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setError(null);
    if (address === sentTo && resendSeconds > 0) {
      // The code already sent to this address is still the newest one.
      setView('code');
      return;
    }
    setIsSending(true);
    try {
      await startEmailSignIn(address);
      setSentTo(address);
      setCode('');
      setView('code');
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(errorMessage(err, SEND_FAILED_MESSAGE));
    } finally {
      setIsSending(false);
    }
  }, [email, resendSeconds, sentTo, startEmailSignIn]);

  const submitCode = useCallback(
    async (value: string, onSignedIn: (user: AuthUser) => void) => {
      if (verifyingRef.current) {
        return;
      }
      verifyingRef.current = true;
      setIsVerifying(true);
      setError(null);
      try {
        const user = await verifyEmailCode(sentTo, value);
        onSignedIn(user);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'code_expired') {
          setCode('');
        }
        triggerHaptic('error');
        setError(errorMessage(err, SIGN_IN_FAILED_MESSAGE));
      } finally {
        verifyingRef.current = false;
        setIsVerifying(false);
      }
    },
    [sentTo, verifyEmailCode],
  );

  const changeCode = useCallback(
    (text: string, onSignedIn: (user: AuthUser) => void) => {
      const digits = text.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
      setCode(digits);
      setError(null);
      if (digits.length === EMAIL_CODE_LENGTH) {
        void submitCode(digits, onSignedIn);
      }
    },
    [submitCode],
  );

  return useMemo(
    () => ({
      view,
      email,
      code,
      sentTo,
      error,
      isSending,
      isVerifying,
      resendSeconds,
      showEmail,
      reset,
      changeEmail,
      sendCode,
      changeCode,
      submitCode,
    }),
    [
      changeCode,
      changeEmail,
      code,
      email,
      error,
      isSending,
      isVerifying,
      resendSeconds,
      reset,
      sendCode,
      sentTo,
      showEmail,
      submitCode,
      view,
    ],
  );
};
