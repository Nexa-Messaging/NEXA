-- ---------------------------------------------------------------------------
-- Unread-conversation badge
--
-- The Chat tab shows the number of *distinct* conversations (1:1 + groups)
-- with at least one unread message, not the total number of unread messages.
-- There are no unread records to deduplicate: 1:1 unread is derived from
-- `messages.read_at` (per message row, set idempotently by mark_messages_read)
-- and group unread from `group_members.last_read_seq` (single watermark row,
-- PK (chat_id, user_id)).
-- ---------------------------------------------------------------------------

-- Partial index so unread existence checks only scan unread rows. Keeps the
-- per-row `unread_count` in `list_conversations` and the badge count in
-- `unread_conversation_count` cheap as conversations grow.
create index if not exists messages_unread_partial
  on public.messages (conversation_id, sender_id)
  where read_at is null and deleted_at is null;

-- Count of distinct conversations (direct + group) with unread messages for
-- the signed-in user. Lightweight: powers the Chat tab badge without fetching
-- the full inbox. Mirrors the unread filters used by `list_conversations`
-- (read_at null) and `list_group_chats` (seq > last_read_seq).
create or replace function public.unread_conversation_count ()
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    (select count (1)
       from public.conversations c
      where auth.uid () in (c.user_a_id, c.user_b_id)
        and exists (
          select 1
            from public.messages m
           where m.conversation_id = c.id
             and m.sender_id <> auth.uid ()
             and m.read_at is null
             and m.deleted_at is null
        ))
    +
    (select count (1)
       from public.group_members me
      where me.user_id = auth.uid ()
        and exists (
          select 1
            from public.group_messages gm
           where gm.chat_id = me.chat_id
             and gm.sender_id <> auth.uid ()
             and gm.deleted_at is null
             and gm.seq > me.last_read_seq
        ));
$$;

comment on function public.unread_conversation_count () is
  'Distinct conversations (DMs + groups) with unread messages; powers the Chat tab badge.';
