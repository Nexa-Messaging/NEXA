import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CompactStatusAction } from '@/components/FriendStatusActions';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors, radius, spacing } from '@/constants/theme';
import { useFriendStatus } from '@/hooks/useFriendStatus';
import { FriendshipStatus } from '@/lib/friends';
import { Profile } from '@/types/database';

export type FriendRowMode = 'incoming' | 'outgoing' | 'friend' | 'search';

export interface FriendRowProps {
  profile: Profile;
  mode: FriendRowMode;
  onPress: () => void;
  /** Called after a successful relationship change so lists can refresh. */
  onMutated?: () => void;
  /** Opens a 1:1 chat (only used in `friend` mode). */
  onMessage?: () => void;
}

/**
 * One user row inside the friends hub. Every row owns its own relationship
 * status so actions reflect the freshest server state.
 */
export function FriendRow({ profile, mode, onPress, onMutated, onMessage }: FriendRowProps) {
  const friendship = useFriendStatus(profile.id, onMutated);

  const renderAction = () => {
    if (mode === 'incoming') {
      return (
        <CompactActionRow
          status={friendship.status}
          busy={friendship.busy}
          onAccept={friendship.accept}
          onReject={friendship.reject}
        />
      );
    }
    if (mode === 'outgoing') {
      return (
        <CompactStatusAction
          status={friendship.status}
          busy={friendship.busy}
          onCancel={friendship.cancel}
        />
      );
    }
    if (mode === 'friend') {
      return (
        <View style={styles.iconRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message ${profile.display_name}`}
            hitSlop={8}
            onPress={onMessage}
            style={styles.iconButton}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${profile.display_name} as friend`}
            hitSlop={8}
            disabled={friendship.busy}
            onPress={() =>
              Alert.alert(
                `Remove ${profile.display_name}?`,
                'You will need to send a new request to reconnect.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: friendship.remove },
                ],
              )
            }
            style={styles.iconButton}
          >
            <Ionicons name="person-remove-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      );
    }
    return (
      <CompactStatusAction
        status={friendship.status}
        busy={friendship.busy}
        onSend={friendship.sendRequest}
        onAccept={friendship.accept}
        onCancel={friendship.cancel}
      />
    );
  };

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" style={styles.person} onPress={onPress}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size={48} />
        <View style={styles.personText}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {profile.display_name}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
            @{profile.username}
          </AppText>
        </View>
      </Pressable>

      <View style={styles.action}>{renderAction()}</View>
    </View>
  );
}

function CompactActionRow({
  status,
  busy,
  onAccept,
  onReject,
}: {
  status: FriendshipStatus | 'loading';
  busy: boolean;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  if (status === 'loading') {
    return <CompactStatusAction status={status} />;
  }
  return (
    <View style={styles.twoButtons}>
      <AppButton
        title="Accept"
        size="sm"
        loading={busy}
        onPress={onAccept}
        style={styles.flex}
      />
      <AppButton
        title="Reject"
        size="sm"
        variant="outline"
        style={[styles.flex, styles.gap]}
        onPress={onReject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  person: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  personText: {
    flex: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  action: {
    alignItems: 'flex-end',
  },
  twoButtons: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  gap: {
    marginLeft: spacing.xs,
  },
  iconRow: {
    flexDirection: 'row',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});