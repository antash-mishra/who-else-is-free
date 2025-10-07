import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import ScreenContainer from '@components/ScreenContainer';
import { useAuth } from '@context/AuthContext';
import { colors, spacing, typography } from '@theme/index';

const LoginScreen = () => {
  const { signIn, isSigningIn } = useAuth();
  const [email, setEmail] = useState('ava@example.com');
  const [password, setPassword] = useState('password123');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await signIn(trimmedEmail, password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isSigningIn || isSubmitting;

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Who Else is Free?</Text>
          <Text style={styles.subtitle}>Sign in to discover events and find your next hangout buddy.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              editable={!isLoading}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              editable={!isLoading}
            />
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Use one of the demo accounts to explore the app:</Text>
          <Text style={styles.footerTextLight}>ava@example.com / password123</Text>
          <Text style={styles.footerTextLight}>liam@example.com / welcome123</Text>
          <Text style={styles.footerTextLight}>sophia@example.com / secret123</Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1
  },
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm
  },
  title: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilyBold,
    color: colors.text,
    lineHeight: typography.lineHeight
  },
  subtitle: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
    lineHeight: typography.lineHeight
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md
  },
  field: {
    gap: spacing.xs
  },
  label: {
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium,
    color: colors.fieldLabel
  },
  input: {
    backgroundColor: colors.fieldBackground,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text
  },
  error: {
    color: '#B00020',
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium
  },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.buttonBackground,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    alignItems: 'center'
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: typography.body,
    fontFamily: typography.fontFamilyMedium
  },
  footer: {
    marginTop: 'auto',
    paddingBottom: spacing.xl,
    gap: spacing.xs
  },
  footerText: {
    textAlign: 'center',
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyMedium,
    color: colors.subText
  },
  footerTextLight: {
    textAlign: 'center',
    fontSize: typography.caption,
    fontFamily: typography.fontFamilyRegular,
    color: colors.muted
  }
});

export default LoginScreen;
