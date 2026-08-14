import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ConversationListItem } from '@/components/ConversationListItem';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { AppText, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useConversations } from '@/hooks/useConversations';

export default function ChatsScreen() {
  const { items, loading, refreshing, setRefreshing, error, realtime, refresh } =
    useConversations();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold">
          Chats
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New group"
          hitSlop={12}
          style={styles.newButton}
          onPress={() => router.push('/new-group')}
        >
          <Ionicons name="people-outline" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          hitSlop={12}
          style={styles.newButton}
          onPress={() => router.push('/new-chat')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <RealtimeBanner status={realtime} />

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="label" color={colors.textSecondary} style={styles.stateText}>
            Loading chats…
          </AppText>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={styles.errorText}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void refresh()}>
            <AppText variant="label" color={colors.primary} weight="semibold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
          <AppText variant="heading" weight="bold" align="center" style={styles.emptyTitle}>
            No chats yet
          </AppText>
          <AppText variant="body" color={colors.textSecondary} align="center">
            Start a conversation with a friend to see it here.
          </AppText>
          <Pressable
            accessibilityRole="button"
            style={styles.emptyButton}
            onPress={() => router.push('/new-chat')}
          >
            <AppText variant="label" weight="semibold" color={colors.surface}>
              Start a chat
            </AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationListItem
              item={item}
              onPress={() =>
                item.kind === 'group'
                  ? router.push({ pathname: '/group/[chatId]', params: { chatId: item.id } })
                  : router.push({
                      pathname: '/chat/[conversationId]',
                      params: { conversationId: item.id },
                    })
              }
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh();
                setRefreshing(false);
              }}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  newButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  stateText: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  emptyTitle: {
    marginTop: spacing.md,
  },
  emptyButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
});