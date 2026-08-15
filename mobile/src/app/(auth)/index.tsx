import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, Screen } from '@/components/ui';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.logo}>
            <AppText variant="display" color={colors.surface} weight="bold">
              N
            </AppText>
          </View>
          <AppText variant="display" weight="bold" align="center" style={{ marginTop: spacing.md }}>
            NEXA
          </AppText>
          <AppText
            variant="body"
            color={colors.textSecondary}
            align="center"
            style={{ marginTop: spacing.xs }}
          >
            Connect with your campus — chats, stories and communities in one place.
          </AppText>
        </View>

        <View style={styles.actions}>
          <Link href="/register" asChild>
            <AppButton title="Register" size="lg" fullWidth />
          </Link>
          <Link href="/login" asChild>
            <AppButton
              title="Log in"
              variant="outline"
              size="lg"
              fullWidth
              style={{ marginTop: spacing.sm }}
            />
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  topSection: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    width: '100%',
  },
});