import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppText, FormField, GradientText, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { isUsernameTaken } from '@/lib/profiles';
import {
  normalizeUsername,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/utils/validation';

interface RegisterFormErrors {
  displayName?: string;
  username?: string;
  email?: string;
  password?: string;
}

export default function RegisterScreen() {
  const { colors } = useAppTheme();
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingEmailConfirmation, setAwaitingEmailConfirmation] = useState(false);

  const updateField = (field: keyof RegisterFormErrors, value: string) => {
    if (field === 'displayName') setDisplayName(value);
    else if (field === 'username') setUsername(value);
    else if (field === 'email') setEmail(value);
    else setPassword(value);

    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
  };

  const onSubmit = async () => {
    const nextErrors: RegisterFormErrors = {
      displayName: validateDisplayName(displayName),
      username: validateUsername(username),
      email: validateEmail(email),
      password: validatePassword(password),
    };

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    // Friendly duplicate check before hitting the sign-up endpoint. The DB
    // unique constraint remains the source of truth (race-safe).
    const normalizedUsername = normalizeUsername(username);
    if (await isUsernameTaken(normalizedUsername)) {
      setErrors((current) => ({ ...current, username: 'That username is already taken.' }));
      setSubmitting(false);
      return;
    }

    const result = await signUp({ email, password, displayName, username: normalizedUsername });

    if (result.error) {
      setFormError(result.error);
      setSubmitting(false);
      return;
    }

    if (result.needsEmailConfirmation) {
      setAwaitingEmailConfirmation(true);
      setSubmitting(false);
      return;
    }

    router.replace('/home');
  };

  if (awaitingEmailConfirmation) {
    return (
      <Screen blobbed centered>
        <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.confirmIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="mail-unread-outline" size={36} color={colors.primary} />
          </View>
          <GradientText variant="heading" weight="bold" align="center" style={{ marginTop: spacing.md }}>
            Check your email
          </GradientText>
          <AppText
            variant="body"
            tone="secondary"
            align="center"
            style={{ marginTop: spacing.xs, lineHeight: 22 }}
          >
            We sent a confirmation link to {email.trim().toLowerCase()}. Verify your email, then log
            in.
          </AppText>
          <Link href="/login" asChild>
            <AppButton title="Go to login" variant="gradient" size="lg" fullWidth style={{ marginTop: spacing.lg }} />
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen blobbed padding={0}>
      <View style={styles.header}>
        <Link href="/" asChild>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        </Link>
        <AppText variant="heading" weight="bold">
          Register
        </AppText>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <GradientText variant="heading" weight="bold">
          Join NEXA
        </GradientText>
        <AppText
          variant="body"
          tone="secondary"
          style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}
        >
          Create your account to connect with your campus.
        </AppText>

        {formError ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <AppText variant="label" tone="danger" style={styles.errorBannerText}>
              {formError}
            </AppText>
          </View>
        ) : null}

        <FormField
          label="Display name"
          value={displayName}
          onChangeText={(value) => updateField('displayName', value)}
          error={errors.displayName}
          placeholder="e.g. Ada Okonkwo"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

        <FormField
          label="Username"
          value={username}
          onChangeText={(value) => updateField('username', value)}
          error={errors.username}
          placeholder="e.g. ada_okonkwo"
          hint="3-20 characters: letters, numbers, underscores."
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />

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
          placeholder="At least 8 characters"
          hint="Use at least 8 characters."
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        <AppButton
          title="Create account"
          variant="gradient"
          size="lg"
          fullWidth
          loading={submitting}
          onPress={onSubmit}
          style={{ marginTop: spacing.sm }}
        />

        <View style={styles.footer}>
          <AppText variant="body" tone="secondary" align="center">
            Already have an account?
          </AppText>
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="body" color={colors.primary} weight="bold">
                {' '}
                Log in
              </AppText>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
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
    paddingBottom: spacing.xl,
  },
  confirmCard: {
    borderRadius: radius.xxl,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  confirmIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.blob,
    alignItems: 'center',
    justifyContent: 'center',
  },
});