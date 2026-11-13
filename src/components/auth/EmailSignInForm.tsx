import { useState } from 'react';

import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { SheetHeader, useIsOutgoingSheetLayer } from '@components/sheets';
import { AppButton, TextField } from '@components/ui';
import type { AuthUser } from '@context/AuthContext';
import { EMAIL_CODE_LENGTH, type EmailSignInFlow } from '@hooks/useEmailSignInFlow';

import styles from './EmailSignInForm.styles';

type EmailSignInFormProps = {
  /** Owned by whoever owns the sheet, so its state survives the sheet's step morph. */
  flow: EmailSignInFlow;
  /** Closes the surrounding sheet from the header's close button; falls back to `flow.reset`. */
  onClose?: () => void;
  onSignedIn: (user: AuthUser) => void;
};

const CODE_CELLS = Array.from({ length: EMAIL_CODE_LENGTH }, (_, index) => index);

/** Email address then emailed 6-digit code, shown in place of the provider buttons. */
const EmailSignInForm = ({ flow, onClose, onSignedIn }: EmailSignInFormProps) => {
  const [isCodeFocused, setIsCodeFocused] = useState(false);
  // The copy of the previous step fading out during a sheet morph must not take
  // focus, or it would pull the keyboard back from the step fading in.
  const autoFocus = !useIsOutgoingSheetLayer();
  const { code, error, isSending, isVerifying, resendSeconds } = flow;
  const close = onClose ?? flow.reset;

  if (flow.view !== 'code') {
    return (
      <View style={styles.container}>
        <View style={styles.sheetHeader}>
          <SheetHeader
            title="Continue with email"
            onClose={close}
            closeTestID="email-sign-in-close"
            description={
              <Text style={styles.description}>{"We'll email you a 6-digit code."}</Text>
            }
          />
        </View>
        <TextField
          testID="email-sign-in-input"
          value={flow.email}
          onChangeText={flow.changeEmail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          // No email autofill: iOS shows and hides its suggestion bar ("Hide My Email",
          // saved addresses) as matches come and go while typing, resizing the keyboard
          // and bouncing the sheet that sits on it.
          autoComplete="off"
          textContentType="none"
          returnKeyType="send"
          onSubmitEditing={() => void flow.sendCode()}
          autoFocus={autoFocus}
          errorText={error}
          accessibilityLabel="Email address"
        />
        <AppButton
          label="Send code"
          onPress={() => void flow.sendCode()}
          loading={isSending}
          disabled={isSending}
          disabledAppearance="dimmed"
          haptic="submit"
          testID="email-sign-in-send"
        />
      </View>
    );
  }

  const canResend = resendSeconds === 0 && !isSending && !isVerifying;
  // An error outlines every box; otherwise the box the next digit lands in.
  const activeCell = isCodeFocused && !error ? Math.min(code.length, EMAIL_CODE_LENGTH - 1) : -1;

  return (
    <View style={styles.container}>
      <View style={styles.sheetHeader}>
        <SheetHeader
          title="Verify your email"
          onClose={close}
          closeTestID="email-sign-in-close"
          description={
            <Text style={styles.description}>Enter the 6-digit code we sent to {flow.sentTo}</Text>
          }
        />
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
            onChangeText={(text) => flow.changeCode(text, onSignedIn)}
            onFocus={() => setIsCodeFocused(true)}
            onBlur={() => setIsCodeFocused(false)}
            keyboardType="number-pad"
            maxLength={EMAIL_CODE_LENGTH}
            textContentType="oneTimeCode"
            autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
            autoFocus={autoFocus}
            caretHidden
            selectionColor="transparent"
            accessibilityLabel="6-digit code"
            style={styles.codeInput}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        <AppButton
          label="Continue"
          onPress={() => void flow.submitCode(code, onSignedIn)}
          loading={isVerifying}
          disabled={code.length < EMAIL_CODE_LENGTH || isVerifying}
          disabledAppearance="dimmed"
          haptic="submit"
          testID="email-sign-in-verify"
        />
        <View style={styles.resendRow}>
          <Text style={styles.resendHint}>{"Didn't get it?"}</Text>
          <Pressable
            testID="email-sign-in-resend"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canResend }}
            disabled={!canResend}
            hitSlop={8}
            onPress={() => void flow.sendCode()}
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
