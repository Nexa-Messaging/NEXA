# NEXA

NEXA is a campus social platform: a **React Native / Expo** mobile app for students
plus a **Next.js** admin dashboard for moderators, backed by a single **Supabase**
project (Postgres + Auth + Storage + Realtime).

This repository is a monorepo containing both applications and the database
schema that powers them.

## Repository layout

```
.
├── mobile/            # Expo (React Native) app — the student-facing client
│   ├── src/app/       #   expo-router file-based routes
│   ├── src/components/      #   shared UI + feature components
│   ├── src/hooks/           #   data-fetching hooks (Supabase + Realtime)
│   ├── src/lib/             #   API layer, auth context, supabase client
│   ├── src/types/           #   generated DB types
│   └── scripts/             #   integration verification harness
├── admin/             # Next.js (App Router) admin dashboard
│   ├── app/           #   routes, server actions, dashboard pages
│   └── lib/           #   auth guards, Supabase clients, types
├── supabase/
│   └── migrations/    # versioned SQL applied to the live project
├── .claude/           # agent tooling config
├── AGENTS.md          # instructions for AI coding agents
└── LICENSE
```

Each app is self-contained: its own `package.json`, dependencies, TypeScript
config, and environment file. They share nothing at build time except the
Supabase backend and the SQL schema.

## Feature overview

**Mobile app** (`mobile/`)
- Accounts: register, login, profile editing, avatars, username search
- Friendships: requests, accept/reject, block/unblock, friend lists
- Messaging: 1-to-1 DMs, group chats, reply threads, reactions, read/delivered
  receipts, realtime delivery
- Media: photos, videos, voice notes with storage-backed attachments
- Stories: post and view ephemeral stories
- Communities: groups of users with channels, plus events and polls
- Notifications and global search
- Reporting / moderation surfaces

**Admin dashboard** (`admin/`)
- User management: search, suspend, ban, restore
- Reports: triage, status changes, remove reported content
- Directory: managed schools and departments
- Community moderation: list and remove communities
- Analytics: user/message/story/community/report metrics
- Admin management (super admins only)

## Tech stack

| Layer          | Choice                                             |
| -------------- | -------------------------------------------------- |
| Mobile         | Expo SDK 57, React Native, React 19, TypeScript    |
| Admin          | Next.js 15 (App Router), React 19, TypeScript      |
| Backend        | Supabase (Postgres, Auth, Storage, Realtime)       |
| Verification   | Node scripts that exercise the live backend        |

## Prerequisites

- Node.js 20+ (developed on v24)
- npm
- A Supabase project (the app is server-backed; there is no local-only mode)
- **Supabase Auth setting:** "Disable email confirmation" should be **ON** for
  the verification script's session-dependent checks to pass.

## Getting started

The repo has no root `package.json` — each app manages its own dependencies.

### 1. Environment configuration

Both apps need the same Supabase project URL and **anon** (public) key.

**Mobile** — from `mobile/.env.example`:

```bash
cd mobile
cp .env.example .env   # then fill in:
# EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

**Admin** — from `admin/.env.example`:

```bash
cd admin
cp .env.example .env.local
```

> **Security note:** only `EXPO_PUBLIC_*` variables are bundled into the mobile
> app. Never put secrets (service-role keys, DB passwords, tokens) in
> `EXPO_PUBLIC_*` variables or anywhere in client code. The admin app uses the
> anon key plus server-side authorization — it never uses a `service_role` key.

### 2. Apply the database migrations

Apply the files in `supabase/migrations/` to your Supabase project **in order**
(they are idempotent and safe to re-run). The SQL Editor in the Supabase
Dashboard is the recommended tool.

### 3. Run the mobile app

```bash
cd mobile
npm install
npm start            # Expo dev server
npm run android      # or: npm run ios / npm run web
```

The app is configured for `expo-router` file-based routing; all screens live
under `mobile/src/app/`.

### 4. Run the admin dashboard

```bash
cd admin
npm install
npm run dev          # http://localhost:3000
```

Sign in with a NEXA account that has been granted the admin role (see
`admin/README.md` → bootstrap). Non-admin sign-ins are rejected.

## Verification

`mobile/scripts/verify.mjs` exercises the **live** Supabase backend end-to-end:
auth, profiles, RLS isolation, friendships, DMs, group chats, media, stories,
communities, polls/events, search, moderation, and admin gates.

```bash
cd mobile
npm run verify
```

Expected output ends with:

```
Result: 128 passed, 0 failed
```

The script creates throwaway users in your project's `auth.users` table on each
run; it cleans up after itself except for those auth users (kept deliberately,
as they may hold moderation fixtures referenced by later migrations).

## Typechecking

Both apps are strict TypeScript and typecheck independently:

```bash
cd mobile && npm run typecheck   # tsc --noEmit
cd admin  && npm run typecheck
cd admin  && npm run build       # production build check
```

## Security model

- **Client is never trusted.** The Supabase anon key is public by design; all
  authorization is enforced in the database via Row Level Security (RLS) and
  `security definer` functions that derive the caller from the JWT's
  `auth.uid()`.
- The **admin dashboard** re-checks the caller's JWT server-side
  (`auth.getUser()`) **and** asks the database (`is_admin` / `is_super_admin`
  RPCs) before any protected operation. Admin RPCs are themselves `security
  definer` and re-validate the role. No `service_role` key exists anywhere in
  this repo.
- Cross-user writes, outsider reads of private conversations/groups, and
  storage writes outside a caller's own folders are all rejected and covered by
  the verification script.

## Database migrations

All schema lives in `supabase/migrations/`, one file per feature/fix, in
dependency order. Each is idempotent. When changing the schema:

1. Add a new numbered file (`YYYYMMDDHHMMSS_description.sql`).
2. Apply it via the Supabase SQL Editor.
3. Run `cd mobile && npm run verify` to confirm nothing regressed.

## Contributing / development conventions

- Keep the two apps independent; do not import across `mobile/` and `admin/`.
- Always gate new admin functionality behind `requireAdmin()` in
  `admin/lib/admin.ts` and a security-definer RPC that re-checks the role.
- Run both typechecks and the verify suite before considering a change done.
- See `AGENTS.md` for AI-agent-specific instructions.
