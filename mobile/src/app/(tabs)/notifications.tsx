import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { NotificationCard } from '@/components/NotificationCard';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { AppText, AppButton, Screen } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { RealtimeStatus, subscribeToRealtimeStatus } from '@/lib/messaging';
import { openNotification } from '@/lib/notifications';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationsScreen() {
  const { items, unreadCount, loading, refreshing, setRefreshing, error, refresh, markRead, markAllRead } =
    useNotifications();
  const [realtime, setRealtime] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const offStatus = subscribeToRealtimeStatus(setRealtime);
    return offStatus;
  }, []);

  const handlePress = (id: string) => {
    const item = items.find((n) => n.id === id);
    if (!item) {
      return;
    }
    openNotification(item);
    if (!item.is_read) {
      void markRead(id);
    }
  };

  if (loading) {
    return (
      <Screen centered>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold" style={styles.headerTitle}>
          Notifications
        </AppText>
        {unreadCount > 0 ? (
          <AppButton
            title="Mark all read"
            variant="ghost"
            size="sm"
            onPress={() => void markAllRead()}
          />
        ) : null}
      </View>

      <RealtimeBanner status={realtime} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationCard item={item} onPress={() => handlePress(item.id)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} />
            <AppText variant="body" color={colors.textSecondary} align="center" style={styles.emptyText}>
              You're all caught up. Notifications for messages, requests, stories, polls and events land here.
            </AppText>
          </View>
        }
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

      {error ? (
        <View style={styles.errorBanner}>
          <AppText variant="label" color={colors.danger} style={styles.flex}>
            {error}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Retry" hitSlop={10} onPress={() => void refresh()}>
            <Ionicons name="refresh" size={18} color={colors.danger} />
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEA',
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
});