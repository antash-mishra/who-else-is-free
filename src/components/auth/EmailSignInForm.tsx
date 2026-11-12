/* global setInterval, clearInterval */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import { ApiError } from '@api/errors';
import { AppButton, AppText, TextField } from '@components/ui';
import { useAuth, type AuthUser } from '@context/AuthContext';
import { spacing } from '@theme/index';

type EmailSignInFormProps = {
  onBack: () => void;
  onSignedIn: (user: AuthUser) => void;
};

type Step = 'email' | 'code';

const CODE_LENGTH = 6;
// Matches the server's one-code-per-minute limit for an address.
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.';
const SEND_FAILED_MESSAGE = "We couldn't send the code. Please try again.";
const SIGN_IN_FAILED_MESSAGE = 'Unable to sign in. Please try again.';

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Email address then emailed 6-digit code, shown in place of the provider buttons. */
const EmailSignInForm = ({ onBack, onSignedIn }: EmailSignInFormProps) => {
  const { startEmailSignIn, verifyEmailCode } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verifyingRef = useRef(false);
  const [sentTo, setSentTo] = useState('');

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

  const sendCode = useCallback(async () => {
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) {
      setError(INVALID_EMAIL_MESSAGE);
      return;
    }
    setError(null);
    if (address === sentTo && resendSeconds > 0) {
      // The code already sent to this address is still the newest one.
      setStep('code');
      return;
    }
    setIsSending(true);
    try {
      await startEmailSignIn(address);
      setSentTo(address);
      setCode('');
      setStep('code');
      setResendSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(errorMessage(err, SEND_FAILED_MESSAGE));
    } finally {
      setIsSending(false);
    }
  }, [email, resendSeconds, sentTo, startEmailSignIn]);

  const submitCode = useCallback(
    async (value: string) => {
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
        setError(errorMessage(err, SIGN_IN_FAILED_MESSAGE));
      } finally {
        verifyingRef.current = false;
        setIsVerifying(false);
      }
    },
    [onSignedIn, sentTo, verifyEmailCode],
  );

  const onChangeCode = useCallback(
    (text: string) => {
      const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
      setCode(digits);
      if (digits.length === CODE_LENGTH) {
        void submitCode(digits);
      }
    },
    [submitCode],
  );

  const useDifferentEmail = useCallback(() => {
    setError(null);
    setCode('');
    setStep('email');
  }, []);

  if (step === 'email') {
    return (
      <View style={styles.container}>
        <AppText variant="body">{"Enter your email and we'll send you a 6-digit code."}</AppText>
        <TextField
          testID="email-sign-in-input"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void sendCode()}
          autoFocus
          errorText={error}
          accessibilityLabel="Email address"
        />
        <AppButton
          label="Send code"
          onPress={() => void sendCode()}
          loading={isSending}
          disabled={isSending}
          testID="email-sign-in-send"
        />
        <AppButton label="Back" variant="ghost" onPress={onBack} testID="email-sign-in-back" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppText variant="body">{`Enter the 6-digit code we sent to ${sentTo}`}</AppText>
      <TextField
        testID="email-sign-in-code"
        value={code}
        onChangeText={onChangeCode}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoFocus
        editable={!isVerifying}
        errorText={error}
        accessibilityLabel="6-digit code"
      />
      <AppButton
        label={resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
        variant="ghost"
        onPress={() => void sendCode()}
        disabled={resendSeconds > 0 || isSending || isVerifying}
        testID="email-sign-in-resend"
      />
      <AppButton
        label="Use a different email"
        variant="ghost"
        onPress={useDifferentEmail}
        disabled={isVerifying}
        testID="email-sign-in-change-email"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
});

export default EmailSignInForm;
