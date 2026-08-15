import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, GradientText, Screen } from '@/components/ui';
import { AppText } from '@/components/ui/AppText';
import { colors, gradients, radius, shadows, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';

export default function WelcomeScreen() {
  const { colors } = useAppTheme();
  return (
    <Screen blobbed>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.badgeRow}>
            <View style={[styles.sticker, { backgroundColor: colors.pinkSoft }]}>
              <AppText variant="caption" weight="bold" color={colors.pink}>
                CAMPUS
              </AppText>
            </View>
            <View style={[styles.sticker, { backgroundColor: colors.mintSoft }]}>
              <AppText variant="caption" weight="bold" color={colors.mint}>
                SOCIAL
              </AppText>
            </View>
            <View style={[styles.sticker, { backgroundColor: colors.sunSoft }]}>
              <AppText variant="caption" weight="bold" color={colors.sun}>
                LIVE
              </AppText>
            </View>
          </View>

          <LinearGradient
            colors={gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <AppText variant="display" color={colors.surface} weight="bold">
              N
            </AppText>
          </LinearGradient>

          <GradientText variant="display" weight="bold" align="center" style={styles.name}>
            NEXA
          </GradientText>
          <AppText
            variant="body"
            tone="secondary"
            align="center"
            style={{ marginTop: spacing.xs, lineHeight: 24 }}
          >
            Connect with your campus — chats, stories and communities in one
            place, all with a splash of colour.
          </AppText>
        </View>

        <View style={styles.actions}>
          <Link href="/register" asChild>
            <AppButton title="Make your mark" variant="gradient" size="lg" fullWidth />
          </Link>
          <Link href="/login" asChild>
            <AppButton
              title="I already have an account"
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
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  sticker: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    transform: [{ rotate: '-4deg' }],
  },
  logo: {
    width: 104,
    height: 104,
    borderRadius: radius.blob,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.pop,
  },
  name: {
    marginTop: spacing.md,
  },
  actions: {
    width: '100%',
  },
});