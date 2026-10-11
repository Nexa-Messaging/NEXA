-- ============================================================================
-- Performance: indexes for tables that had none.
--
-- Audited every table against its indexes (multiline-aware scan of all
-- migrations). 28 of 50 tables were indexed. Of the rest, most are fine:
--   * user_preferences, group_chats, community_poll_options - covered by a
--     PRIMARY KEY or UNIQUE constraint that already serves their lookups.
--   * community_channel_reads - PRIMARY KEY (channel_id, user_id) covers the
--     `last_read_seq` subqueries in the unread-count logic.
-- The genuinely unindexed ones are below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- blocks - the hottest gap. ~30 RLS policies across messages, media, stories,
-- notifications, global search and moderation do:
--     select 1 from public.blocks b where b.user_id = X and b.blocked_user_id = Y
-- The PRIMARY KEY (user_id, blocked_user_id) serves the "did I block them"
-- direction, but every "did they block me" lookup is a sequential scan, and it
-- runs once per policy per row on every feed query.
-- ---------------------------------------------------------------------------
create index if not exists blocks_blocked_user_idx
  on public.blocks (blocked_user_id);

-- ---------------------------------------------------------------------------
-- RSVP / reminder tables. PRIMARY KEY (event_id, user_id) serves the
-- "who is going to this event" direction; these serve "my events", plus the
-- ON DELETE CASCADE path from auth.users, which is otherwise a full scan of
-- the child table per deleted user.
-- ---------------------------------------------------------------------------
create index if not exists user_event_rsvps_user_idx
  on public.user_event_rsvps (user_id);

create index if not exists user_event_reminders_user_idx
  on public.user_event_reminders (user_id);

create index if not exists community_event_rsvps_user_idx
  on public.community_event_rsvps (user_id);

-- ---------------------------------------------------------------------------
-- daily_question_skips - UNIQUE (question_id, user_id) covers "did I skip
-- this question", but the "which questions have I skipped" feed filter queries
-- by user_id alone.
-- ---------------------------------------------------------------------------
create index if not exists daily_question_skips_user_idx
  on public.daily_question_skips (user_id);
