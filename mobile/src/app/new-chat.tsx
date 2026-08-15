import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { listFriends } from '@/lib/friends';
import { startConversationWith } from '@/lib/messaging';
import { Profile } from '@/types/database';

export default function NewChatScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      return;
    }
    setLoading(true);
    setError(null);
    const result = await listFriends(user.id);
    if (result.error) {
      setError(result.error);
    } else {
      setFriends(result.data ?? []);
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openChat = async (friend: Profile) => {
    if (opening) {
      return;
    }
    setOpening(friend.id);
    const conversationId = await startConversationWith(friend.id);
    if (conversationId) {
      router.replace({
        pathname: '/chat/[conversationId]',
        params: { conversationId },
      });
    } else {
      setOpening(null);
      setError('Could not open a chat with this user.');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          style={styles.iconButton}
          onPress={() => router.back()}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" style={styles.title}>
          New chat
        </AppText>
        <View style={styles.iconButton} />
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={{ lineHeight: 22 }}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}>
            <AppText variant="label" color={colors.primary} weight="semibold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.state}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <AppText variant="heading" weight="bold" align="center" style={styles.emptyTitle}>
            No friends yet
          </AppText>
          <AppText variant="body" color={colors.textSecondary} align="center">
            Add friends first, then start a chat with them here.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              onPress={() => openChat(item)}
              disabled={opening != null}
            >
              <Avatar uri={item.avatar_url} name={item.display_name} size={48} />
              <View style={styles.personText}>
                <AppText variant="body" weight="semibold" numberOfLines={1}>
                  {item.display_name}
                </AppText>
                <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                  @{item.username}
                </AppText>
              </View>
              {opening === item.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              )}
            </Pressable>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  personText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    marginTop: spacing.md,
  },
  retry: {
    marginTop: spacing.sm,
  },
});