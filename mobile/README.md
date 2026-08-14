# NEXA Mobile

The NEXA student-facing app, built with **Expo SDK 57** (React Native 0.86,
React 19, expo-router, TypeScript).

## Quick start

```bash
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
npm start              # expo start
```

The app talks to a live Supabase backend defined by `.env`. There is no
local-only mode.

## Scripts

| Script            | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `npm start`       | Start the Expo dev server                      |
| `npm run android` | Start on an Android emulator/device            |
| `npm run ios`     | Start on an iOS simulator/device               |
| `npm run web`     | Start the web build (Metro bundler)            |
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`)     |
| `npm run verify`  | Run the backend integration suite (128 checks) |

> The verify suite creates throwaway test users in the project's `auth.users`
> on every run. Expect `Result: 128 passed, 0 failed`.

## Code layout

```
src/
├── app/            # expo-router file-based routes
│   ├── (auth)/     #   register / login / landing
│   ├── (tabs)/     #   home, chats, communities, camera, profile, notifications
│   ├── chat/       #   1-to-1 conversation screens
│   ├── group/      #   group chat screens
│   ├── community/  #   community + channel screens
│   ├── events/     #   events
│   ├── polls/      #   polls
│   └── users/      #   public user profiles
├── components/     # shared UI + feature components
│   └── ui/         #   small primitives (Button, Text, Screen, …)
├── constants/      # theme
├── hooks/          # data-fetching hooks for each domain
├── lib/            # API layer + Supabase client + auth context
│   └── auth/       #   AuthProvider, error mapping
├── types/          # database row types
└── utils/          # formatting, validation
```

## Conventions

- Routes and screens use `expo-router`; use `router.push`/`Link` — never the
  raw `navigation` API.
- All backend access goes through `src/lib/*` modules (e.g. `messaging.ts`,
  `groups.ts`) against typed Supabase clients; keep SQL strings out of
  components.
- Auth state is provided by `AuthContext`; protected screens belong under the
  guarded route groups.
- Feature data flows through `src/hooks/use*` hooks that subscribe to Supabase
  Realtime where applicable.

## Uploads & media

Media is uploaded to Supabase Storage **before** any message is created — the
DB-side `send_media_message` refuses to register an attachment that doesn't
exist. Members get signed URLs to read attachments; outsiders are denied
(hardened in `supabase/migrations/20260812010000_fix_dm_media_uploads.sql`).

## Repository context

This app is one half of a larger monorepo — see the root `README.md` for the
admin dashboard (`admin/`), the SQL migrations (`supabase/migrations/`), and
the integration verification workflow.