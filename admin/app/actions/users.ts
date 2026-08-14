'use server';

import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
}

export async function suspendUserAction(
  userId: string,
  untilIso: string,
  reason?: string,
): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_suspend_user', {
    p_user: userId,
    p_until: untilIso,
    p_reason: reason || null,
  });
  return error ? { error: error.message } : {};
}

export async function banUserAction(userId: string, reason?: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_ban_user', {
    p_user: userId,
    p_reason: reason || null,
  });
  return error ? { error: error.message } : {};
}

export async function restoreUserAction(userId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_restore_user', { p_user: userId });
  return error ? { error: error.message } : {};
}

export async function promoteAdminAction(userId: string, role: 'admin' | 'super_admin'): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };
  if (principal.role !== 'super_admin') return { error: 'Only super admins can manage administrators' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_promote_admin', { p_user: userId, p_role: role });
  return error ? { error: error.message } : {};
}

export async function demoteAdminAction(userId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };
  if (principal.role !== 'super_admin') return { error: 'Only super admins can manage administrators' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_demote_admin', { p_user: userId });
  return error ? { error: error.message } : {};
}
