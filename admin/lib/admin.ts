import { createAdminClient } from '@/lib/supabase/server';

export type AdminPrincipal =
  | { ok: true; userId: string; role: 'admin' | 'super_admin' }
  | { ok: false; reason: 'no_session' | 'not_admin' };

export type AdminRole = 'admin' | 'super_admin';

/**
 * Server-side authorization gate used by every server component, route handler
 * and server action.
 *
 * The client NEVER tells us who is an administrator. We read the caller's JWT
 * from the cookie session, validate it against Supabase Auth, and then ask the
 * database (security-definer `is_admin` / `is_super_admin` RPCs) whether that
 * user holds an admin role. Any browser-claimed admin status is ignored.
 *
 * `admin_roles` is RLS-locked shut for clients, so the RPCs are the only way to
 * discover admin status — and they derive it from the caller's own JWT.
 */
export async function requireAdmin(): Promise<AdminPrincipal> {
  const supabase = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, reason: 'no_session' };
  }

  const { data: isAdmin } = await supabase.rpc('is_admin', { p_user: user.id });
  if (isAdmin !== true) {
    return { ok: false, reason: 'not_admin' };
  }

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', {
    p_user: user.id,
  });
  const role: AdminRole = isSuperAdmin === true ? 'super_admin' : 'admin';

  return { ok: true, userId: user.id, role };
}
