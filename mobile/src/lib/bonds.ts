import { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

export interface BondActivity {
  id: string;
  name: string;
  description: string;
  base_xp: number;
  cooldown_seconds: number;
  daily_cap: number | null;
  is_active: boolean;
}

export interface Bond {
  user_id: string;
  friend_id: string;
  xp: number;
  level: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BondXPLog {
  id: number;
  user_id: string;
  friend_id: string;
  activity_id: string;
  xp_awarded: number;
  meta: Record<string, any>;
  created_at: string;
}

export interface BondMilestone {
  level: number;
  name: string;
  description: string;
  reward_type: 'reaction' | 'chat_theme' | 'visual_effect' | 'badge';
  reward_data: Record<string, any>;
}

export interface BondRewardClaimed {
  user_id: string;
  friend_id: string;
  level: number;
  claimed_at: string;
}

export interface BondInfo {
  xp: number;
  level: number;
  last_activity_at: string | null;
  next_level_xp: number;
  progress_pct: number;
}

export interface BondLeaderboardEntry {
  friend_id: string;
  friend_display_name: string;
  friend_username: string;
  friend_avatar_url: string | null;
  xp: number;
  level: number;
}

export interface AwardXPResult {
  xp_awarded: number;
  new_xp: number;
  new_level: number;
  leveled_up: boolean;
  new_milestones: number[];
}

export interface BondResult<T> {
  data: T | null;
  error: string | null;
}

function bondError(error: PostgrestError): string {
  return `Bond error: ${error.message}`;
}

/**
 * Get or create bond for a friendship.
 */
export async function getOrCreateBond(friendId: string): Promise<BondResult<Bond>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_or_create_bond', { p_friend_id: friendId });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: data as Bond, error: null };
}

/**
 * Award bond XP for an activity (server-side validation, anti-spam).
 */
export async function awardBondXP(
  friendId: string,
  activityId: string,
  meta: Record<string, any> = {}
): Promise<BondResult<AwardXPResult>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('award_bond_xp', {
    p_friend_id: friendId,
    p_activity_id: activityId,
    p_meta: meta,
  });

  if (error) {
    return { data: null, error: bondError(error) };
  }

  const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { data: result as AwardXPResult | null, error: null };
}

/**
 * Get bond info for a friendship.
 */
export async function fetchBond(friendId: string): Promise<BondResult<BondInfo>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_bond', { p_friend_id: friendId });

  if (error) {
    return { data: null, error: bondError(error) };
  }

  const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { data: result as BondInfo | null, error: null };
}

/**
 * Get bond leaderboard for current user.
 */
export async function fetchBondLeaderboard(limit = 10): Promise<BondResult<BondLeaderboardEntry[]>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_bond_leaderboard', { p_limit: limit });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: (data as unknown as BondLeaderboardEntry[]) ?? [], error: null };
}

/**
 * Claim a milestone reward.
 */
export async function claimBondReward(
  friendId: string,
  level: number
): Promise<BondResult<BondRewardClaimed>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('claim_bond_reward', {
    p_friend_id: friendId,
    p_level: level,
  });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: data as BondRewardClaimed, error: null };
}

/**
 * Get claimed rewards for a bond.
 */
export async function fetchClaimedBondRewards(
  friendId: string
): Promise<BondResult<BondRewardClaimed[]>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_claimed_bond_rewards', {
    p_friend_id: friendId,
  });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: (data as unknown as BondRewardClaimed[]) ?? [], error: null };
}

/**
 * Fetch all active bond activities.
 */
export async function fetchBondActivities(): Promise<BondResult<BondActivity[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bond_activities' as any)
    .select('*')
    .eq('is_active', true)
    .order('base_xp', { ascending: false });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: (data as unknown as BondActivity[]) ?? [], error: null };
}

/**
 * Fetch all milestones.
 */
export async function fetchBondMilestones(): Promise<BondResult<BondMilestone[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bond_milestones' as any)
    .select('*')
    .order('level', { ascending: true });

  if (error) {
    return { data: null, error: bondError(error) };
  }
  return { data: (data as unknown as BondMilestone[]) ?? [], error: null };
}

/**
 * Calculate level from XP (mirrors server formula).
 */
export function levelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Calculate XP required for a level.
 */
export function xpForLevel(level: number): number {
  return level * level * 100;
}

/**
 * Calculate progress percentage toward next level.
 */
export function bondProgress(xp: number, level: number): { current: number; next: number; pct: number } {
  const currentLevelXP = (level - 1) * (level - 1) * 100;
  const nextLevelXP = level * level * 100;
  const pct = nextLevelXP > currentLevelXP
    ? Math.round(100 * (xp - currentLevelXP) / (nextLevelXP - currentLevelXP) * 10) / 10
    : 100;
  return { current: currentLevelXP, next: nextLevelXP, pct };
}