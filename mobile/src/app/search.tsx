import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { AppText, Screen } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { resolveCommunityAvatarUrl } from '@/lib/communities';
import {
  addRecentSearch,
  clearRecentSearches,
  fetchRecentSearches,
  searchAll,
} from '@/lib/search';
import { RecentSearch, SearchCategory, SearchResultRow } from '@/types/database';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface CategoryTab {
  key: SearchCategory;
  label: string;
  icon: IoniconName;
}

const CATEGORY_TABS: CategoryTab[] = [
  { key: 'all', label: 'All', icon: 'search' },
  { key: 'users', label: 'People', icon: 'people' },
  { key: 'communities', label: 'Circles', icon: 'people-circle' },
  { key: 'posts', label: 'Posts', icon: 'chatbubble' },
  { key: 'events', label: 'Events', icon: 'calendar' },
  { key: 'resources', label: 'Resources', icon: 'school' },
];

const RESULT_ICONS: Record<SearchResultRow['category'], IoniconName> = {
  user: 'person',
  community: 'people',
  post: 'chatbubble',
  event: 'calendar',
  resource: 'school',
};

const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState(params.q ?? '');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  const requestId = useRef(0);

  const trimmed = query.trim();

  const loadRecent = useCallback(async () => {
    const result = await fetchRecentSearches();
    if (!result.error) {
      setRecent(result.data ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!trimmed) {
        void loadRecent();
      }
    }, [trimmed, loadRecent]),
  );

  // Debounced search whenever the query or the active tab changes.
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      const result = await searchAll(trimmed, category);
      if (requestId.current !== id) {
        return;
      }
      setLoading(false);
      if (result.error) {
        setError(result.error);
        setResults([]);
        return;
      }
      setResults(result.data ?? []);
      void addRecentSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [trimmed, category]);

  // Resolve signed URLs for community photos shown in results.
  useEffect(() => {
    for (const result of results) {
      if (result.category !== 'community' || !result.avatar_url || avatarUrls[result.id]) {
        continue;
      }
      void resolveCommunityAvatarUrl(result.avatar_url).then((resolved) => {
        if (resolved.url) {
          setAvatarUrls((prev) => ({ ...prev, [result.id]: resolved.url as string }));
        }
      });
    }
  }, [results, avatarUrls]);

  const openResult = (result: SearchResultRow) => {
    const data = (result.data ?? {}) as Record<string, string | undefined>;
    switch (result.category) {
      case 'user':
        router.push(`/users/${data.username ?? result.id}`);
        break;
      case 'community':
        router.push({ pathname: '/community/[communityId]', params: { communityId: result.id } });
        break;
      case 'post':
      case 'resource':
        router.push({
          pathname: '/channel/[channelId]',
          params: { channelId: data.channel_id ?? result.id },
        });
        break;
      case 'event':
        router.push({
          pathname: '/event/[eventId]',
          params: { eventId: result.id, communityId: data.community_id ?? '' },
        });
        break;
    }
  };

  const runRecent = (term: string) => {
    setCategory('all');
    setQuery(term);
  };

  const clearAllRecent = async () => {
    await clearRecentSearches();
    setRecent([]);
  };

  const renderResult = ({ item }: { item: SearchResultRow }) => {
    const showAvatar = item.category === 'user' || item.category === 'community';
    const avatarUri =
      item.category === 'community'
        ? avatarUrls[item.id] ?? null
        : item.avatar_url;

    return (
      <Pressable
        accessibilityRole="button"
        style={styles.row}
        onPress={() => openResult(item)}
      >
        {showAvatar ? (
          <Avatar uri={avatarUri} name={item.title} size={46} />
        ) : (
          <View style={styles.resultIcon}>
            <Ionicons
              name={RESULT_ICONS[item.category]}
              size={22}
              color={colors.primary}
            />
          </View>
        )}
        <View style={styles.resultText}>
          <AppText variant="body" weight="semibold" numberOfLines={1}>
            {item.title}
          </AppText>
          {item.subtitle ? (
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {item.subtitle}
            </AppText>
          ) : null}
          {item.body ? (
            <AppText variant="caption" color={colors.textMuted} numberOfLines={2}>
              {item.body}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    );
  };

  const renderRecent = ({ item }: { item: RecentSearch }) => (
    <Pressable
      accessibilityRole="button"
      style={styles.row}
      onPress={() => runRecent(item.query)}
    >
      <View style={styles.resultIcon}>
        <Ionicons name="time-outline" size={20} color={colors.textMuted} />
      </View>
      <AppText variant="body" numberOfLines={1} style={styles.resultText}>
        {item.query}
      </AppText>
      <Ionicons name="arrow-up" size={18} color={colors.textMuted} style={styles.recentArrow} />
    </Pressable>
  );

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
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search NEXA…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search"
          />
          {query.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tabs}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {CATEGORY_TABS.map((tab) => {
            const active = tab.key === category;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="button"
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setCategory(tab.key)}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={active ? colors.surface : colors.textSecondary}
                />
                <AppText
                  variant="label"
                  weight="semibold"
                  color={active ? colors.surface : colors.textSecondary}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!trimmed ? (
        <FlatList
          data={recent}
          keyExtractor={(item) => item.query}
          renderItem={renderRecent}
          ListHeaderComponent={
            recent.length > 0 ? (
              <View style={styles.sectionHeader}>
                <AppText variant="label" weight="semibold" color={colors.textSecondary}>
                  Recent searches
                </AppText>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void clearAllRecent()}>
                  <AppText variant="caption" color={colors.primary} weight="semibold">
                    Clear
                  </AppText>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.state}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <AppText variant="heading" weight="bold" align="center" style={styles.emptyTitle}>
                Find anything on NEXA
              </AppText>
              <AppText variant="body" color={colors.textSecondary} align="center">
                Search for classmates, class circles, posts, events and study resources.
              </AppText>
            </View>
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      ) : loading && results.length === 0 ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.state}>
          <AppText variant="body" color={colors.textSecondary} align="center" style={{ lineHeight: 22 }}>
            {error}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.category}:${item.id}`}
          renderItem={renderResult}
          ListEmptyComponent={
            <View style={styles.state}>
              <Ionicons name="file-tray-outline" size={48} color={colors.textMuted} />
              <AppText variant="heading" weight="bold" align="center" style={styles.emptyTitle}>
                No results
              </AppText>
              <AppText variant="body" color={colors.textSecondary} align="center">
                Nothing matched “{trimmed}”. Try a different word or another tab.
              </AppText>
            </View>
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
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
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    height: 40,
  },
  input: {
    flex: 1,
    marginHorizontal: spacing.xs,
    color: colors.text,
    fontSize: 16,
    padding: 0,
  },
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  resultIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  recentArrow: {
    transform: [{ rotate: '90deg' }],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
});
