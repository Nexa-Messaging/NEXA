import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppButton, AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
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
    <Screen padding={0}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <AppText variant="heading" weight="bold">
          Profile
        </AppText>

        <View style={styles.card}>
          <View style={styles.identity}>
            <Avatar uri={profile?.avatar_url} name={profile?.display_name} size={80} />
            <View style={styles.identityText}>
              <AppText variant="heading" weight="bold">
                {profile?.display_name ?? 'Loading…'}
              </AppText>
              <AppText variant="body" color={colors.textSecondary}>
                @{username}
              </AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {formatDateJoined(profile?.created_at)}
              </AppText>
            </View>
          </View>

          {profile?.bio ? (
            <AppText variant="body" color={colors.text} style={styles.bio}>
              {profile.bio}
            </AppText>
          ) : null}

          <ProfileInfoRow icon="school-outline" label="School" value={profile?.school} />
          <ProfileInfoRow icon="layers-outline" label="Department" value={profile?.department} />
          <ProfileInfoRow icon="trending-up-outline" label="Level" value={profile?.level} />
        </View>

        <AppButton
          title="Edit profile"
          variant="primary"
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
          <AppText variant="caption" color={colors.danger} align="center" style={{ marginTop: spacing.md }}>
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
      <Ionicons name={icon} size={18} color={colors.primary} />
      <AppText variant="label" color={colors.textSecondary} style={styles.infoLabel}>
        {label}
      </AppText>
      <AppText variant="body" weight="medium" style={styles.infoValue} numberOfLines={1}>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  identityText: {
    flex: 1,
    marginLeft: spacing.md,
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
  infoLabel: {
    marginLeft: spacing.xs,
    marginRight: spacing.sm,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
  },
});