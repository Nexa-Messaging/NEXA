import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FriendStatusActions } from '@/components/FriendStatusActions';
import { ReportSheet } from '@/components/ReportSheet';
import { AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useFriendStatus } from '@/hooks/useFriendStatus';
import { useAuth , fetchProfileByUsername } from '@/lib/auth';
import { startConversationWith } from '@/lib/messaging';
import { reportUser , ReportCategory } from '@/lib/moderation';
import { Profile } from '@/types/database';
import { formatDateJoined } from '@/utils/format';

export default function PublicProfileScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ username: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const friendship = useFriendStatus(profile?.id ?? null);
  const isSelf = !!profile && !!user && profile.id === user.id;
  const unavailable = friendship.status === 'they_blocked_me';

  useEffect(() => {
    if (!username) {
      setError('No user specified.');
      setLoading(false);
      return;
    }
    let active = true;

    void fetchProfileByUsername(username).then(({ data, error: fetchError }) => {
      if (!active) {
        return;
      }
      if (fetchError) {
        setError(fetchError);
      } else {
        setProfile(data);
        if (!data) {
          setError('This user could not be found.');
        }
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [username]);

  const submitReport = (category: ReportCategory, details?: string) => {
    if (!profile) {
      return;
    }
    setReportError(null);
    setReportSubmitting(true);
    void reportUser(profile.id, category, details).then((reportErr) => {
      setReportSubmitting(false);
      if (reportErr) {
        setReportError(reportErr);
      } else {
        setReportOpen(false);
        setReportError(null);
        Alert.alert('Report sent', 'Thanks — our team will review it.');
      }
    });
  };

  return (
    <Screen padding={0}>
      <Stack.Screen options={{ title: '@' + (username ?? '') }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" numberOfLines={1} style={styles.headerTitle}>
          Profile
        </AppText>
        <View style={styles.backButton} />
      </View>

      {!loading && unavailable ? (
        <View style={styles.stateWrap}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
            This profile is unavailable.
          </AppText>
        </View>
      ) : loading ? (
        <View style={styles.stateWrap}>
          <AppText variant="body" color={colors.textSecondary}>
            Loading profile…
          </AppText>
        </View>
      ) : error || !profile ? (
        <View style={styles.stateWrap}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.stateText}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.replace('/home')}>
            <AppText variant="label" color={colors.primary} weight="semibold" align="center">
              Back to home
            </AppText>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.identity}>
              <Avatar uri={profile.avatar_url} name={profile.display_name} size={96} />
              <View style={styles.identityText}>
                <AppText variant="title" weight="bold">
                  {profile.display_name}
                </AppText>
                <AppText variant="body" color={colors.textSecondary}>
                  @{profile.username}
                </AppText>
                <AppText variant="caption" color={colors.textMuted}>
                  {formatDateJoined(profile.created_at)}
                </AppText>
              </View>
            </View>

            {profile.bio ? (
              <AppText variant="body" color={colors.text} style={styles.bio}>
                {profile.bio}
              </AppText>
            ) : null}

            <ProfileInfoRow icon="school-outline" label="School" value={profile.school} />
            <ProfileInfoRow icon="layers-outline" label="Department" value={profile.department} />
            <ProfileInfoRow icon="trending-up-outline" label="Level" value={profile.level} />
          </View>

          {isSelf ? (
            <AppText variant="label" color={colors.textMuted} align="center" style={styles.selfNote}>
              This is your profile
            </AppText>
          ) : (
            <FriendStatusActions
              status={friendship.status}
              busy={friendship.busy}
              error={friendship.error}
              onSend={friendship.sendRequest}
              onAccept={friendship.accept}
              onReject={friendship.reject}
              onCancel={friendship.cancel}
              onRemove={() => {
                Alert.alert(
                  'Remove friend?',
                  'You will need to send a new request to reconnect.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: friendship.remove },
                  ],
                );
              }}
              onBlock={() => {
                Alert.alert(
                  'Block user?',
                  'Blocking this user prevents them from messaging, calling or searching for you.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Block', style: 'destructive', onPress: friendship.block },
                  ],
                );
              }}
              onUnblock={friendship.unblock}
              onMessage={() => {
                if (!profile) {
                  return;
                }
                void (async () => {
                  const conversationId = await startConversationWith(profile.id);
                  if (conversationId) {
                    router.push({
                      pathname: '/chat/[conversationId]',
                      params: { conversationId },
                    });
                  }
                })();
              }}
            />
          )}

          {!isSelf ? (
            <Pressable
              accessibilityRole="button"
              style={styles.reportRow}
              onPress={() => {
                setReportError(null);
                setReportOpen(true);
              }}
            >
              <Ionicons name="flag-outline" size={18} color={colors.textSecondary} />
              <AppText variant="label" color={colors.textSecondary} weight="semibold">
                Report user
              </AppText>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <ReportSheet
        visible={reportOpen}
        title="Report user"
        submitting={reportSubmitting}
        error={reportError}
        onClose={() => {
          setReportOpen(false);
          setReportError(null);
        }}
        onSubmit={(category, details) => submitReport(category, details)}
      />
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
      <AppText variant="body" weight="medium" style={styles.infoValue} numberOfLines={2}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stateText: {
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  selfNote: {
    marginTop: spacing.lg,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
});