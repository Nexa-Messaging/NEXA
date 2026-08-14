-- ============================================================================
-- NEXA — rich media messaging (photos, videos, voice notes)
--
-- Extends the 1:1 messaging schema with a per-message media payload stored in
-- a private Supabase Storage bucket:
--
--   * `messages` gains message_type + media metadata columns. Only the RPC
--     `send_media_message` can create media rows (no direct INSERT policy).
--   * Files live under `message-attachments/<conversation_id>/<sender_id>/<file>`
--     in a PRIVATE bucket. Upload/overwrite policies require membership of the
--     conversation folder and the caller's own sender-id subfolder. Download is
--     gated by membership so strangers can never open attachments.
--   * Clients fetch short-lived signed URLs via the storage API
--     (`createSignedUrl`), gated by the storage.objects SELECT policy.
--   * `delete_message` now also removes the stored object, and the chat-list
--     preview labels media messages ("📷 Photo", "🎬 Video", "🎤 Voice note").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. messages: media columns
-- ----------------------------------------------------------------------------
alter table public.messages
  add column message_type text not null default 'text',
  add column media_path text,
  add column media_mime text,
  add column media_width integer,
  add column media_height integer,
  add column media_duration numeric,
  add column media_size bigint;

alter table public.messages
  add constraint messages_message_type_ck
  check (message_type in ('text', 'image', 'video', 'voice'));

-- Media rows must reference the stored object; text rows must not.
alter table public.messages
  add constraint messages_media_requires_path_ck
  check (message_type = 'text' or media_path is not null);

create index messages_media_path on public.messages (media_path);

comment on column public.messages.message_type
  is 'Discriminator: text, image, video or voice. Rows are created via RPCs only.';
comment on column public.messages.media_path
  is 'Object path in the message-attachments storage bucket, "<conv>/<sender>/<file>".';
comment on column public.messages.media_duration
  is 'Playback duration in seconds for video and voice messages.';
comment on column public.messages.media_size
  is 'Uploaded file size in bytes.';

-- ----------------------------------------------------------------------------
-- 2. Private storage bucket for attachments
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- Upload: the caller must own the sender-id subfolder and belong to the
-- conversation named by the first path segment. The message row does not exist
-- yet at upload time, so the check is purely path-based (plus membership).
create policy "message_attachments_insert_member"
  on storage.objects
  for insert
  with check (
    bucket_id = 'message-attachments'
    and auth.uid () is not null
    and (storage.foldername (name)) [2] = auth.uid ()::text
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername (name)) [1]
        and auth.uid () in (c.user_a_id, c.user_b_id)
    )
  );

-- Overwrite (upsert retries) uses the same membership rule as insert.
create policy "message_attachments_update_member"
  on storage.objects
  for update
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

-- Download (and signed-URL generation): members of the conversation named by
-- the first path segment. Membership (not a message-row join) is used so that
-- freshly uploaded objects are ALSO visible under the SELECT policy — RLS
-- requires the target row of an UPDATE/DELETE to pass SELECT, so a
-- message-row-join here would block upserts/overwrites of unregistered files
-- with "new row violates row-level security policy".
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
-- 3. RPC functions
-- ----------------------------------------------------------------------------

-- Registers a media message. The object must already exist in storage under
-- "<conversation>/<caller>/...", the caller must be a member and not blocked.
create or replace function public.send_media_message (
  p_conversation uuid,
  p_media_path text,
  p_mime text,
  p_type text,
  p_caption text default null,
  p_reply_to uuid default null,
  p_width int default null,
  p_height int default null,
  p_duration numeric default null,
  p_size bigint default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_other uuid;
  v_body text := trim (coalesce (p_caption, ''));
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_type is null or p_type not in ('image', 'video', 'voice') then
    raise exception 'Unsupported media type';
  end if;

  if p_media_path is null or p_media_path = '' then
    raise exception 'Media file is missing';
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  select case when user_a_id = auth.uid () then user_b_id else user_a_id end
    into v_other
  from public.conversations
  where id = p_conversation and auth.uid () in (user_a_id, user_b_id);

  if v_other is null then
    raise exception 'Conversation not found';
  end if;

  if exists (
    select 1 from public.blocks
    where (user_id = auth.uid () and blocked_user_id = v_other)
       or (user_id = v_other and blocked_user_id = auth.uid ())
  ) then
    raise exception 'Unable to send a message';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'message-attachments'
      and name = p_media_path
      and (storage.foldername (name)) [1] = p_conversation::text
      and (storage.foldername (name)) [2] = auth.uid ()::text
  ) then
    raise exception 'Media file was not uploaded for this conversation';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to and conversation_id = p_conversation
  ) then
    raise exception 'The replied-to message does not exist';
  end if;

  insert into public.messages (
    conversation_id, sender_id, body, reply_to_id,
    message_type, media_path, media_mime, media_width, media_height,
    media_duration, media_size
  )
  values (
    p_conversation, auth.uid (), nullif (v_body, ''), p_reply_to,
    p_type, p_media_path, p_mime, p_width, p_height, p_duration, p_size
  )
  returning id into v_message;

  update public.conversations set updated_at = now () where id = p_conversation;

  return v_message;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. delete_message also removes the stored attachment
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 5. Chat-list preview labels media messages
-- ----------------------------------------------------------------------------
create or replace function public.list_conversations ()
  returns table (
    conversation_id uuid,
    other_user_id uuid,
    display_name text,
    username text,
    avatar_url text,
    last_message text,
    last_at timestamptz,
    unread_count bigint
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    c.id,
    case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end,
    p.display_name,
    p.username,
    p.avatar_url,
    case m.message_type
      when 'image' then '📷 Photo'
      when 'video' then '🎬 Video'
      when 'voice' then '🎤 Voice note'
      else coalesce (m.body, '')
    end,
    coalesce (m.created_at, c.updated_at),
    (select count (*)
       from public.messages mc
      where mc.conversation_id = c.id
        and mc.sender_id <> auth.uid ()
        and mc.read_at is null
        and mc.deleted_at is null)
  from public.conversations c
  join public.profiles p
    on p.id = case when c.user_a_id = auth.uid () then c.user_b_id else c.user_a_id end
  left join lateral (
    select body, message_type, created_at
    from public.messages m2
    where m2.conversation_id = c.id and m2.deleted_at is null
    order by m2.seq desc
    limit 1
  ) m on true
  where auth.uid () in (c.user_a_id, c.user_b_id)
  order by coalesce (m.created_at, c.updated_at) desc;
$$;
