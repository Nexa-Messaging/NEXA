-- ============================================================================
-- Phase 13: Safety and moderation
-- ----------------------------------------------------------------------------
-- Moderation reports (user / DM message / group message / community message)
-- with fixed categories, plus per-user conversation muting for DM, group and
-- community conversations. Report rows are write-once, read-by-reporter and
-- reviewed by a future admin dashboard (not built yet); every write goes
-- through security-definer RPCs that re-check visibility so users can only
-- report content they can actually see.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Moderation reports
-- ----------------------------------------------------------------------------
create table public.moderation_reports (
  id uuid not null default gen_random_uuid (),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'message', 'group_message', 'community_message')),
  target_id uuid not null,
  category text not null check (category in ('spam', 'harassment', 'impersonation', 'scam', 'inappropriate_content', 'other')),
  details text,
  -- Snapshot of the reported content so moderators can review without extra
  -- lookups (display name/username for users, a body snippet for messages).
  content text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now (),

  primary key (id)
);

comment on table public.moderation_reports
  is 'User-submitted moderation reports. Reviewed by a future admin dashboard.';

comment on column public.moderation_reports.target_type
  is 'user | message (1:1) | group_message | community_message (posts/community content).';

comment on column public.moderation_reports.category
  is 'spam | harassment | impersonation | scam | inappropriate_content | other.';

create index moderation_reports_status_created
  on public.moderation_reports (status, created_at desc);
create index moderation_reports_target
  on public.moderation_reports (target_type, target_id);
create index moderation_reports_reporter
  on public.moderation_reports (reporter_id, created_at desc);

-- One open report per reporter per target: a duplicate open report is rejected
-- by the RPCs below (reviewed/dismissed/resolved reports may be filed again).
create unique index moderation_reports_open_unique
  on public.moderation_reports (reporter_id, target_type, target_id)
  where status = 'open';

alter table public.moderation_reports enable row level security;

-- Reporters can read their own reports (deletion of own reports is allowed so
-- a mistake can be retracted; inserts go through the RPCs).
create policy "moderation_reports_select_own"
  on public.moderation_reports
  for select to authenticated
  using (auth.uid () = reporter_id);

create policy "moderation_reports_delete_own"
  on public.moderation_reports
  for delete to authenticated
  using (auth.uid () = reporter_id);

-- ----------------------------------------------------------------------------
-- 2. Conversation mutes (per user, per scope)
-- ----------------------------------------------------------------------------
create table public.conversation_mutes (
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('dm', 'group', 'community')),
  target_id uuid not null,
  muted_at timestamptz not null default now (),

  primary key (user_id, scope, target_id)
);

comment on table public.conversation_mutes
  is 'Per-user mute flags for DM conversations, group chats and community conversations.';

create index conversation_mutes_target
  on public.conversation_mutes (scope, target_id);

alter table public.conversation_mutes enable row level security;

-- Only the owner touches their own mutes.
create policy "conversation_mutes_select_own"
  on public.conversation_mutes
  for select to authenticated
  using (auth.uid () = user_id);

create policy "conversation_mutes_insert_own"
  on public.conversation_mutes
  for insert to authenticated
  with check (auth.uid () = user_id);

create policy "conversation_mutes_delete_own"
  on public.conversation_mutes
  for delete to authenticated
  using (auth.uid () = user_id);

-- ----------------------------------------------------------------------------
-- 3. Shared helpers
-- ----------------------------------------------------------------------------

create or replace function public.report_category_ok (p_category text)
  returns boolean
  language sql
  immutable
  set search_path = public
as $$
  select p_category in ('spam', 'harassment', 'impersonation', 'scam', 'inappropriate_content', 'other');
$$;

-- Membership checks used by the report/mute RPCs. All security definer (they
-- only SELECT and return a boolean, never expose row contents).
create or replace function public.can_see_message (p_message uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message
      and auth.uid () in (c.user_a_id, c.user_b_id)
  );
$$;

create or replace function public.can_see_group_message (p_message uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.group_messages m
    join public.group_members me on me.chat_id = m.chat_id and me.user_id = auth.uid ()
    where m.id = p_message
  );
$$;

create or replace function public.can_see_community_message (p_message uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.community_messages m
    join public.community_members me on me.community_id = m.community_id and me.user_id = auth.uid ()
    where m.id = p_message
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Report RPCs
-- ----------------------------------------------------------------------------

create or replace function public.report_user (
  p_target uuid,
  p_category text,
  p_details text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_details text := btrim (coalesce (p_details, ''));
  v_display text;
  v_username text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid () = p_target then
    raise exception 'You cannot report yourself';
  end if;

  if not public.report_category_ok (p_category) then
    raise exception 'Invalid report category';
  end if;

  if char_length (v_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  select pr.display_name, pr.username into v_display, v_username
  from public.profiles pr where pr.id = p_target;

  if v_display is null then
    raise exception 'This user does not exist';
  end if;

  insert into public.moderation_reports (reporter_id, target_type, target_id, category, details, content)
  values (auth.uid (), 'user', p_target, p_category, nullif (v_details, ''), v_display || ' (@' || coalesce (v_username, '') || ')');
end;
$$;

create or replace function public.report_message (
  p_message uuid,
  p_category text,
  p_details text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_details text := btrim (coalesce (p_details, ''));
  v_body text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not public.report_category_ok (p_category) then
    raise exception 'Invalid report category';
  end if;

  if char_length (v_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  if not public.can_see_message (p_message) then
    raise exception 'Message not found or you cannot see it';
  end if;

  select m.body into v_body from public.messages m where m.id = p_message;

  insert into public.moderation_reports (reporter_id, target_type, target_id, category, details, content)
  values (auth.uid (), 'message', p_message, p_category, nullif (v_details, ''), left (coalesce (v_body, ''), 200));
end;
$$;

create or replace function public.report_group_message (
  p_message uuid,
  p_category text,
  p_details text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_details text := btrim (coalesce (p_details, ''));
  v_body text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not public.report_category_ok (p_category) then
    raise exception 'Invalid report category';
  end if;

  if char_length (v_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  if not public.can_see_group_message (p_message) then
    raise exception 'Message not found or you cannot see it';
  end if;

  select m.body into v_body from public.group_messages m where m.id = p_message;

  insert into public.moderation_reports (reporter_id, target_type, target_id, category, details, content)
  values (auth.uid (), 'group_message', p_message, p_category, nullif (v_details, ''), left (coalesce (v_body, ''), 200));
end;
$$;

create or replace function public.report_community_message (
  p_message uuid,
  p_category text,
  p_details text default null
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_details text := btrim (coalesce (p_details, ''));
  v_body text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not public.report_category_ok (p_category) then
    raise exception 'Invalid report category';
  end if;

  if char_length (v_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  if not public.can_see_community_message (p_message) then
    raise exception 'Message not found or you cannot see it';
  end if;

  select m.body into v_body from public.community_messages m where m.id = p_message;

  insert into public.moderation_reports (reporter_id, target_type, target_id, category, details, content)
  values (auth.uid (), 'community_message', p_message, p_category, nullif (v_details, ''), left (coalesce (v_body, ''), 200));
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Mute RPCs (scope: dm | group | community)
-- ----------------------------------------------------------------------------

create or replace function public.can_mute_scope (p_scope text, p_target uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select case p_scope
    when 'dm' then exists (
      select 1 from public.conversations c
      where c.id = p_target and auth.uid () in (c.user_a_id, c.user_b_id)
    )
    when 'group' then exists (
      select 1 from public.group_members me
      where me.chat_id = p_target and me.user_id = auth.uid ()
    )
    when 'community' then exists (
      select 1 from public.community_members me
      where me.community_id = p_target and me.user_id = auth.uid ()
    )
    else false
  end;
$$;

create or replace function public.mute_conversation (p_scope text, p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_scope not in ('dm', 'group', 'community') then
    raise exception 'Invalid mute scope';
  end if;

  if not public.can_mute_scope (p_scope, p_target) then
    raise exception 'Conversation not found or you are not a member';
  end if;

  insert into public.conversation_mutes (user_id, scope, target_id)
  values (auth.uid (), p_scope, p_target)
  on conflict (user_id, scope, target_id) do nothing;
end;
$$;

create or replace function public.unmute_conversation (p_scope text, p_target uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.conversation_mutes
   where user_id = auth.uid () and scope = p_scope and target_id = p_target;

  if not found then
    raise exception 'This conversation is not muted';
  end if;
end;
$$;

create or replace function public.is_conversation_muted (p_scope text, p_target uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.conversation_mutes m
    where m.user_id = auth.uid () and m.scope = p_scope and m.target_id = p_target
  );
$$;

-- ----------------------------------------------------------------------------
-- 6. Blocked users cannot react to a DM they can no longer interact with
-- ----------------------------------------------------------------------------

-- Reaction RPCs previously only checked conversation membership. A blocked
-- user could still react to past messages in an existing conversation, which
-- defeats the block. Add the same block guard used by send_message.
create or replace function public.react_to_message (p_message uuid, p_emoji text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_other uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_emoji is null or char_length (p_emoji) > 32 then
    raise exception 'Emoji is not valid';
  end if;

  select case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end
    into v_other
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = p_message;

  if v_other is null then
    raise exception 'Message not found or you are not a participant';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = v_other)
       or (user_id = v_other and blocked_user_id = auth.uid ())
  ) then
    raise exception 'Unable to react to this message';
  end if;

  update public.messages
     set reactions = case
       when exists (
         select 1 from jsonb_array_elements (reactions) e
         where e->>'user_id' = auth.uid ()::text and e->>'emoji' = p_emoji
       ) then reactions
       else reactions || jsonb_build_array (
         jsonb_build_object ('user_id', auth.uid ()::text, 'emoji', p_emoji)
       )
     end
   where id = p_message;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
grant execute on function public.report_user (uuid, text, text) to authenticated;
grant execute on function public.report_message (uuid, text, text) to authenticated;
grant execute on function public.report_group_message (uuid, text, text) to authenticated;
grant execute on function public.report_community_message (uuid, text, text) to authenticated;
grant execute on function public.mute_conversation (text, uuid) to authenticated;
grant execute on function public.unmute_conversation (text, uuid) to authenticated;
grant execute on function public.is_conversation_muted (text, uuid) to authenticated;
