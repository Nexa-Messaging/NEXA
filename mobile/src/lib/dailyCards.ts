import { getSupabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type CardCategory = 'question' | 'compliment' | 'challenge' | 'friendship' | 'chaos' | 'game';

export interface DailyCard {
  id: string;
  card_id: string;
  category: CardCategory;
  body: string;
  points: number;
  completed: boolean;
  completed_at: string | null;
  assigned_at: string;
  already_had: boolean;
}

export interface CardSend {
  id: string;
  sender_id: string;
  card_body: string;
  category: CardCategory;
  message: string | null;
  sent_at: string;
  read: boolean;
  sender_name: string | null;
  sender_avatar: string | null;
}

export interface DailyCardResult<T> {
  data: T | null;
  error: string | null;
}

export const CATEGORY_CONFIG: Record<CardCategory, { emoji: string; label: string; color: string; gradient: readonly [string, string] }> = {
  question:   { emoji: '❓', label: 'Question',   color: '#8B5CF6', gradient: ['#8B5CF6', '#6D28D9'] as const },
  compliment: { emoji: '💜', label: 'Compliment', color: '#EC4899', gradient: ['#EC4899', '#BE185D'] as const },
  challenge:  { emoji: '⚡', label: 'Challenge',  color: '#F59E0B', gradient: ['#F59E0B', '#D97706'] as const },
  friendship: { emoji: '🤝', label: 'Friendship', color: '#10B981', gradient: ['#10B981', '#059669'] as const },
  chaos:      { emoji: '🌀', label: 'Chaos',      color: '#EF4444', gradient: ['#EF4444', '#DC2626'] as const },
  game:       { emoji: '🎮', label: 'Game',       color: '#3B82F6', gradient: ['#3B82F6', '#2563EB'] as const },
};

/** Fetch today's card, assigning one if the user hasn't received one yet. */
export async function fetchTodayCard(userId: string): Promise<DailyCardResult<DailyCard>> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('assign_daily_card', { p_user_id: userId });
  if (error) return { data: null, error: error.message };
  return { data: data as DailyCard, error: null };
}

/** Mark today's card as completed. */
export async function completeTodayCard(userId: string): Promise<DailyCardResult<{ completed: boolean }>> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('complete_daily_card', { p_user_id: userId });
  if (error) return { data: null, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result?.error) return { data: null, error: result.error as string };
  return { data: { completed: true }, error: null };
}

/** Send a card to a friend. */
export async function sendCardToFriend(
  senderId: string,
  receiverId: string,
  cardId: string,
  message?: string,
): Promise<DailyCardResult<{ sent: boolean; sent_at: string }>> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('send_daily_card', {
    p_sender_id: senderId,
    p_receiver_id: receiverId,
    p_card_id: cardId,
    p_message: message ?? null,
  });
  if (error) return { data: null, error: error.message };
  const result = data as Record<string, unknown> | null;
  return { data: { sent: true, sent_at: (result?.sent_at as string) ?? '' }, error: null };
}

/** Get count of unread cards received. */
export async function getUnreadCardCount(_userId: string): Promise<number> {
  return 0;
}

/** Get inbox of received cards. */
export async function getReceivedCards(
  userId: string,
  limit = 20,
): Promise<DailyCardResult<CardSend[]>> {
  const supabase = getSupabase() as AnySupabase;
  const { data, error } = await supabase.rpc('get_received_cards', {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CardSend[], error: null };
}

/** Mark a received card as read. */
export async function markCardRead(cardSendId: string, userId: string): Promise<void> {
  const supabase = getSupabase() as AnySupabase;
  await supabase.rpc('mark_card_read', {
    p_card_send_id: cardSendId,
    p_user_id: userId,
  });
}
