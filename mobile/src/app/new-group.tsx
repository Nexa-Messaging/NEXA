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
import { AppButton, AppText, FormField, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { listFriends } from '@/lib/friends';
import { createGroup } from '@/lib/groups';
import { Profile } from '@/types/database';
import { validateGroupName } from '@/utils/validation';

export default function NewGroupScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [friends, setFriends] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const onCreate = async () => {
    if (creating) {
      return;
    }
    setError(null);
    const nameError = validateGroupName(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    setCreating(true);
    const result = await createGroup(name.trim(), [...selected]);
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace({
      pathname: '/group/[chatId]',
      params: { chatId: result.chatId },
    });
  };

  if (!user) {
    return null;
  }

  return (
    <Screen padding={0}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" hitSlop={12} style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <AppText variant="heading" weight="bold" style={styles.title}>
          New group
        </AppText>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.form}>
        <FormField
          label="Group name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Design Team"
          autoCapitalize="words"
          maxLength={80}
        />

        <AppText variant="label" weight="semibold" color={colors.textSecondary} style={styles.membersTitle}>
          ADD FRIENDS ({selected.size} selected)
        </AppText>

        {error ? (
          <AppText variant="caption" color={colors.danger} style={styles.errorText}>
            {error}
          </AppText>
        ) : null}

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && friends.length === 0 ? (
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
            <Ionicons name="people-outline" size={40} color={colors.textMuted} />
            <AppText variant="body" color={colors.textSecondary} align="center" style={styles.emptyText}>
              Add friends first, then start a group with them here.
            </AppText>
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  style={styles.row}
                  onPress={() => toggle(item.id)}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                  <Avatar uri={item.avatar_url} name={item.display_name} size={44} />
                  <View style={styles.personText}>
                    <AppText variant="body" weight="semibold" numberOfLines={1}>
                      {item.display_name}
                    </AppText>
                    <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                      @{item.username}
                    </AppText>
                  </View>
                </Pressable>
              );
            }}
            contentContainerStyle={styles.list}
          />
        )}
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <AppButton
          title="Create group"
          size="lg"
          fullWidth
          loading={creating}
          onPress={() => void onCreate()}
        />
      </View>
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
  form: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  membersTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  errorText: {
    marginBottom: spacing.sm,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  retry: {
    marginTop: spacing.sm,
  },
  emptyText: {
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  list: {
    paddingBottom: spacing.lg,
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
});