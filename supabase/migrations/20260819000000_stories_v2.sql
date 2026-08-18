-- ============================================================================
-- Stories 2.0: story-reply DMs reference the exact story
-- ----------------------------------------------------------------------------
-- 1. messages.story_id links a story-reply DM mirror to the story it replied
--    to, so chat can render "[Story preview] — <reply>" instead of a plain,
--    unrelated DM. The FK is `on delete set null`; story rows are never
--    hard-deleted (soft tombstones + expires_at), so the link survives expiry
--    and deletion gracefully.
-- 2. send_story_reply stamps that column on the mirrored message.
--
-- Expiration: already enforced gate side (every read path checks
--   `expires_at > now()` in RLS + each story RPC), so stories auto-expire
--   without manual deletion. View tracking is already idempotent
--   (record_story_view upserts on (story_id, viewer_id) and skips self-views).
-- ============================================================================

alter table public.messages
  add column if not exists story_id uuid references public.stories (id) on delete set null;

create index if not exists messages_story_id_idx on public.messages (story_id);

comment on column public.messages.story_id is
  'Set when the message is a story-reply DM mirror; links the DM to the exact story that was replied to.';

create or replace function public.send_story_reply (p_story uuid, p_body text)
  returns table (reply_id uuid, message_id uuid)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_author uuid;
  v_body text := trim (coalesce (p_body, ''));
  v_reply uuid;
  v_conv uuid;
  v_message uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if v_body = '' then
    raise exception 'A reply cannot be empty';
  end if;

  if char_length (v_body) > 2000 then
    raise exception 'Reply is too long';
  end if;

  select s.user_id into v_author
  from public.stories s
  where s.id = p_story
    and s.is_deleted = false
    and s.expires_at > now ()
    and (
      s.user_id = auth.uid ()
      or (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and auth.uid () in (f.user_id, f.friend_id)
            and s.user_id in (f.user_id, f.friend_id)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.user_id = auth.uid () and b.blocked_user_id = s.user_id)
             or (b.user_id = s.user_id and b.blocked_user_id = auth.uid ())
        )
      )
    );

  if v_author is null then
    raise exception 'Story not found or you cannot reply';
  end if;

  insert into public.story_replies (story_id, reply_from, reply_to, body)
  values (p_story, auth.uid (), v_author, v_body)
  returning id into v_reply;

  if v_author = auth.uid () then
    return query select v_reply, null::uuid;
  end if;

  select id into v_conv
  from public.conversations
  where user_a_id = least (auth.uid (), v_author)
    and user_b_id = greatest (auth.uid (), v_author);

  if v_conv is null then
    insert into public.conversations (user_a_id, user_b_id)
    values (least (auth.uid (), v_author), greatest (auth.uid (), v_author))
    returning id into v_conv;
  end if;

  insert into public.messages (conversation_id, sender_id, body, via_story_reply, story_id)
  values (v_conv, auth.uid (), v_body, true, p_story)
  returning id into v_message;

  update public.conversations set updated_at = now () where id = v_conv;

  return query select v_reply, v_message;
end;
$$;