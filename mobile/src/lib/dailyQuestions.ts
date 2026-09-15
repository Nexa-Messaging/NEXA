import { PostgrestError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';

export interface DailyQuestion {
  id: string;
  text: string;
  category: 'general' | 'fun' | 'deep' | 'hypothetical' | 'lifestyle';
  source: 'curated' | 'ai_generated';
  is_active: boolean;
  scheduled_date: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
}

export interface DailyAnswer {
  id: string;
  question_id: string;
  user_id: string;
  answer: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  reactions: Record<string, number>;
  my_reactions: string[];
}

export interface DailyAnswerReaction {
  id: string;
  answer_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface DailyQuestionStats {
  total_answers: number;
  total_reactions: number;
  total_skips: number;
}

export interface DailyQuestionResult<T> {
  data: T | null;
  error: string | null;
}

function dqError(error: PostgrestError): string {
  return `Daily question error: ${error.message}`;
}

/**
 * Get today's active question.
 */
export async function fetchTodayQuestion(): Promise<DailyQuestionResult<DailyQuestion>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_today_question');

  if (error) {
    return { data: null, error: dqError(error) };
  }

  const question = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { data: question as DailyQuestion | null, error: null };
}

/**
 * Get user's answer for a question.
 */
export async function fetchMyAnswer(questionId: string): Promise<DailyQuestionResult<DailyAnswer>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_my_answer', { p_question_id: questionId });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: data as DailyAnswer | null, error: null };
}

/**
 * Submit or update an answer.
 */
export async function submitDailyAnswer(
  questionId: string,
  answer: string,
  isPublic = true
): Promise<DailyQuestionResult<DailyAnswer>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('submit_daily_answer', {
    p_question_id: questionId,
    p_answer: answer,
    p_is_public: isPublic,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: data as DailyAnswer, error: null };
}

/**
 * React to an answer.
 */
export async function reactToDailyAnswer(
  answerId: string,
  emoji: string
): Promise<DailyQuestionResult<DailyAnswerReaction>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('react_to_daily_answer', {
    p_answer_id: answerId,
    p_emoji: emoji,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: data as DailyAnswerReaction, error: null };
}

/**
 * Remove a reaction.
 */
export async function unreactToDailyAnswer(
  answerId: string,
  emoji: string
): Promise<DailyQuestionResult<void>> {
  const supabase = getSupabase();
  const { error } = await (supabase as any).rpc('unreact_to_daily_answer', {
    p_answer_id: answerId,
    p_emoji: emoji,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: null, error: null };
}

/**
 * Get today's date string for comparison.
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Check if the daily question was already shown today for this user.
 */
export async function hasShownDailyQuestionToday(userId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any)
    .from('daily_question_log' as any)
    .select('shown_at')
    .eq('user_id', userId)
    .eq('date', getTodayDateString())
    .maybeSingle();

  if (error) {
    console.warn('Could not check daily question show status:', error.message);
    return false;
  }

  return data !== null;
}

/**
 * Mark the daily question as shown today for this user.
 */
export async function markDailyQuestionShownToday(userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await (supabase as any)
    .from('daily_question_log' as any)
    .upsert(
      {
        user_id: userId,
        date: getTodayDateString(),
        shown_at: new Date().toISOString(),
      } as any,
      { onConflict: 'user_id,date' }
    );

  if (error) {
    console.warn('Could not mark daily question as shown:', error.message);
  }
}

/**
 * Mark the daily question as answered today for this user.
 */
export async function markDailyQuestionAnsweredToday(userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await (supabase as any)
    .from('daily_question_log' as any)
    .upsert(
      {
        user_id: userId,
        date: getTodayDateString(),
        answered_at: new Date().toISOString(),
      } as any,
      { onConflict: 'user_id,date' }
    );

  if (error) {
    console.warn('Could not mark daily question as answered:', error.message);
  }
}

/**
 * Skip today's question.
 */
export async function skipDailyQuestion(questionId: string): Promise<DailyQuestionResult<void>> {
  const supabase = getSupabase();
  const { error } = await (supabase as any).rpc('skip_daily_question', {
    p_question_id: questionId,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }

  // Mark as skipped so it shows on next app open
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await markDailyQuestionShownToday(user.id);
  }

  return { data: null, error: null };
}

/**
 * Get answers for a question (paginated).
 */
export async function fetchDailyAnswers(
  questionId: string,
  limit = 50,
  offset = 0
): Promise<DailyQuestionResult<DailyAnswer[]>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_daily_answers', {
    p_question_id: questionId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: (data as DailyAnswer[]) ?? [], error: null };
}

/**
 * Get question stats.
 */
export async function fetchDailyQuestionStats(
  questionId: string
): Promise<DailyQuestionResult<DailyQuestionStats>> {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any).rpc('get_daily_question_stats', {
    p_question_id: questionId,
  });

  if (error) {
    return { data: null, error: dqError(error) };
  }

  const stats = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return { data: stats as DailyQuestionStats | null, error: null };
}

/**
 * Get all active questions (for admin/moderation).
 */
export async function fetchAllDailyQuestions(): Promise<DailyQuestionResult<DailyQuestion[]>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('daily_questions' as any)
    .select('*')
    .eq('is_active', true)
    .order('scheduled_date', { ascending: true });

  if (error) {
    return { data: null, error: dqError(error) };
  }
  return { data: (data as unknown as DailyQuestion[]) ?? [], error: null };
}

/**
 * Category emoji mapping for UI.
 */
export const CATEGORY_EMOJIS: Record<string, string> = {
  general: '💭',
  fun: '😄',
  deep: '🧠',
  hypothetical: '🌌',
  lifestyle: '🌿',
};

/**
 * Reaction emojis for answers.
 */
export const ANSWER_REACTIONS = ['❤️', '😂', '🔥', '👏', '🤝', '✨', '💡', '🌟'];