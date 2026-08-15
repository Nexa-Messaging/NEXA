import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppButton, AppText, Card, Screen } from '@/components/ui';
import { colors, gradients, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatDateJoined } from '@/utils/format';

export default function ProfileScreen() {
  const { profile, user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const onSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    if (result.error) {
      setSignOutError(result.error);
    }
    setSigningOut(false);
    // On success the protected guard redirects to the welcome screen.
  };

  const username = profile?.username ?? user?.email;

  return (
    <Screen padding={0} blobbed>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <LinearGradient
          colors={gradients.violet}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <AppText variant="caption" weight="bold" color={colors.surface} style={styles.heroLabel}>
            YOUR SPACE ✦
          </AppText>
          <AppText variant="display" weight="bold" color={colors.surface}>
            Profile
          </AppText>
        </LinearGradient>

        <Card variant="pop" style={styles.card}>
          <View style={styles.identity}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={84} ring />
            <View style={styles.identityText}>
              <AppText variant="heading" weight="bold">
                {profile?.display_name ?? 'Loading…'}
              </AppText>
              <AppText variant="body" tone="secondary">
                @{username}
              </AppText>
              <View style={styles.joinedSticker}>
                <AppText variant="caption" weight="bold" color={colors.mint}>
                  {formatDateJoined(profile?.created_at)}
                </AppText>
              </View>
            </View>
          </View>

          {profile?.bio ? (
            <AppText variant="body" color={colors.text} style={styles.bio}>
              {profile.bio}
            </AppText>
          ) : (
            <AppText variant="body" tone="muted" style={styles.bio}>
              No bio yet — tell people who you are.
            </AppText>
          )}

          <ProfileInfoRow icon="school-outline" label="School" value={profile?.school} />
          <ProfileInfoRow icon="layers-outline" label="Department" value={profile?.department} />
          <ProfileInfoRow icon="trending-up-outline" label="Level" value={profile?.level} />
        </Card>

        <AppButton
          title="Edit profile"
          variant="gradient"
          size="md"
          fullWidth
          style={{ marginTop: spacing.md }}
          onPress={() => router.push('/edit-profile')}
        />
        <AppButton
          title="View public profile"
          variant="outline"
          size="md"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => {
            if (profile?.username) {
              router.push(`/users/${profile.username}`);
            }
          }}
        />

        <AppButton
          title="Friends"
          variant="secondary"
          size="md"
          fullWidth
          style={{ marginTop: spacing.sm }}
          onPress={() => router.push('/friends')}
        />

        {signOutError ? (
          <AppText variant="caption" tone="danger" align="center" style={{ marginTop: spacing.md }}>
            {signOutError}
          </AppText>
        ) : null}

        <AppButton
          title="Log out"
          variant="ghost"
          size="md"
          fullWidth
          loading={signingOut}
          onPress={onSignOut}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </Screen>
  );
}

function ProfileInfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
}) {
  if (!value) {
    return null;
  }
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <AppText variant="label" tone="secondary" style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText variant="body" weight="semibold" style={styles.infoValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    padding: spacing.lg,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  joinedSticker: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.mintSoft,
  },
  bio: {
    marginTop: spacing.md,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
  },
});