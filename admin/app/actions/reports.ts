'use server';

import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
}

export async function setReportStatusAction(reportId: string, status: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_set_report_status', {
    p_report: reportId,
    p_status: status,
  });
  return error ? { error: error.message } : {};
}

export async function removeReportedContentAction(reportId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_reported_content', { p_report: reportId });
  return error ? { error: error.message } : {};
}

export async function removeMessageAction(messageId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_message', { p_message: messageId });
  return error ? { error: error.message } : {};
}

export async function removeGroupMessageAction(messageId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_group_message', { p_message: messageId });
  return error ? { error: error.message } : {};
}

export async function removeCommunityMessageAction(messageId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_community_message', { p_message: messageId });
  return error ? { error: error.message } : {};
}

export async function removeStoryAction(storyId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_story', { p_story: storyId });
  return error ? { error: error.message } : {};
}
