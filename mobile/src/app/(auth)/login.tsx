import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, FormField, GradientText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { validateEmail, validatePassword } from '@/utils/validation';

interface LoginFormErrors {
  email?: string;
  password?: string;
}

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: keyof LoginFormErrors, value: string) => {
    if (field === 'email') {
      setEmail(value);
    } else {
      setPassword(value);
    }
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  };

  const onSubmit = async () => {
    const nextErrors: LoginFormErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };

    if (nextErrors.email || nextErrors.password) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await signIn(email, password);

    if (result.error) {
      setFormError(result.error);
      setSubmitting(false);
      return;
    }

    // Session is now set; protected routing takes over, this is just explicit.
    router.replace('/home');
  };

  return (
    <Screen blobbed padding={0}>
      <View style={styles.header}>
        <Link href="/" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        </Link>
        <AppText variant="heading" weight="bold">
          Log in
        </AppText>
        <View style={styles.backButton} />
      </View>

      <View style={styles.body}>
        <GradientText variant="heading" weight="bold">
          Welcome back
        </GradientText>
        <AppText variant="body" tone="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
          Log in to continue to your campus.
        </AppText>

        {formError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="label" tone="danger" style={styles.errorBannerText}>
              {formError}
            </AppText>
          </View>
        ) : null}

        <FormField
          label="Email"
          value={email}
          onChangeText={(value) => updateField('email', value)}
          error={errors.email}
          placeholder="you@school.edu"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <FormField
          label="Password"
          value={password}
          onChangeText={(value) => updateField('password', value)}
          error={errors.password}
          secure
          placeholder="Your password"
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <AppButton
          title="Log in"
          variant="gradient"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={onSubmit}
          style={{ marginTop: spacing.sm }}
        />

        <View style={styles.footer}>
          <AppText variant="body" tone="secondary" align="center">
            New to NEXA?
          </AppText>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="body" color={colors.primary} weight="bold">
                {' '}
                Create an account
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE9ED',
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    marginLeft: spacing.xs,
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
  },
});