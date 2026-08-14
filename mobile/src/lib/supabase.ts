import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/config/env';
import { Database } from '@/types/database';

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file and restart the app.',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

let client: SupabaseClient<Database> | null = null;

/**
 * Returns a memoized Supabase client.
 *
 * The client is only created once the public env vars are present. Session
 * state (access + refresh tokens) is persisted through AsyncStorage so the
 * user stays signed in across app restarts.
 *
 * Only the ANON key is used here — the Supabase `service_role` key is a secret
 * and must never be bundled into, or referenced from, client code.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) {
    return client;
  }

  const url = env.supabaseUrl;
  const anonKey = env.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new SupabaseNotConfiguredError();
  }

  client = createClient<Database>(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}