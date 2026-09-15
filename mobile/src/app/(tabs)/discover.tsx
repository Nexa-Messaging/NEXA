import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { gradients, radius, shadows, spacing, typography } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import {
  DiscoverItem,
  DiscoverItemType,
  ITEM_TYPE_CONFIG,
  getDiscoverFeed,
} from '@/lib/discover';

type FilterType = 'all' | DiscoverItemType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'community', label: 'Communities' },
  { key: 'question',  label: 'Questions' },
  { key: 'answer',    label: 'Answers' },
  { key: 'profile',   label: 'Profiles' },
];

export default function DiscoverScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [items, setItems] = useState<DiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [offset, setOffset] = useState(0);
  const PAGE = 30;

  const load = useCallback(
    async (off = 0, append = false) => {
      const { items: data, error: err } = await getDiscoverFeed(PAGE, off);
      if (err) {
        setError(err);
      } else {
        setError(null);
        setItems(append ? [...items, ...data] : data);
        setOffset(off + PAGE);
      }
    },
    [items],
  );

  React.useEffect(() => {
    setLoading(true);
    load(0, false).then(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(0, false);
    setRefreshing(false);
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    await load(offset, true);
    setLoadingMore(false);
  }, [loadingMore, offset, load]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.item_type === filter);

  const handleItemPress = (item: DiscoverItem) => {
    if (item.item_type === 'community') {
      router.push(`/community/${item.item_id}`);
    } else if (item.item_type === 'profile' && item.meta?.username) {
      router.push(`/users/${item.meta.username}`);
    }
  };

  return (
    <Screen padding={0} blobbed>
      <LinearGradient
        colors={gradients.ocean}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <AppText variant="caption" weight="bold" color={colors.headerText} style={s.heroLabel}>
          EXPLORE ✦
        </AppText>
        <AppText variant="display" weight="bold" color={colors.headerText}>
          Discover
        </AppText>
        <AppText variant="body" color={colors.headerText} style={s.heroBody}>
          Communities, questions, and active creators.
        </AppText>
      </LinearGradient>

      {/* Filter pills */}
      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.filters, { backgroundColor: colors.background }]}
        keyExtractor={(f) => f.key}
        renderItem={({ item: f }) => {
          const active = filter === f.key;
          return (
            <Pressable
              onPress={() => setFilter(f.key)}
              style={[
                s.pill,
                {
                  backgroundColor: active ? colors.primary : colors.inputBg,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <AppText
                variant="caption"
                weight={active ? 'bold' : 'regular'}
                color={active ? colors.headerText : colors.textSecondary}
              >
                {f.label}
              </AppText>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : error ? (
        <AppText variant="body" tone="danger" align="center" style={{ marginTop: spacing.xl }}>
          {error}
        </AppText>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="compass-outline" size={48} color={colors.textMuted} />
          <AppText variant="body" tone="muted" align="center" style={{ marginTop: spacing.sm }}>
            Nothing to discover yet.{'\n'}Check back soon!
          </AppText>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.item_type}-${item.item_id}`}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <DiscoverCard item={item} onPress={() => handleItemPress(item)} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{ paddingVertical: spacing.md }} color={colors.primary} />
            ) : null
          }
        />
      )}
    </Screen>
  );
}

/* ── Discover Card ─────────────────────────────────────────────── */

function DiscoverCard({ item, onPress }: { item: DiscoverItem; onPress: () => void }) {
  const { colors } = useAppTheme();
  const cfg = ITEM_TYPE_CONFIG[item.item_type];

  return (
    <Pressable
      onPress={onPress}
      style={[s.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}
    >
      <View style={s.cardHeader}>
        <View style={[s.typeBadge, { backgroundColor: cfg.color + '20' }]}>
          <AppText variant="caption" weight="bold" color={cfg.color}>
            {cfg.emoji} {cfg.label}
          </AppText>
        </View>
        {item.participant_count > 0 ? (
          <View style={[s.statBadge, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="people" size={12} color={colors.textMuted} />
            <AppText variant="caption" color={colors.textMuted}>
              {item.participant_count}
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="heading" weight="bold" numberOfLines={2} style={s.cardTitle}>
        {item.title}
      </AppText>

      {item.subtitle ? (
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {item.subtitle}
        </AppText>
      ) : null}

      {item.body ? (
        <AppText variant="body" tone="secondary" numberOfLines={3} style={s.cardBody}>
          {item.body}
        </AppText>
      ) : null}

      <View style={s.cardFooter}>
        {item.reaction_count > 0 ? (
          <View style={s.footerStat}>
            <Ionicons name="heart" size={14} color={colors.pink} />
            <AppText variant="caption" color={colors.textMuted}>
              {item.reaction_count}
            </AppText>
          </View>
        ) : null}
        {item.answer_count > 0 ? (
          <View style={s.footerStat}>
            <Ionicons name="chatbubble" size={14} color={colors.primary} />
            <AppText variant="caption" color={colors.textMuted}>
              {item.answer_count}
            </AppText>
          </View>
        ) : null}
        <View style={s.footerStat}>
          <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

/* ── Styles ─────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },
  heroLabel: {
    letterSpacing: 1.2,
    opacity: 0.95,
  },
  heroBody: {
    marginTop: spacing.xs,
    opacity: 0.95,
    lineHeight: 22,
  },
  filters: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  cardTitle: {
    lineHeight: typography.heading * 1.3,
  },
  cardBody: {
    marginTop: spacing.xs,
    lineHeight: typography.body * 1.4,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 1.5,
  },
});
