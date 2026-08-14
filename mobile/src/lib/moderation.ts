import { getSupabase } from '@/lib/supabase';

export type ReportCategory =
  | 'spam'
  | 'harassment'
  | 'impersonation'
  | 'scam'
  | 'inappropriate_content'
  | 'other';

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  'spam',
  'harassment',
  'impersonation',
  'scam',
  'inappropriate_content',
  'other',
] as const;

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  impersonation: 'Impersonation',
  scam: 'Scam',
  inappropriate_content: 'Inappropriate content',
  other: 'Other',
};

/** Where a mute applies: a 1:1 conversation, a group chat or a community. */
export type MuteScope = 'dm' | 'group' | 'community';

function fallbackMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return message || fallback;
}

async function runReportRpc(
  name: string,
  targetArg: string,
  targetId: string,
  category: ReportCategory,
  details?: string,
): Promise<string | null> {
  const supabase = getSupabase();
  const args: Record<string, unknown> = {
    [targetArg]: targetId,
    p_category: category,
  };
  if (details && details.trim()) {
    args.p_details = details.trim();
  }
  const { error } = await supabase.rpc(name as never, args as never);
  return error ? fallbackMessage(error, 'Your report could not be submitted.') : null;
}

export function reportUser(
  targetId: string,
  category: ReportCategory,
  details?: string,
): Promise<string | null> {
  return runReportRpc('report_user', 'p_target', targetId, category, details);
}

export function reportMessage(
  messageId: string,
  category: ReportCategory,
  details?: string,
): Promise<string | null> {
  return runReportRpc('report_message', 'p_message', messageId, category, details);
}

export function reportGroupMessage(
  messageId: string,
  category: ReportCategory,
  details?: string,
): Promise<string | null> {
  return runReportRpc('report_group_message', 'p_message', messageId, category, details);
}

export function reportCommunityMessage(
  messageId: string,
  category: ReportCategory,
  details?: string,
): Promise<string | null> {
  return runReportRpc('report_community_message', 'p_message', messageId, category, details);
}

export async function isConversationMuted(
  scope: MuteScope,
  targetId: string,
): Promise<{ muted: boolean; error: string | null }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('is_conversation_muted', {
    p_scope: scope,
    p_target: targetId,
  });
  if (error) {
    return { muted: false, error: fallbackMessage(error, 'Could not check the mute state.') };
  }
  return { muted: data === true, error: null };
}

export async function setConversationMuted(
  scope: MuteScope,
  targetId: string,
  muted: boolean,
): Promise<string | null> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc(
    (muted ? 'mute_conversation' : 'unmute_conversation') as never,
    { p_scope: scope, p_target: targetId } as never,
  );
  return error
    ? fallbackMessage(
        error,
        muted ? 'Could not mute this conversation.' : 'Could not unmute this conversation.',
      )
    : null;
}
