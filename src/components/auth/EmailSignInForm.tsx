/* global setInterval, clearInterval */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { ApiError } from '@api/errors';
import { AppButton, TextField } from '@components/ui';
import { useAuth, type AuthUser } from '@context/AuthContext';
import { triggerHaptic } from '@services/haptics';

import styles from './EmailSignInForm.styles';

type EmailSignInFormProps = {
  onBack: () => void;
  onSignedIn: (user: AuthUser) => void;
};

type Step = 'email' | 'code';

const CODE_LENGTH = 6;
const CODE_CELLS = Array.from({ length: CODE_LENGTH }, (_, index) => index);
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
  const [isCodeFocused, setIsCodeFocused] = useState(false);
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
        triggerHaptic('error');
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
      setError(null);
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
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Sign in with email
          </Text>
          <Text style={styles.description}>
            {"We'll send you a 6-digit code. No password needed."}
          </Text>
        </View>
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
        <View style={styles.buttons}>
          <AppButton
            label="Send code"
            onPress={() => void sendCode()}
            loading={isSending}
            disabled={isSending}
            disabledAppearance="dimmed"
            haptic="submit"
            testID="email-sign-in-send"
          />
          <AppButton
            label="Back"
            variant="secondary"
            onPress={onBack}
            testID="email-sign-in-back"
          />
        </View>
      </View>
    );
  }

  const canResend = resendSeconds === 0 && !isSending && !isVerifying;
  // An error outlines every box; otherwise the box the next digit lands in.
  const activeCell = isCodeFocused && !error ? Math.min(code.length, CODE_LENGTH - 1) : -1;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Check your email
        </Text>
        <Text style={styles.description}>
          Enter the 6-digit code we sent to <Text style={styles.emphasis}>{sentTo}</Text>
        </Text>
      </View>
      <View style={styles.field}>
        <View>
          <View
            style={styles.codeRow}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {CODE_CELLS.map((index) => (
              <View
                key={index}
                testID={`email-sign-in-code-cell-${index}`}
                style={[
                  styles.codeCell,
                  index === activeCell && styles.codeCellActive,
                  error ? styles.codeCellError : null,
                ]}
              >
                <Text style={styles.codeDigit}>{code[index] ?? ''}</Text>
              </View>
            ))}
          </View>
          <TextInput
            testID="email-sign-in-code"
            value={code}
            onChangeText={onChangeCode}
            onFocus={() => setIsCodeFocused(true)}
            onBlur={() => setIsCodeFocused(false)}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            autoFocus
            caretHidden
            selectionColor="transparent"
            accessibilityLabel="6-digit code"
            style={styles.codeInput}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        <View style={styles.buttons}>
          <AppButton
            label="Continue"
            onPress={() => void submitCode(code)}
            loading={isVerifying}
            disabled={code.length < CODE_LENGTH || isVerifying}
            disabledAppearance="dimmed"
            haptic="submit"
            testID="email-sign-in-verify"
          />
          <AppButton
            label="Use a different email"
            variant="secondary"
            onPress={useDifferentEmail}
            disabled={isVerifying}
            testID="email-sign-in-change-email"
          />
        </View>
        <View style={styles.resendRow}>
          <Text style={styles.resendHint}>{"Didn't get it?"}</Text>
          <Pressable
            testID="email-sign-in-resend"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canResend }}
            disabled={!canResend}
            hitSlop={8}
            onPress={() => void sendCode()}
          >
            <Text style={[styles.resendAction, !canResend && styles.resendActionDisabled]}>
              {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default EmailSignInForm;
