import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AppButton, AppText, EmptyState, Screen, SectionHeader } from '@/components/ui';
import { colors, gradients, radius, spacing } from '@/constants/theme';
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
    <Screen padding={0} blobbed>
      <LinearGradient
        colors={gradients.meadow}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBand}
      >
        <View style={styles.header}>
          <View>
            <AppText variant="caption" weight="bold" color={colors.surface} style={styles.headerLabel}>
              YOUR CHATS
            </AppText>
            <AppText variant="display" weight="bold" color={colors.surface}>
              Chats
            </AppText>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New group"
              hitSlop={12}
              style={styles.newButton}
              onPress={() => router.push('/new-group')}
            >
              <Ionicons name="people-outline" size={22} color={colors.surface} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              hitSlop={12}
              style={styles.newButton}
              onPress={() => router.push('/new-chat')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.surface} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <RealtimeBanner status={realtime} />

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="label" tone="secondary" style={styles.stateText}>
            Loading chats…
          </AppText>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText variant="body" tone="secondary" align="center" style={styles.errorText}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void refresh()}>
            <AppText variant="label" color={colors.primary} weight="bold">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No chats yet"
            description="Start a conversation with a friend to see it here."
            action={
              <AppButton
                title="Start a chat"
                variant="gradient"
                size="lg"
                onPress={() => router.push('/new-chat')}
              />
            }
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <SectionHeader title="Recent" />
          }
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
  headerBand: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  headerLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  newButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
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
});