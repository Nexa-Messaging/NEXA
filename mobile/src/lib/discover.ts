import { getSupabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type DiscoverItemType = 'community' | 'question' | 'answer' | 'profile';

export interface DiscoverItem {
  item_type: DiscoverItemType;
  item_id: string;
  score: number;
  title: string;
  subtitle: string | null;
  body: string | null;
  avatar_url: string | null;
  author_name: string | null;
  author_id: string | null;
  reaction_count: number;
  answer_count: number;
  participant_count: number;
  created_at: string;
  meta: Record<string, unknown>;
}

export interface DiscoverFeedResult {
  items: DiscoverItem[];
  error: string | null;
}

export const ITEM_TYPE_CONFIG: Record<DiscoverItemType, { emoji: string; label: string; color: string }> = {
  community: { emoji: '🏫', label: 'Community', color: '#6D5CF5' },
  question:  { emoji: '❓', label: 'Question',  color: '#8B5CF6' },
  answer:    { emoji: '💬', label: 'Answer',    color: '#10B981' },
  profile:   { emoji: '👤', label: 'Profile',   color: '#3B82F6' },
};

/** Fetch the ranked Discover feed. */
export async function getDiscoverFeed(
  limit = 30,
  offset = 0,
): Promise<DiscoverFeedResult> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('get_discover_feed', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { items: [], error: error.message };
  return { items: (data ?? []) as DiscoverItem[], error: null };
}

/** Fetch a single discover item's full detail. */
export async function getDiscoverItem(
  itemType: DiscoverItemType,
  itemId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('get_discover_item', {
    p_item_type: itemType,
    p_item_id: itemId,
  });
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

/** Report a discover item for moderation. */
export async function reportDiscoverItem(
  targetType: string,
  targetId: string,
  category: string,
  details?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabase() as AnySupabase;
  const { error } = await supabase.rpc('report_discover_item', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_category: category,
    p_details: details ?? null,
  });
  return { error: error?.message ?? null };
}
