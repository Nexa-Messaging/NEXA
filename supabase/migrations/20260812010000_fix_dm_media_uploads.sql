-- ============================================================================
-- Fix: DM attachment uploads/overwrites and storage deletions after platform
-- hardening.
--
-- 1. message-attachments SELECT policy blocked UPDATE/UPSERT.
--    PostgreSQL RLS requires the target row of an UPDATE/DELETE to be visible
--    under the table's SELECT policy. The old policy only matched objects that
--    already had a row in `messages` (m.media_path = name), so a freshly
--    uploaded file — which has no message row yet — never matched, and every
--    retry / upsert failed with:
--        new row violates row-level security policy
--    Plain INSERT still worked (INSERT only checks the INSERT policy), which is
--    why only the upsert paths in verify.mjs failed. Group / community / event
--    buckets already used folder-membership SELECT policies.
--    Fix: base the SELECT (and DELETE) policies on conversation membership of
--    the path's first folder, exactly like the other private buckets.
--
-- 2. Direct DELETE from storage.objects is now rejected.
--    Newer storage platforms install a statement-level trigger that rejects
--    ANY direct DELETE on storage.buckets / storage.objects / storage.prefixes
--    unless the session variable `storage.allow_delete_query` is set to 'true'
--    (the Storage API sets it automatically). RPCs that remove objects inline
--    must therefore opt in before deleting. This fix is applied to every
--    function that deletes storage rows.
--
-- Idempotent: safe to run on projects that already applied the changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. message-attachments policies
-- ----------------------------------------------------------------------------
drop policy if exists "message_attachments_select_member" on storage.objects;
create policy "message_attachments_select_member"
  on storage.objects
  for select
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername (name)) [1]
        and auth.uid () in (c.user_a_id, c.user_b_id)
    )
  );

-- Removal: the caller owns the sender subfolder and belongs to the
-- conversation named by the first path segment (matches insert/update).
drop policy if exists "message_attachments_delete_sender" on storage.objects;
create policy "message_attachments_delete_sender"
  on storage.objects
  for delete
  using (
    bucket_id = 'message-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername (name)) [1]
        and auth.uid () in (c.user_a_id, c.user_b_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Opt in to direct storage deletes inside the RPCs that remove objects
-- ----------------------------------------------------------------------------

-- DM media: delete_message
create or replace function public.delete_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select media_path into v_path
  from public.messages
  where id = p_message and sender_id = auth.uid ();

  if not found then
    raise exception 'Message not found or you are not its sender';
  end if;

  update public.messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message and sender_id = auth.uid ();

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'message-attachments' and name = v_path;
  end if;
end;
$$;

-- Stories: delete_story
create or replace function public.delete_story (p_story uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select media_path into v_path
  from public.stories
  where id = p_story and user_id = auth.uid () and not is_deleted;

  if not found then
    raise exception 'Story not found or you are not its owner';
  end if;

  update public.stories set is_deleted = true where id = p_story;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'stories-media' and name = v_path;
  end if;
end;
$$;

-- Stories: purge_expired_stories (maintenance, never touches story rows)
create or replace function public.purge_expired_stories (p_older_than_days int default 1)
  returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_deleted bigint;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_older_than_days is null or p_older_than_days < 1 then
    raise exception 'Retention must be at least 1 day';
  end if;

  perform set_config ('storage.allow_delete_query', 'true', true);
  delete from storage.objects o
  using public.stories s
  where o.bucket_id = 'stories-media'
    and o.name = s.media_path
    and (
      s.is_deleted = true
      or s.expires_at < now () - make_interval (days => p_older_than_days)
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Group messages: delete_group_message
create or replace function public.delete_group_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
  v_chat uuid;
  v_role text;
  v_author uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select chat_id, media_path, sender_id into v_chat, v_path, v_author
  from public.group_messages where id = p_message;

  if not found then
    raise exception 'Message not found';
  end if;

  select role into v_role from public.group_members
  where chat_id = v_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this message';
  end if;

  update public.group_messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'group-attachments' and name = v_path;
  end if;
end;
$$;

-- Group photo: set_group_avatar (drops the previous photo)
create or replace function public.set_group_avatar (p_chat uuid, p_avatar_path text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_old_path text;
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_avatar_path is null or p_avatar_path = '' then
    raise exception 'Photo file is missing';
  end if;

  select role into v_role from public.group_members
  where chat_id = p_chat and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Group not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can change the group photo';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'group-avatars'
      and name = p_avatar_path
      and (storage.foldername (name)) [1] = p_chat::text
  ) then
    raise exception 'Photo was not uploaded for this group';
  end if;

  select avatar_path into v_old_path
  from public.group_chats where id = p_chat;

  update public.group_chats set avatar_path = p_avatar_path where id = p_chat;

  -- Drop the previous photo so old signed URLs stop resolving.
  if v_old_path is not null and v_old_path <> p_avatar_path then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'group-avatars' and name = v_old_path;
  end if;
end;
$$;

-- Community messages: delete_community_message
create or replace function public.delete_community_message (p_message uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_path text;
  v_community uuid;
  v_role text;
  v_author uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, media_path, sender_id into v_community, v_path, v_author
  from public.community_messages where id = p_message;

  if not found then
    raise exception 'Message not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this message';
  end if;

  update public.community_messages
     set deleted_at = now (), body = null, reactions = '[]'::jsonb
   where id = p_message;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'community-attachments' and name = v_path;
  end if;
end;
$$;

-- Community photo: set_community_avatar (drops the previous photo)
create or replace function public.set_community_avatar (p_community uuid, p_avatar_path text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_old_path text;
  v_role text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_avatar_path is null or p_avatar_path = '' then
    raise exception 'Photo file is missing';
  end if;

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if v_role not in ('admin', 'owner') then
    raise exception 'Only admins can change the community photo';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'community-avatars'
      and name = p_avatar_path
      and (storage.foldername (name)) [1] = p_community::text
  ) then
    raise exception 'Photo was not uploaded for this community';
  end if;

  select avatar_path into v_old_path
  from public.communities where id = p_community;

  update public.communities set avatar_path = p_avatar_path where id = p_community;

  if v_old_path is not null and v_old_path <> p_avatar_path then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'community-avatars' and name = v_old_path;
  end if;
end;
$$;

-- Community teardown: leave_community (owner leaving a 1-member community)
create or replace function public.leave_community (p_community uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role text;
  v_next uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.community_members
  where community_id = p_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  delete from public.community_members
   where community_id = p_community and user_id = auth.uid ();

  if v_role = 'owner' then
    select user_id into v_next
    from public.community_members
    where community_id = p_community
    order by case when role = 'admin' then 0 else 1 end, joined_at
    limit 1;

    if v_next is null then
      perform set_config ('storage.allow_delete_query', 'true', true);
      delete from storage.objects
      where bucket_id = 'community-attachments'
        and (storage.foldername (name)) [1] = p_community::text;
      delete from storage.objects
      where bucket_id = 'community-avatars'
        and (storage.foldername (name)) [1] = p_community::text;
      delete from public.communities where id = p_community;
    else
      update public.community_members
         set role = 'owner'
       where community_id = p_community and user_id = v_next;
    end if;
  end if;
end;
$$;

-- Events: delete_community_event (drops the event cover image)
create or replace function public.delete_community_event (p_event uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_community uuid;
  v_author uuid;
  v_role text;
  v_path text;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  select community_id, created_by, image_path into v_community, v_author, v_path
  from public.community_events where id = p_event;

  if v_community is null then
    raise exception 'Event not found';
  end if;

  select role into v_role from public.community_members
  where community_id = v_community and user_id = auth.uid ();

  if v_role is null then
    raise exception 'Community not found or you are not a member';
  end if;

  if auth.uid () <> v_author and v_role not in ('admin', 'owner') then
    raise exception 'You are not allowed to delete this event';
  end if;

  delete from public.community_events where id = p_event;

  if v_path is not null then
    perform set_config ('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'event-images' and name = v_path;
  end if;
end;
$$;