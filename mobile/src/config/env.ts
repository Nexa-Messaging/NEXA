/**
 * Centralized, type-safe access to environment configuration.
 *
 * Only `EXPO_PUBLIC_*` variables are inlined by Expo into the client bundle and
 * are therefore safe to reference here. Secrets such as the Supabase
 * `service_role` key must never be added with the `EXPO_PUBLIC_` prefix and must
 * never be imported from client code.
 */

const publicEnv: Record<string, string | undefined> = process.env as Record<
  string,
  string | undefined
>;

/** Returns the value of an environment variable without throwing when unset. */
function readPublicVar(key: string): string | undefined {
  return publicEnv[key]?.trim() || undefined;
}

export const env = {
  /** Public Supabase project URL. Returns `undefined` until configured. */
  get supabaseUrl(): string | undefined {
    return readPublicVar('EXPO_PUBLIC_SUPABASE_URL');
  },

  /** Public Supabase anonymous key. Returns `undefined` until configured. */
  get supabaseAnonKey(): string | undefined {
    return readPublicVar('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  },

  /**
   * Whether the environment variables required by a feature are present.
   * Features should not call their services until this returns true.
   */
  isConfigured(...keys: string[]): boolean {
    return keys.every((key) => readPublicVar(key) !== undefined);
  },
} as const;