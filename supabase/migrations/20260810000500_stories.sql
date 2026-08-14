-- ============================================================================
-- NEXA — Stories / Moments (Snapchat-style temporary content)
--
-- Users post photo, video or text stories that disappear after 24 hours.
-- Stories are visible only to friends (and the owner). Friends can view them,
-- react with an emoji, reply (which also opens a DM with the author) and the
-- author can see who viewed and delete their own stories.
--
-- Expiration design (retention + privacy):
--   * Expiry is DATA-STATE, not destruction. `expires_at` hides a story from
--     every read path (RLS + list_stories), but the ROW is never deleted, so
--     analytics/moderation keep the full record, view counts and replies.
--   * Explicit deletion (`delete_story`) is a privacy-driven soft delete:
--     `is_deleted = true` tombstones the row (audit trail) and the media file
--     is removed from storage so the owner's content is actually gone.
--   * Storage reclamation (optional) is an admin maintenance RPC
--     `purge_expired_stories` that deletes ONLY storage objects for soft
--     deleted or long-expired stories. It never deletes database rows.
--
-- Storage: private bucket `stories-media`, path "<user_id>/<timestamp>-<file>".
-- Upload/overwrite/delete are owner-only via the first path segment; download
-- (and signed-URL generation) is granted to the owner and their friends.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. stories
-- ----------------------------------------------------------------------------
create table public.stories (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video', 'text')),
  media_path text,
  media_mime text,
  media_width integer,
  media_height integer,
  media_duration numeric,
  media_size bigint,
  body text,
  created_at timestamptz not null default now (),
  expires_at timestamptz not null,
  is_deleted boolean not null default false,

  primary key (id),
  constraint stories_media_requires_path check (
    (kind in ('photo', 'video') and media_path is not null)
    or (kind = 'text' and media_path is null)
  ),
  constraint stories_text_requires_body check (
    (kind = 'text' and body is not null and char_length (body) > 0)
    or kind <> 'text'
  ),
  constraint stories_body_length check (body is null or char_length (body) <= 4000)
);

comment on column public.stories.expires_at
  is 'Stories disappear after this instant (default 24h). Rows are never deleted.';
comment on column public.stories.is_deleted
  is 'Privacy tombstone set by delete_story; keeps rows for analytics/moderation.';

create index stories_user_active
  on public.stories (user_id, created_at desc)
  where not is_deleted;

-- ----------------------------------------------------------------------------
-- 2. story_views, story_reactions, story_replies
-- ----------------------------------------------------------------------------
create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now (),

  primary key (story_id, viewer_id)
);

create index story_views_viewer on public.story_views (viewer_id, created_at desc);

create table public.story_reactions (
  id bigint not null generated always as identity,
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now (),

  primary key (id),
  unique (story_id, user_id),
  constraint story_reactions_emoji_length check (char_length (emoji) <= 16)
);

create index story_reactions_story on public.story_reactions (story_id);

create table public.story_replies (
  id uuid not null default gen_random_uuid (),
  story_id uuid not null references public.stories (id) on delete cascade,
  reply_from uuid not null references auth.users (id) on delete cascade,
  reply_to uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now (),

  primary key (id),
  constraint story_replies_body_length check (char_length (body) <= 2000)
);

create index story_replies_story on public.story_replies (story_id);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

-- Story read access: the owner, or an accepted friend, provided nobody has
-- blocked the other and the story has not been deleted or expired. There are
-- deliberately NO insert/update/delete policies: every write goes through the
-- RPC functions in section 6.
create policy "stories_select_self_friends"
  on public.stories
  for select
  using (
    is_deleted = false
    and expires_at > now ()
    and (
      user_id = auth.uid ()
      or (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and auth.uid () in (f.user_id, f.friend_id)
            and user_id in (f.user_id, f.friend_id)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.user_id = auth.uid () and b.blocked_user_id = user_id)
             or (b.user_id = user_id and b.blocked_user_id = auth.uid ())
        )
      )
    )
  );

-- Views/reactions/replies are visible to the author and the participants
-- themselves (a viewer sees their own rows; the author sees everything).
create policy "story_views_select_participants"
  on public.story_views
  for select
  using (
    viewer_id = auth.uid ()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid ()
    )
  );

create policy "story_reactions_select_participants"
  on public.story_reactions
  for select
  using (
    user_id = auth.uid ()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid ()
    )
  );

create policy "story_replies_select_participants"
  on public.story_replies
  for select
  using (
    reply_from = auth.uid ()
    or exists (
      select 1 from public.stories s
      where s.id = story_id and s.user_id = auth.uid ()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Private storage bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('stories-media', 'stories-media', false)
on conflict (id) do nothing;

create policy "stories_media_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'stories-media'
    and auth.uid () is not null
    and (storage.foldername (name)) [1] = auth.uid ()::text
  );

create policy "stories_media_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'stories-media'
    and (storage.foldername (name)) [1] = auth.uid ()::text
  )
  with check (
    bucket_id = 'stories-media'
    and (storage.foldername (name)) [1] = auth.uid ()::text
  );

-- Download / signed-URL generation: owner or accepted friend of the folder
-- owner, and neither party has blocked the other.
create policy "stories_media_select_self_friends"
  on storage.objects
  for select
  using (
    bucket_id = 'stories-media'
    and auth.uid () is not null
    and (
      (storage.foldername (name)) [1] = auth.uid ()::text
      or (
        exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and (storage.foldername (name)) [1]::uuid in (f.user_id, f.friend_id)
            and auth.uid () in (f.user_id, f.friend_id)
        )
        and not exists (
          select 1 from public.blocks b
          where (b.user_id = auth.uid () and b.blocked_user_id = (storage.foldername (name)) [1]::uuid)
             or (b.user_id = (storage.foldername (name)) [1]::uuid and b.blocked_user_id = auth.uid ())
        )
      )
    )
  );

create policy "stories_media_delete_own"
  on storage.objects
  for delete
  using (
    bucket_id = 'stories-media'
    and (storage.foldername (name)) [1] = auth.uid ()::text
  );

-- ----------------------------------------------------------------------------
-- 5. updated_at + realtime
-- ----------------------------------------------------------------------------
-- Full replica identity so realtime INSERT/DELETE payloads carry the whole row.
alter table public.stories replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC functions
-- ----------------------------------------------------------------------------

-- Registers a new story for the caller. Media stories require an object that
-- was already uploaded into "<caller>/..." inside stories-media; text stories
-- require a non-empty body. Lifetime is clamped between 3s and 7 days.
create or replace function public.create_story (
  p_kind text,
  p_media_path text default null,
  p_mime text default null,
  p_width int default null,
  p_height int default null,
  p_duration numeric default null,
  p_size bigint default null,
  p_body text default null,
  p_lifetime_seconds int default 86400
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_body text := trim (coalesce (p_body, ''));
  v_lifetime int;
  v_story uuid;
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_kind is null or p_kind not in ('photo', 'video', 'text') then
    raise exception 'Unsupported story type';
  end if;

  v_lifetime := greatest (3, least (coalesce (p_lifetime_seconds, 86400), 604800));

  if p_kind = 'text' then
    if v_body = '' then
      raise exception 'A text story needs some text';
    end if;
  else
    if p_media_path is null or p_media_path = '' then
      raise exception 'Media file is missing';
    end if;
    if p_mime is null or p_mime = '' then
      raise exception 'Media type is invalid';
    end if;
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'stories-media'
        and name = p_media_path
        and (storage.foldername (name)) [1] = auth.uid ()::text
    ) then
      raise exception 'Media file was not uploaded for your story';
    end if;
  end if;

  if char_length (v_body) > 4000 then
    raise exception 'Story text is too long';
  end if;

  insert into public.stories (
    user_id, kind, media_path, media_mime, media_width, media_height,
    media_duration, media_size, body, expires_at
  )
  values (
    auth.uid (), p_kind,
    case when p_kind = 'text' then null else p_media_path end,
    case when p_kind = 'text' then null else p_mime end,
    p_width, p_height, p_duration, p_size,
    nullif (v_body, ''),
    now () + make_interval (secs => v_lifetime)
  )
  returning id into v_story;

  return v_story;
end;
$$;

-- Privacy deletion: tombstones the story row (records are kept) and removes
-- the stored media file for the owner.
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

-- Feed of active stories the caller may see (own + friends), enriched with the
-- author profile, whether the caller viewed each story, the view count and the
-- caller's own reaction. Served newest-first per author.
create or replace function public.list_stories ()
  returns table (
    story_id uuid,
    user_id uuid,
    display_name text,
    username text,
    avatar_url text,
    kind text,
    media_path text,
    media_mime text,
    media_width int,
    media_height int,
    media_duration numeric,
    media_size bigint,
    body text,
    created_at timestamptz,
    expires_at timestamptz,
    viewed boolean,
    view_count bigint,
    my_reaction text
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    s.id, s.user_id, p.display_name, p.username, p.avatar_url,
    s.kind, s.media_path, s.media_mime, s.media_width, s.media_height,
    s.media_duration, s.media_size, s.body, s.created_at, s.expires_at,
    exists (
      select 1 from public.story_views v
      where v.story_id = s.id and v.viewer_id = auth.uid ()
    ),
    (select count (*) from public.story_views v where v.story_id = s.id),
    (select r.emoji from public.story_reactions r
     where r.story_id = s.id and r.user_id = auth.uid ())
  from public.stories s
  join public.profiles p on p.id = s.user_id
  where s.is_deleted = false
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
    )
  order by s.user_id, s.created_at asc;
$$;

-- Marks the caller as having seen a story they are allowed to view. Self views
-- are not recorded. Idempotent.
create or replace function public.record_story_view (p_story uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.stories s
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
      )
  ) then
    raise exception 'Story not found or you cannot view it';
  end if;

  if not exists (
    select 1 from public.stories s where s.id = p_story and s.user_id = auth.uid ()
  ) then
    insert into public.story_views (story_id, viewer_id)
    values (p_story, auth.uid ())
    on conflict (story_id, viewer_id) do nothing;
  end if;
end;
$$;

-- Viewer list for one of the author's stories (author only; empty otherwise).
create or replace function public.story_viewers (p_story uuid)
  returns table (
    viewer_id uuid,
    display_name text,
    username text,
    avatar_url text,
    viewed_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select v.viewer_id, p.display_name, p.username, p.avatar_url, v.created_at
  from public.story_views v
  join public.profiles p on p.id = v.viewer_id
  where v.story_id = p_story
    and exists (
      select 1 from public.stories s
      where s.id = p_story and s.user_id = auth.uid ()
    )
  order by v.created_at desc;
$$;

-- Adds (or replaces) the caller's emoji reaction on a story they may view.
create or replace function public.react_to_story (p_story uuid, p_emoji text)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  if p_emoji is null or char_length (p_emoji) > 16 then
    raise exception 'Emoji is not valid';
  end if;

  if not exists (
    select 1 from public.stories s
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
      )
  ) then
    raise exception 'Story not found or you cannot react';
  end if;

  insert into public.story_reactions (story_id, user_id, emoji)
  values (p_story, auth.uid (), p_emoji)
  on conflict (story_id, user_id)
    do update set emoji = excluded.emoji, created_at = now ();
end;
$$;

-- Removes the caller's reaction from a story.
create or replace function public.remove_story_reaction (p_story uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid () is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.story_reactions
  where story_id = p_story and user_id = auth.uid ();
end;
$$;

-- Replies for one of the author's stories (author only; empty otherwise).
create or replace function public.list_story_replies (p_story uuid)
  returns table (
    reply_id uuid,
    reply_from uuid,
    display_name text,
    username text,
    avatar_url text,
    body text,
    created_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path = public
as $$
  select r.id, r.reply_from, p.display_name, p.username, p.avatar_url,
         r.body, r.created_at
  from public.story_replies r
  join public.profiles p on p.id = r.reply_from
  where r.story_id = p_story
    and exists (
      select 1 from public.stories s
      where s.id = p_story and s.user_id = auth.uid ()
    )
  order by r.created_at desc;
$$;

-- Sends a reply to a story. The reply is recorded (the author sees it in their
-- viewers list) and, when replying to someone else's story, it is also relayed
-- into the DM conversation between the two users (Snapchat-style). Returns the
-- reply id and the mirrored message id (null when replying to your own story).
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

  insert into public.messages (conversation_id, sender_id, body)
  values (v_conv, auth.uid (), v_body)
  returning id into v_message;

  update public.conversations set updated_at = now () where id = v_conv;

  return query select v_reply, v_message;
end;
$$;

-- Maintenance: removes STORAGE OBJECTS (never rows) for soft-deleted stories
-- and for stories that expired more than `p_older_than_days` ago, reclaiming
-- bucket space while preserving all database records. Schedule this with
-- pg_cron or run it manually as an admin.
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