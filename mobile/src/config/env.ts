/**
 * Centralized, type-safe access to environment configuration.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined by Expo into the client bundle and
 * are therefore safe to reference here. Secrets such as the Supabase
 * `service_role` key must never be added with the `EXPO_PUBLIC_` prefix and must
 * never be imported from client code.
 *
 * IMPORTANT: Expo only inlines `process.env.EXPO_PUBLIC_*` when it is referenced
 * with static dot notation (e.g. `process.env.EXPO_PUBLIC_SUPABASE_URL`).
 * Dynamic access via `process.env[key]` or destructuring is NOT inlined, so the
 * values below must always be static property accesses on `process.env`.
 */

const supabaseUrlRaw = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKeyRaw = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Reads a value, trimming whitespace and normalizing empty strings to undefined. */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  /** Public Supabase project URL. Returns `undefined` until configured. */
  get supabaseUrl(): string | undefined {
    return clean(supabaseUrlRaw);
  },

  /** Public Supabase anonymous key. Returns `undefined` until configured. */
  get supabaseAnonKey(): string | undefined {
    return clean(supabaseAnonKeyRaw);
  },
} as const;
