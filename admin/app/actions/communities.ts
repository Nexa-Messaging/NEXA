'use server';

import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
}

export async function removeCommunityAction(communityId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_remove_community', { p_community: communityId });
  return error ? { error: error.message } : {};
}
