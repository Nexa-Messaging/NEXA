# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Repo layout

- `mobile/` — the Expo (React Native) app. Run npm commands here.
- `admin/` — the Next.js admin dashboard. Run npm commands here.
- `supabase/migrations/` — versioned SQL applied manually to the live project.
- `mobile/scripts/verify.mjs` — backend integration suite (`cd mobile && npm run verify`).
- `mobile/scripts/gen-types.mjs` — regenerates `mobile/src/types/database.ts` from the live schema after a migration change (`cd mobile && npm run types:gen` with `SUPABASE_DB_URL` set, or `npm run types:gen:local` against the CLI stack). `database.ts` is generated output; hand-maintained convenience aliases live in `mobile/scripts/types-aliases.ts`.
- `supabase/seed.sql` — idempotent dev-only demo data (5 users, password `password123`). Never run on production.

After editing Schema (supabase/migrations), regenerate the client types and verify the mobile app still typechecks.
