# NEXA Admin Dashboard

A separate Next.js (App Router) application for authorized administrators to
moderate the NEXA platform. It lives in its own directory with its own
`package.json` so it never interferes with the Expo mobile app.

This is part of a larger monorepo — see the root `README.md` for the mobile app
(`mobile/`) and the database migrations (`supabase/migrations/`).

## Capabilities

- **Users** — view, search, suspend, ban, restore.
- **Reports** — review reports, change status, remove reported content.
- **Schools / Departments** — managed directory CRUD.
- **Communities** — view and remove.
- **Analytics** — total/active/new users, messages, stories, communities, reports.
- **Admins** — super admins can promote/demote other admins.

## App structure

```
app/
├── login/          # server gate + client form (redirects non-admins)
├── (dashboard)/    # protected pages: overview, users, reports, schools,
│                   #   departments, communities, admins
├── actions/        # server actions — every action calls requireAdmin() first
└── layout.tsx      # root layout
lib/
├── admin.ts        # requireAdmin() — JWT validation + DB role check
└── supabase/       # server (cookie-based) and browser clients
middleware.ts       # session refresh on navigation
```

## Security model

The client is **never trusted**. Every protected page, route handler and server
action runs through `lib/admin.ts → requireAdmin()`, which:

1. Reads the caller's Supabase Auth cookie session (JWT).
2. Validates it against Supabase Auth (`auth.getUser()`).
3. Asks the **database** whether the authenticated user is an admin via the
   security-definer `is_admin` / `is_super_admin` RPCs, which derive the answer
   from the JWT's `auth.uid()`.

All admin actions are **security-definer Postgres functions** that re-check
`admin_require_admin()` / `admin_require_super_admin()` from the caller's JWT
before doing anything. No `service_role` key is used anywhere in this app; the
database is the source of truth for who is an administrator.

## Prerequisites

1. Apply the admin migration to your Supabase project
   (`supabase/migrations/20260812040000_admin_dashboard.sql`).
2. Bootstrap the first administrator (super admin) in the Supabase SQL Editor:

   ```sql
   insert into public.admin_roles (user_id, role)
   values ('<the-admin-user-uuid>', 'super_admin');
   ```

   Find the UUID with:
   ```sql
   select id, email from auth.users where email = 'admin@example.com';
   ```

3. Configure environment variables:
   Copy `admin/.env.example` to `admin/.env.local` and fill in your Supabase
   project URL and anon key (identical values to the mobile `.env`).

## Run

```bash
cd admin
npm install
npm run dev        # http://localhost:3000
```

Sign in with the administrator's NEXA account email/password. Non-admins are
redirected back to the login screen with "not authorized".

## Build & typecheck

```bash
cd admin
npm run typecheck  # tsc --noEmit
npm run build      # next build
```

## Notes

- The mobile app is unaffected: the migration only *adds* tables/columns and
  new `admin_*` functions; it does not change existing RLS behavior. The mobile
  `tsconfig.json` excludes `admin/` so the two apps typecheck independently.
- Re-running the migration is safe (idempotent).
- The `ban`/`suspend`/`restore` flags live on `profiles`
  (`banned_at`, `suspended_until`, `ban_reason`); the dashboard enforces them
  in the UI, and the mobile app may consume the flags for a lightweight
  "account disabled" state without changing RLS.