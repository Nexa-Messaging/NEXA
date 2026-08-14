-- ============================================================================
-- Fix: infinite recursion in group_members / community_members SELECT policies
--
-- The original policies checked membership by SELECTing from the very table
-- they guard (`exists (select 1 from public.group_members ...)`). Postgres
-- folds that inner SELECT through RLS again, hits the same policy, and bails
-- out with:
--     infinite recursion detected in policy for relation "group_members"
-- so ANY direct client read of group_messages / group_members / group_chats
-- (or their community equivalents) failed. The RPC-based flows still worked
-- because they are security definer and skip RLS.
--
-- Fix: introduce security-definer membership helpers (the inner SELECT is not
-- re-folded through RLS), and rewrite the recursive policies to use them.
-- Idempotent: safe to run on projects that never applied the buggy policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Membership helpers (shared by the repaired policies)
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member (p_chat uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.group_members m
    where m.chat_id = p_chat and m.user_id = auth.uid ()
  );
$$;

create or replace function public.is_community_member (p_community uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.community_members me
    where me.community_id = p_community and me.user_id = auth.uid ()
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Rewrite the group chat policies
-- ----------------------------------------------------------------------------
drop policy if exists "group_chats_select_member" on public.group_chats;
drop policy if exists "group_members_select_member" on public.group_members;
drop policy if exists "group_messages_select_member" on public.group_messages;

create policy "group_chats_select_member"
  on public.group_chats
  for select
  using (public.is_group_member (id));

create policy "group_members_select_member"
  on public.group_members
  for select
  using (public.is_group_member (chat_id));

create policy "group_messages_select_member"
  on public.group_messages
  for select
  using (public.is_group_member (chat_id));

-- ----------------------------------------------------------------------------
-- 3. Rewrite the community policies
-- ----------------------------------------------------------------------------
drop policy if exists "community_members_select_member" on public.community_members;
drop policy if exists "community_channels_select_member" on public.community_channels;
drop policy if exists "community_messages_select_member" on public.community_messages;
drop policy if exists "community_channel_reads_select_member" on public.community_channel_reads;

create policy "community_members_select_member"
  on public.community_members
  for select
  using (public.is_community_member (community_id));

create policy "community_channels_select_member"
  on public.community_channels
  for select
  using (public.is_community_member (community_id));

create policy "community_messages_select_member"
  on public.community_messages
  for select
  using (public.is_community_member (community_id));

create policy "community_channel_reads_select_member"
  on public.community_channel_reads
  for select
  using (public.is_community_member (community_id));