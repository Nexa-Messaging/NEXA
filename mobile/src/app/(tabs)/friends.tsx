import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { FriendRow } from '@/components/FriendRow';
import { AppText, Screen } from '@/components/ui';
import { gradients, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests,
  searchUsers,
} from '@/lib/friends';
import { startConversationWith } from '@/lib/messaging';
import { Profile } from '@/types/database';

type Segment = 'requests' | 'friends' | 'search';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'friends', label: 'Friends' },
  { key: 'search', label: 'Search' },
];

export default function FriendsScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [segment, setSegment] = useState<Segment>('requests');

  if (!user) {
    return null;
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
          <View>
            <AppText variant="caption" weight="bold" color={colors.headerText} style={styles.headerLabel}>
              YOUR PEOPLE
            </AppText>
            <AppText variant="display" weight="bold" color={colors.headerText}>
              Friends
            </AppText>
          </View>
          <View style={styles.headerSticker}>
            <Ionicons name="person-add" size={20} color={colors.headerText} />
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.segments, { backgroundColor: colors.surfaceMuted }]}>
        {SEGMENTS.map((item) => {
          const active = segment === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setSegment(item.key)}
              style={[styles.segment, active && [styles.segmentActive, { backgroundColor: colors.surface }]]}
            >
              <AppText
                variant="label"
                weight="semibold"
                color={active ? colors.primary : colors.textSecondary}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.content}>
        {segment === 'requests' ? <RequestsPanel userId={user.id} /> : null}
        {segment === 'friends' ? <FriendsPanel userId={user.id} /> : null}
        {segment === 'search' ? <SearchPanel userId={user.id} /> : null}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Requests (received + sent, pending)
// ---------------------------------------------------------------------------

function useRefreshOnFocus(reload: () => void) {
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
}

function LoadableList({
  loading,
  error,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  if (loading) {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.state}>
        <AppText variant="body" color={colors.textSecondary} align="center">
          {error}
        </AppText>
        <Pressable onPress={onRetry} style={styles.retry}>
          <AppText variant="label" color={colors.primary} weight="semibold">
            Retry
          </AppText>
        </Pressable>
      </View>
    );
  }
  return <>{children}</>;
}

function RequestsPanel({ userId }: { userId: string }) {
  const [incoming, setIncoming] = useState<Profile[] | null>(null);
  const [outgoing, setOutgoing] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [received, sent] = await Promise.all([
      listIncomingRequests(userId),
      listOutgoingRequests(userId),
    ]);
    if (received.error || sent.error) {
      setError(received.error ?? sent.error);
    } else {
      setIncoming(received.data);
      setOutgoing(sent.data);
    }
    setLoading(false);
  }, [userId]);

  useRefreshOnFocus(reload);

  const openProfile = (username: string) => router.push(`/users/${username}`);

  return (
    <LoadableList loading={loading} error={error} onRetry={reload}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <SectionTitle title="Received" />
        {incoming && incoming.length > 0 ? (
          incoming.map((profile) => (
            <FriendRow
              key={profile.id}
              profile={profile}
              mode="incoming"
              onPress={() => openProfile(profile.username)}
              onMutated={reload}
            />
          ))
        ) : (
          <Empty text="No friend requests waiting on you." />
        )}

        <SectionTitle title="Sent" style={styles.sectionGap} />
        {outgoing && outgoing.length > 0 ? (
          outgoing.map((profile) => (
            <FriendRow
              key={profile.id}
              profile={profile}
              mode="outgoing"
              onPress={() => openProfile(profile.username)}
              onMutated={reload}
            />
          ))
        ) : (
          <Empty text="You have no pending requests." />
        )}
      </ScrollView>
    </LoadableList>
  );
}

// ---------------------------------------------------------------------------
// Friends list
// ---------------------------------------------------------------------------

function FriendsPanel({ userId }: { userId: string }) {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listFriends(userId);
    if (result.error) {
      setError(result.error);
    } else {
      setFriends(result.data ?? []);
    }
    setLoading(false);
  }, [userId]);

  useRefreshOnFocus(reload);

  const openChat = async (friend: Profile) => {
    const conversationId = await startConversationWith(friend.id);
    if (conversationId) {
      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId },
      });
    }
  };

  return (
    <LoadableList loading={loading} error={error} onRetry={reload}>
      <ScrollView contentContainerStyle={styles.listContent}>
        {friends.length > 0 ? (
          friends.map((profile) => (
            <FriendRow
              key={profile.id}
              profile={profile}
              mode="friend"
              onPress={() => router.push(`/users/${profile.username}`)}
              onMutated={reload}
              onMessage={() => void openChat(profile)}
            />
          ))
        ) : (
          <Empty text="You have no friends yet. Search for people to connect with." />
        )}
      </ScrollView>
    </LoadableList>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function SearchPanel({ userId }: { userId: string }) {
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setResults([]);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const result = await searchUsers(userId, text);
      setResults(result.data ?? []);
      if (result.error) {
        setError(result.error);
      }
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => void runSearch(query), 300);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [query, runSearch]);

  useRefreshOnFocus(
    useCallback(() => {
      void runSearch(query);
    }, [query, runSearch]),
  );

  return (
    <View style={styles.flex}>
      <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search by name or username"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search users"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center">
            {error}
          </AppText>
        </View>
      ) : query.trim() ? (
        results.length > 0 ? (
          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {results.map((profile) => (
              <FriendRow
                key={profile.id}
                profile={profile}
                mode="search"
                onPress={() => router.push(`/users/${profile.username}`)}
              />
            ))}
          </ScrollView>
        ) : (
          <Empty text="No users match your search." />
        )
      ) : (
        <Empty text="Search NEXA by name or username." />
      )}
    </View>
  );
}

function SectionTitle({ title, style }: { title: string; style?: object }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.sectionTitle, style]}>
      <AppText variant="label" weight="semibold" color={colors.textSecondary}>
        {title.toUpperCase()}
      </AppText>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty}>
      <AppText variant="body" color={colors.textMuted} align="center" style={styles.emptyText}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  headerSticker: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  segments: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.pill,
  },
  segmentActive: {},
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    paddingVertical: spacing.md,
  },
  sectionGap: {
    marginTop: spacing.sm,
  },
  state: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  retry: {
    marginTop: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    lineHeight: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 46,
    marginLeft: spacing.xs,
  },
});
