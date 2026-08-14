'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/server';

export interface ActionResult {
  error?: string;
}

export async function loginAction(email: string, password: string): Promise<ActionResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    return { error: 'Invalid email or password.' };
  }

  // Verify the sign-in produced a valid session and that the user is an admin.
  const { data: sessionData } = await supabase.auth.getUser();
  const userId = sessionData.user?.id;
  if (!userId) {
    return { error: 'Sign-in did not produce a session.' };
  }

  const { data: isAdmin } = await supabase.rpc('is_admin', { p_user: userId });
  if (isAdmin !== true) {
    await supabase.auth.signOut();
    return { error: 'This account does not have administrator access.' };
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  const supabase = await createAdminClient();
  await supabase.auth.signOut();
}
