'use server';

import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
}

export async function createSchoolAction(name: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_create_school', { p_name: name });
  return error ? { error: error.message } : {};
}

export async function renameSchoolAction(schoolId: string, name: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_rename_school', { p_school: schoolId, p_name: name });
  return error ? { error: error.message } : {};
}

export async function deleteSchoolAction(schoolId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_delete_school', { p_school: schoolId });
  return error ? { error: error.message } : {};
}

export async function createDepartmentAction(schoolId: string, name: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_create_department', {
    p_school: schoolId,
    p_name: name,
  });
  return error ? { error: error.message } : {};
}

export async function renameDepartmentAction(departmentId: string, name: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_rename_department', {
    p_department: departmentId,
    p_name: name,
  });
  return error ? { error: error.message } : {};
}

export async function deleteDepartmentAction(departmentId: string): Promise<ActionResult> {
  const principal = await requireAdmin();
  if (!principal.ok) return { error: 'Not authorized' };

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc('admin_delete_department', { p_department: departmentId });
  return error ? { error: error.message } : {};
}
