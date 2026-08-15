import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { NotificationCard } from '@/components/NotificationCard';
import { RealtimeBanner } from '@/components/RealtimeBanner';
import { AppText, AppButton, EmptyState, Screen } from '@/components/ui';
import { colors, gradients, radius, spacing } from '@/constants/theme';
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
    <Screen padding={0} blobbed>
      <LinearGradient
        colors={gradients.candy}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBand}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.surface} />
          </Pressable>
          <View style={styles.headerTitle}>
            <AppText variant="caption" weight="bold" color={colors.surface} style={styles.headerLabel}>
              STAY IN THE LOOP
            </AppText>
            <AppText variant="display" weight="bold" color={colors.surface}>
              Alerts
            </AppText>
          </View>
          {unreadCount > 0 ? (
            <AppButton
              title="Mark all read"
              variant="outline"
              size="sm"
              style={styles.markAllButton}
              onPress={() => void markAllRead()}
            />
          ) : (
            <View style={styles.backButton} />
          )}
        </View>
      </LinearGradient>

      <RealtimeBanner status={realtime} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationCard item={item} onPress={() => handlePress(item.id)} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-off-outline"
            title="You're all caught up"
            description="Notifications for messages, requests, stories, polls and events land here."
          />
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
          <AppText variant="label" tone="danger" style={styles.flex}>
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  headerLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  markAllButton: {
    borderColor: colors.surface,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE9ED',
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
});