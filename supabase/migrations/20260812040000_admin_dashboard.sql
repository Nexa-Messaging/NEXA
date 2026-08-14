-- ============================================================================
-- Phase 16: NEXA Admin Dashboard
--
-- Platform-level administration for the NEXA app:
--   * admin_roles        — who is an administrator (super_admin / admin)
--   * profiles flags     — banned_at / suspended_until / ban_reason
--   * schools/departments — managed directory tables for the admin dashboard
--   * admin_* RPCs       — every admin action is a security-definer function
--                          gated by is_admin()/is_super_admin() using the
--                          caller's JWT. The client is never trusted.
--
-- The dashboard authenticates with Supabase Auth (an administrator's normal
-- account) and calls these RPCs. No service-role key is needed: authorization
-- is enforced by Postgres from the caller's own token.
--
-- BOOTSTRAP (do once):
--   insert into public.admin_roles (user_id, role)
--   values ('REPLACE_WITH_ADMIN_USER_UUID', 'super_admin');
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. admin_roles
-- ----------------------------------------------------------------------------
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('super_admin', 'admin')),
  created_at timestamptz not null default now (),
  created_by uuid references auth.users (id) on delete set null
);

comment on table public.admin_roles
  is 'Platform administrators. super_admin can manage other admins; admin can moderate.';

-- RLS on with no policies: the table is unreadable/unwritable by clients.
-- Admin access happens exclusively through security-definer admin_* RPCs that
-- re-check is_admin()/is_super_admin() from the caller JWT.
alter table public.admin_roles enable row level security;

-- Helper: is the caller an admin? (security definer, bypasses the locked-down RLS)
create or replace function public.is_admin (p_user uuid default auth.uid ())
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles where user_id = p_user
  );
$$;

-- Helper: is the caller a super admin?
create or replace function public.is_super_admin (p_user uuid default auth.uid ())
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = p_user and role = 'super_admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Profiles moderation flags
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists suspended_until timestamptz,
  add column if not exists ban_reason text;

comment on column public.profiles.banned_at
  is 'Set by an admin to permanently ban the account. The mobile app refuses sign-in when set.';
comment on column public.profiles.suspended_until
  is 'Temporary suspension window; the mobile app refuses sign-in until it passes.';
comment on column public.profiles.ban_reason
  is 'Admin-provided reason for the ban/suspension (shown to the affected user).';

-- ----------------------------------------------------------------------------
-- 3. Schools / departments directory
-- ----------------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid (),
  name text not null unique check (char_length (btrim (name)) between 1 and 120),
  created_at timestamptz not null default now ()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid (),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length (btrim (name)) between 1 and 120),
  created_at timestamptz not null default now ()
);

-- Expressions are not allowed in a unique constraint; use a partial-free
-- unique index on the trimmed, lower-cased name within a school.
create unique index if not exists departments_school_name_key
  on public.departments (school_id, lower (btrim (name)));

-- RLS: read-only to everyone via the anon key (school/department names are not
-- sensitive), writes only through admin_* RPCs. The mobile app keeps its own
-- free-text values, so this directory is purely for the dashboard.
alter table public.schools enable row level security;
alter table public.departments enable row level security;

create policy "schools_read_public"
  on public.schools for select to anon, authenticated using (true);
create policy "departments_read_public"
  on public.departments for select to anon, authenticated using (true);

grant select on public.schools to anon, authenticated;
grant select on public.departments to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Shared admin gate helpers used by every admin RPC
-- ----------------------------------------------------------------------------
create or replace function public.admin_require_admin ()
  returns void
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_admin (auth.uid ()) then
    raise exception 'Not authorized';
  end if;
end;
$$;

create or replace function public.admin_require_super_admin ()
  returns void
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_super_admin (auth.uid ()) then
    raise exception 'Not authorized';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Analytics
-- ----------------------------------------------------------------------------
create or replace function public.admin_analytics ()
  returns table (
    metric text,
    value bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_users bigint;
  v_active bigint;
  v_new_30d bigint;
  v_new_7d bigint;
  v_messages bigint;
  v_stories bigint;
  v_communities bigint;
  v_reports bigint;
  v_open_reports bigint;
begin
  perform public.admin_require_admin ();

  select count (*) into v_users from public.profiles;

  select count (distinct u.id) into v_active
  from public.profiles u
  where u.id in (
    select sender_id from public.messages where created_at > now () - interval '30 days'
    union
    select sender_id from public.group_messages where created_at > now () - interval '30 days'
    union
    select sender_id from public.community_messages where created_at > now () - interval '30 days'
    union
    select user_id from public.stories where created_at > now () - interval '30 days'
  );

  select count (*) into v_new_30d
  from public.profiles where created_at > now () - interval '30 days';
  select count (*) into v_new_7d
  from public.profiles where created_at > now () - interval '7 days';

  select count (*) into v_messages
  from (
    select id from public.messages
    union all
    select id from public.group_messages
    union all
    select id from public.community_messages
  ) all_messages;

  select count (*) into v_stories from public.stories where not is_deleted;
  select count (*) into v_communities from public.communities;
  select count (*) into v_reports from public.moderation_reports;
  select count (*) into v_open_reports
  from public.moderation_reports where status in ('open', 'reviewing');

  return query
    values
      ('total_users', v_users),
      ('active_users', v_active),
      ('new_users_30d', v_new_30d),
      ('new_users_7d', v_new_7d),
      ('messages', v_messages),
      ('stories', v_stories),
      ('communities', v_communities),
      ('reports', v_reports),
      ('open_reports', v_open_reports);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Users
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_users (
  p_search text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
  returns table (
    id uuid,
    email text,
    display_name text,
    username text,
    avatar_url text,
    school text,
    department text,
    level text,
    banned_at timestamptz,
    suspended_until timestamptz,
    ban_reason text,
    created_at timestamptz,
    is_admin bool,
    admin_role text
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_term text := '%' || lower (btrim (coalesce (p_search, ''))) || '%';
  v_limit int := greatest (1, least (coalesce (p_limit, 50), 200));
  v_offset int := greatest (0, coalesce (p_offset, 0));
begin
  perform public.admin_require_admin ();

  return query
    select
      pr.id,
      pr.email,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.school,
      pr.department,
      pr.level,
      pr.banned_at,
      pr.suspended_until,
      pr.ban_reason,
      pr.created_at,
      ar.user_id is not null as is_admin,
      ar.role as admin_role
    from public.profiles pr
    left join public.admin_roles ar on ar.user_id = pr.id
    where (
      p_search is null or p_search = ''
      or lower (pr.display_name) like v_term
      or lower (pr.username) like v_term
      or lower (pr.email) like v_term
    )
      and (
        p_status is null
        or (p_status = 'banned' and pr.banned_at is not null)
        or (p_status = 'suspended' and pr.suspended_until is not null and pr.suspended_until > now ())
        or (p_status = 'active'
            and pr.banned_at is null
            and (pr.suspended_until is null or pr.suspended_until <= now ()))
      )
    order by pr.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

create or replace function public.admin_user_detail (p_user uuid)
  returns table (
    id uuid,
    email text,
    display_name text,
    username text,
    avatar_url text,
    bio text,
    school text,
    department text,
    level text,
    banned_at timestamptz,
    suspended_until timestamptz,
    ban_reason text,
    created_at timestamptz,
    is_admin bool,
    admin_role text,
    messages_sent bigint,
    stories_posted bigint,
    communities_joined bigint,
    reports_filed bigint,
    reports_against bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  return query
    select
      pr.id,
      pr.email,
      pr.display_name,
      pr.username,
      pr.avatar_url,
      pr.bio,
      pr.school,
      pr.department,
      pr.level,
      pr.banned_at,
      pr.suspended_until,
      pr.ban_reason,
      pr.created_at,
      ar.user_id is not null,
      ar.role,
      (select count (*) from public.messages where sender_id = pr.id)
        + (select count (*) from public.group_messages where sender_id = pr.id)
        + (select count (*) from public.community_messages where sender_id = pr.id),
      (select count (*) from public.stories where user_id = pr.id),
      (select count (*) from public.community_members where user_id = pr.id),
      (select count (*) from public.moderation_reports where reporter_id = pr.id),
      (select count (*) from public.moderation_reports
        where target_type = 'user' and target_id = pr.id)
    from public.profiles pr
    left join public.admin_roles ar on ar.user_id = pr.id
    where pr.id = p_user;
end;
$$;

create or replace function public.admin_suspend_user (
  p_user uuid,
  p_until timestamptz,
  p_reason text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reason text := nullif (btrim (coalesce (p_reason, '')), '');
begin
  perform public.admin_require_admin ();

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  if auth.uid () = p_user then
    raise exception 'You cannot suspend your own account';
  end if;

  if p_until is null or p_until <= now () then
    raise exception 'Suspension must end in the future';
  end if;

  update public.profiles
     set suspended_until = p_until,
         banned_at = null,
         ban_reason = v_reason
   where id = p_user;
end;
$$;

create or replace function public.admin_ban_user (
  p_user uuid,
  p_reason text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reason text := nullif (btrim (coalesce (p_reason, '')), '');
begin
  perform public.admin_require_admin ();

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  if auth.uid () = p_user then
    raise exception 'You cannot ban your own account';
  end if;

  if exists (select 1 from public.admin_roles where user_id = p_user) then
    raise exception 'Admins cannot be banned; demote them first';
  end if;

  update public.profiles
     set banned_at = now (),
         suspended_until = null,
         ban_reason = v_reason
   where id = p_user;
end;
$$;

create or replace function public.admin_restore_user (p_user uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  update public.profiles
     set banned_at = null, suspended_until = null, ban_reason = null
   where id = p_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Reports + content removal
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_reports (
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
  returns table (
    id uuid,
    target_type text,
    target_id uuid,
    category text,
    details text,
    content text,
    status text,
    reporter_id uuid,
    reporter_name text,
    reporter_username text,
    created_at timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_limit int := greatest (1, least (coalesce (p_limit, 50), 200));
  v_offset int := greatest (0, coalesce (p_offset, 0));
begin
  perform public.admin_require_admin ();

  return query
    select
      r.id,
      r.target_type,
      r.target_id,
      r.category,
      r.details,
      r.content,
      r.status,
      r.reporter_id,
      rp.display_name,
      rp.username,
      r.created_at
    from public.moderation_reports r
    left join public.profiles rp on rp.id = r.reporter_id
    where p_status is null or r.status = p_status
    order by (r.status = 'open') desc, r.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

create or replace function public.admin_set_report_status (
  p_report uuid,
  p_status text
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();

  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  update public.moderation_reports
     set status = p_status
   where id = p_report;
end;
$$;

-- Removes the reported content (soft-delete + storage cleanup) and marks the
-- report resolved. target_type matches moderation_reports.target_type.
create or replace function public.admin_remove_reported_content (
  p_report uuid
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_target_type text;
  v_target_id uuid;
  v_path text;
begin
  perform public.admin_require_admin ();

  select target_type, target_id into v_target_type, v_target_id
  from public.moderation_reports where id = p_report;

  if not found then
    raise exception 'Report not found';
  end if;

  if v_target_type = 'message' then
    select media_path into v_path from public.messages where id = v_target_id;
    if found then
      update public.messages
         set deleted_at = now (), body = null, reactions = '[]'::jsonb
       where id = v_target_id;
      if v_path is not null then
        perform set_config ('storage.allow_delete_query', 'true', true);
        delete from storage.objects
        where bucket_id = 'message-attachments' and name = v_path;
      end if;
    end if;

  elsif v_target_type = 'group_message' then
    select media_path into v_path from public.group_messages where id = v_target_id;
    if found then
      update public.group_messages
         set deleted_at = now (), body = null, reactions = '[]'::jsonb
       where id = v_target_id;
      if v_path is not null then
        perform set_config ('storage.allow_delete_query', 'true', true);
        delete from storage.objects
        where bucket_id = 'group-attachments' and name = v_path;
      end if;
    end if;

  elsif v_target_type = 'community_message' then
    select media_path into v_path from public.community_messages where id = v_target_id;
    if found then
      update public.community_messages
         set deleted_at = now (), body = null, reactions = '[]'::jsonb
       where id = v_target_id;
      if v_path is not null then
        perform set_config ('storage.allow_delete_query', 'true', true);
        delete from storage.objects
        where bucket_id = 'community-attachments' and name = v_path;
      end if;
    end if;

  else
    raise exception 'This report type has no removable content (%); ban the user instead.', v_target_type;
  end if;

  update public.moderation_reports set status = 'resolved' where id = p_report;
end;
$$;

-- Direct content removal helpers (used by the dashboard independently of reports).
create or replace function public.admin_remove_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  perform public.admin_require_admin ();
  select media_path into v_path from public.messages where id = p_message;
  if not found then
    raise exception 'Message not found';
  end if;
  update public.messages set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;
  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'message-attachments' and name = v_path;
  end if;
end;
$$;

create or replace function public.admin_remove_group_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  perform public.admin_require_admin ();
  select media_path into v_path from public.group_messages where id = p_message;
  if not found then
    raise exception 'Message not found';
  end if;
  update public.group_messages set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;
  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'group-attachments' and name = v_path;
  end if;
end;
$$;

create or replace function public.admin_remove_community_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  perform public.admin_require_admin ();
  select media_path into v_path from public.community_messages where id = p_message;
  if not found then
    raise exception 'Message not found';
  end if;
  update public.community_messages set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;
  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'community-attachments' and name = v_path;
  end if;
end;
$$;

create or replace function public.admin_remove_story (p_story uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  perform public.admin_require_admin ();
  select media_path into v_path from public.stories where id = p_story;
  if not found then
    raise exception 'Story not found';
  end if;
  update public.stories set is_deleted = true where id = p_story;
  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'stories-media' and name = v_path;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Schools / departments management
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_schools ()
  returns table (
    id uuid,
    name text,
    created_at timestamptz,
    departments_count bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();
  return query
    select s.id, s.name, s.created_at,
           (select count (*) from public.departments d where d.school_id = s.id)
    from public.schools s
    order by s.name;
end;
$$;

create or replace function public.admin_create_school (p_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := btrim (coalesce (p_name, ''));
  v_id uuid;
begin
  perform public.admin_require_admin ();
  if char_length (v_name) < 1 or char_length (v_name) > 120 then
    raise exception 'School name must be between 1 and 120 characters';
  end if;
  insert into public.schools (name) values (v_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_rename_school (p_school uuid, p_name text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := btrim (coalesce (p_name, ''));
begin
  perform public.admin_require_admin ();
  if char_length (v_name) < 1 or char_length (v_name) > 120 then
    raise exception 'School name must be between 1 and 120 characters';
  end if;
  update public.schools set name = v_name where id = p_school;
  if not found then
    raise exception 'School not found';
  end if;
end;
$$;

create or replace function public.admin_delete_school (p_school uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();
  delete from public.schools where id = p_school;
  if not found then
    raise exception 'School not found';
  end if;
end;
$$;

create or replace function public.admin_list_departments ()
  returns table (
    id uuid,
    school_id uuid,
    school_name text,
    name text,
    created_at timestamptz
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();
  return query
    select d.id, d.school_id, s.name, d.name, d.created_at
    from public.departments d
    join public.schools s on s.id = d.school_id
    order by s.name, d.name;
end;
$$;

create or replace function public.admin_create_department (p_school uuid, p_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := btrim (coalesce (p_name, ''));
  v_id uuid;
begin
  perform public.admin_require_admin ();
  if not exists (select 1 from public.schools where id = p_school) then
    raise exception 'School not found';
  end if;
  if char_length (v_name) < 1 or char_length (v_name) > 120 then
    raise exception 'Department name must be between 1 and 120 characters';
  end if;
  insert into public.departments (school_id, name) values (p_school, v_name) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_rename_department (p_department uuid, p_name text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_name text := btrim (coalesce (p_name, ''));
begin
  perform public.admin_require_admin ();
  if char_length (v_name) < 1 or char_length (v_name) > 120 then
    raise exception 'Department name must be between 1 and 120 characters';
  end if;
  update public.departments set name = v_name where id = p_department;
  if not found then
    raise exception 'Department not found';
  end if;
end;
$$;

create or replace function public.admin_delete_department (p_department uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();
  delete from public.departments where id = p_department;
  if not found then
    raise exception 'Department not found';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Communities
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_communities (
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
  returns table (
    id uuid,
    name text,
    description text,
    school text,
    department text,
    level text,
    created_at timestamptz,
    members_count bigint,
    messages_count bigint,
    owner_name text,
    owner_username text
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_term text := '%' || lower (btrim (coalesce (p_search, ''))) || '%';
  v_limit int := greatest (1, least (coalesce (p_limit, 50), 200));
  v_offset int := greatest (0, coalesce (p_offset, 0));
begin
  perform public.admin_require_admin ();

  return query
    select
      c.id,
      c.name,
      c.description,
      c.school,
      c.department,
      c.level,
      c.created_at,
      (select count (*) from public.community_members m where m.community_id = c.id),
      (select count (*) from public.community_messages m where m.community_id = c.id),
      op.display_name,
      op.username
    from public.communities c
    left join public.profiles op on op.id = c.created_by
    where p_search is null or p_search = ''
       or lower (c.name) like v_term
       or lower (c.school) like v_term
       or lower (c.department) like v_term
    order by c.created_at desc
    limit v_limit
    offset v_offset;
end;
$$;

create or replace function public.admin_remove_community (p_community uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_avatar text;
begin
  perform public.admin_require_admin ();

  select avatar_path into v_avatar from public.communities where id = p_community;
  if not found then
    raise exception 'Community not found';
  end if;

  -- Remove media objects whose folder[1] is the community in each bucket.
  perform set_config ('storage.allow_delete_query', 'true', true);
  delete from storage.objects o
  where (o.bucket_id = 'community-attachments'
         and (storage.foldername (o.name)) [1] = p_community::text)
     or (o.bucket_id = 'community-avatars'
         and (storage.foldername (o.name)) [1] = p_community::text)
     or (o.bucket_id = 'event-images'
         and (storage.foldername (o.name)) [1] = p_community::text);

  delete from public.communities where id = p_community;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Admin management (super_admin only)
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_admins ()
  returns table (
    user_id uuid,
    role text,
    created_at timestamptz,
    display_name text,
    username text,
    email text
  )
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_admin ();
  return query
    select ar.user_id, ar.role, ar.created_at, pr.display_name, pr.username, pr.email
    from public.admin_roles ar
    left join public.profiles pr on pr.id = ar.user_id
    order by ar.role = 'super_admin' desc, ar.created_at;
end;
$$;

create or replace function public.admin_promote_admin (p_user uuid, p_role text default 'admin')
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_super_admin ();

  if p_role not in ('admin', 'super_admin') then
    raise exception 'Invalid admin role';
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'User not found';
  end if;

  insert into public.admin_roles (user_id, role, created_by)
  values (p_user, p_role, auth.uid ())
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.admin_demote_admin (p_user uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform public.admin_require_super_admin ();

  if auth.uid () = p_user then
    raise exception 'You cannot demote yourself';
  end if;

  delete from public.admin_roles where user_id = p_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants: every admin function is callable by any authenticated user, but each
-- re-checks is_admin()/is_super_admin() from the caller JWT before acting.
-- ----------------------------------------------------------------------------
grant execute on function public.is_admin (uuid) to authenticated;
grant execute on function public.is_super_admin (uuid) to authenticated;
grant execute on function public.admin_require_admin () to authenticated;
grant execute on function public.admin_require_super_admin () to authenticated;
grant execute on function public.admin_analytics () to authenticated;
grant execute on function public.admin_list_users (text, text, int, int) to authenticated;
grant execute on function public.admin_user_detail (uuid) to authenticated;
grant execute on function public.admin_suspend_user (uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_ban_user (uuid, text) to authenticated;
grant execute on function public.admin_restore_user (uuid) to authenticated;
grant execute on function public.admin_list_reports (text, int, int) to authenticated;
grant execute on function public.admin_set_report_status (uuid, text) to authenticated;
grant execute on function public.admin_remove_reported_content (uuid) to authenticated;
grant execute on function public.admin_remove_message (uuid) to authenticated;
grant execute on function public.admin_remove_group_message (uuid) to authenticated;
grant execute on function public.admin_remove_community_message (uuid) to authenticated;
grant execute on function public.admin_remove_story (uuid) to authenticated;
grant execute on function public.admin_list_schools () to authenticated;
grant execute on function public.admin_create_school (text) to authenticated;
grant execute on function public.admin_rename_school (uuid, text) to authenticated;
grant execute on function public.admin_delete_school (uuid) to authenticated;
grant execute on function public.admin_list_departments () to authenticated;
grant execute on function public.admin_create_department (uuid, text) to authenticated;
grant execute on function public.admin_rename_department (uuid, text) to authenticated;
grant execute on function public.admin_delete_department (uuid) to authenticated;
grant execute on function public.admin_list_communities (text, int, int) to authenticated;
grant execute on function public.admin_remove_community (uuid) to authenticated;
grant execute on function public.admin_list_admins () to authenticated;
grant execute on function public.admin_promote_admin (uuid, text) to authenticated;
grant execute on function public.admin_demote_admin (uuid) to authenticated;
