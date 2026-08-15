-- ============================================================================
-- NEXA — development seed data
-- ----------------------------------------------------------------------------
-- Idempotent demo dataset for LOCAL/DEV databases only. Never run against a
-- production project: it creates real auth users with a known password.
--
-- Run with the Supabase CLI (`supabase db reset`), or paste into the SQL
-- editor of a dev project after applying the migrations.
--
-- Demo accounts (password for all: password123)
--   ada_dev     : Ada Lovelace  — Design University / Computer Science / 300
--   bella_dev   : Bella Zubairu — same class
--   charlie_dev : Charlie Onah  — same class
--   dara_dev    : Dara Nwosu    — same class
--   emeka_dev   : Emeka Okafor  — Design University / Graphic Design (different
--                                 class, so not in the class community)
--
-- Data created: friends, a DM thread, text stories, a class community with its
-- four fixed channels + posts, a group chat, a poll and an upcoming event.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Auth users + profiles
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'authenticated', 'authenticated', 'ada@nexa.dev',
    crypt ('password123', gen_salt ('bf')),
    now (), '{"provider":"email","providers":["email"]}',
    '{"display_name":"Ada Lovelace","username":"ada_dev"}', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000102',
    'authenticated', 'authenticated', 'bella@nexa.dev',
    crypt ('password123', gen_salt ('bf')),
    now (), '{"provider":"email","providers":["email"]}',
    '{"display_name":"Bella Zubairu","username":"bella_dev"}', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000103',
    'authenticated', 'authenticated', 'charlie@nexa.dev',
    crypt ('password123', gen_salt ('bf')),
    now (), '{"provider":"email","providers":["email"]}',
    '{"display_name":"Charlie Onah","username":"charlie_dev"}', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000104',
    'authenticated', 'authenticated', 'dara@nexa.dev',
    crypt ('password123', gen_salt ('bf')),
    now (), '{"provider":"email","providers":["email"]}',
    '{"display_name":"Dara Nwosu","username":"dara_dev"}', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000105',
    'authenticated', 'authenticated', 'emeka@nexa.dev',
    crypt ('password123', gen_salt ('bf')),
    now (), '{"provider":"email","providers":["email"]}',
    '{"display_name":"Emeka Okafor","username":"emeka_dev"}', now (), now ()
  )
on conflict (id) do nothing;

-- Upsert profiles so the intended class fields always win regardless of the
-- handle_new_user trigger order.
insert into public.profiles (
  id, email, display_name, username, bio, school, department, level, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000101', 'ada@nexa.dev', 'Ada Lovelace', 'ada_dev',
    'Analytical engine enthusiast.', 'Design University', 'Computer Science', '300 Level', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000102', 'bella@nexa.dev', 'Bella Zubairu', 'bella_dev',
    'Frontend nerd. Currently obsessed with Expo.', 'Design University', 'Computer Science', '300 Level', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000103', 'charlie@nexa.dev', 'Charlie Onah', 'charlie_dev',
    'Backend + Supabase. Ask me about RLS.', 'Design University', 'Computer Science', '300 Level', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000104', 'dara@nexa.dev', 'Dara Nwosu', 'dara_dev',
    'Product designer who learned SQL to ship faster.', 'Design University', 'Computer Science', '300 Level', now (), now ()
  ),
  (
    '00000000-0000-0000-0000-000000000105', 'emeka@nexa.dev', 'Emeka Okafor', 'emeka_dev',
    'Multimedia storyteller. Different class, still around.', 'Design University', 'Graphic Design', '300 Level', now (), now ()
  )
on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      username = excluded.username,
      bio = excluded.bio,
      school = excluded.school,
      department = excluded.department,
      level = excluded.level,
      updated_at = now ();

-- ----------------------------------------------------------------------------
-- 2. Friendships
-- ----------------------------------------------------------------------------
insert into public.friendships (user_id, friend_id, status, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'accepted', now () - interval '30 days', now ()),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'accepted', now () - interval '21 days', now ()),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103', 'accepted', now () - interval '18 days', now ()),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'accepted', now () - interval '10 days', now ()),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000105', 'accepted', now () - interval '5 days', now ()),
  -- Pending request from Emeka -> Ada, so Ada has a request in her inbox.
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101', 'pending', now () - interval '1 day', now () - interval '1 day')
on conflict (user_id, friend_id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Stories (text, visible to friends until tomorrow)
-- ----------------------------------------------------------------------------
insert into public.stories (id, user_id, kind, body, created_at, expires_at)
values
  (
    '00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000102', 'text',
    'Finally got the new compiler working 🎉', now () - interval '2 hours', now () + interval '22 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000101', 'text',
    'Coffee first, then the group project. No negotiations.', now () - interval '5 hours', now () + interval '19 hours'
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Direct messages (Ada <-> Bella)
-- ----------------------------------------------------------------------------
insert into public.conversations (id, user_a_id, user_b_id, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102', now () - interval '10 days', now ()
)
on conflict (id) do nothing;

insert into public.messages (id, conversation_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000101', 'Are we still on for the dry-run tomorrow?', now () - interval '3 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000102', 'Yep! Prep at 10, walkthrough at 11.', now () - interval '2 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000101', 'Perfect — bring the deck too.', now () - interval '1 hour'
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Class community (Design University / CS / 300) + channels + posts
-- ----------------------------------------------------------------------------
insert into public.communities (id, name, description, school, department, level, created_by, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000301',
  'Design University CS 300',
  'The 300-level Computer Science community. Announcements, study groups and everything class-related.',
  'Design University', 'Computer Science', '300 Level',
  '00000000-0000-0000-0000-000000000101', now () - interval '60 days', now ()
)
on conflict (id) do nothing;

insert into public.community_members (community_id, user_id, role, joined_at)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'owner', now () - interval '60 days'),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000102', 'admin', now () - interval '58 days'),
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000103', 'member', now () - interval '55 days'),
  ('00000000-0000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000104', 'member', now () - interval '50 days')
on conflict (community_id, user_id) do nothing;

insert into public.community_channels (id, community_id, name, kind, sort_order, created_at)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'General', 'general', 0, now () - interval '60 days'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000301', 'Academics', 'academics', 1, now () - interval '60 days'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000301', 'Announcements', 'announcements', 2, now () - interval '60 days'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000301', 'Social', 'social', 3, now () - interval '60 days')
on conflict (id) do nothing;

insert into public.community_messages (id, community_id, channel_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101',
    'Mid-semester results are out. Check the portal before Friday.', now () - interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000103',
    'Anyone free to review the DB design assignment tonight?', now () - interval '5 hours'
  ),
  (
    '00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000102',
    'Count me in — group study room, 7pm.', now () - interval '4 hours'
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 6. Group chat + messages
-- ----------------------------------------------------------------------------
insert into public.group_chats (id, name, created_by, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000601', 'Phase 3 Study Group',
  '00000000-0000-0000-0000-000000000101', now () - interval '14 days', now ()
)
on conflict (id) do nothing;

insert into public.group_members (chat_id, user_id, role, joined_at, last_read_seq)
values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000101', 'owner', now () - interval '14 days', 3),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000102', 'admin', now () - interval '13 days', 3),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000103', 'member', now () - interval '13 days', 2),
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000104', 'member', now () - interval '12 days', 0)
on conflict (chat_id, user_id) do nothing;

insert into public.group_messages (id, chat_id, sender_id, body, created_at)
values
  (
    '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000101', 'Let’s split the chapters: Ada drills the RLS section.', now () - interval '2 days'
  ),
  (
    '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000103', 'Taking the realtime + messaging part then.', now () - interval '2 days'
  ),
  (
    '00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000102', 'I’ll cover the Expo hooks and media uploads. See everyone at 7.', now () - interval '1 day'
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 7. Poll
-- ----------------------------------------------------------------------------
insert into public.community_polls (id, community_id, created_by, question, is_anonymous, expires_at, created_at)
values (
  '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000102', 'Where should the class meet for the review session?', false,
  now () + interval '3 days', now () - interval '1 hour'
)
on conflict (id) do nothing;

insert into public.community_poll_options (id, poll_id, option_text, position)
values
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000401', 'Library, 2nd floor', 0),
  ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000401', 'Design Hub, room 4', 1),
  ('00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000401', 'Online (Zoom)', 2)
on conflict (id) do nothing;

insert into public.community_poll_votes (poll_id, option_id, user_id, created_at)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000101', now ()),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000103', now ())
on conflict (poll_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 8. Event
-- ----------------------------------------------------------------------------
insert into public.community_events (id, community_id, created_by, title, description, starts_at, location, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000101', 'Demo Day — Capstone Dry Run',
  'Final walkthrough of the Phase 3 builds before the real showcase.', now () + interval '2 days',
  'Design Auditorium', now () - interval '3 days', now ()
)
on conflict (id) do nothing;

insert into public.community_event_rsvps (event_id, user_id, response, updated_at)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000102', 'going', now ()),
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000103', 'going', now ()),
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000104', 'maybe', now ())
on conflict (event_id, user_id) do nothing;