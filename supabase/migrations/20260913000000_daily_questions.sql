-- ============================================================================
-- NEXA — Daily Question
-- Curated daily questions with answers, reactions, and moderation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. daily_questions (the question pool + daily active question)
-- ----------------------------------------------------------------------------
create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  category text not null default 'general', -- 'general', 'fun', 'deep', 'hypothetical', 'lifestyle'
  source text not null default 'curated', -- 'curated', 'ai_generated'
  is_active boolean not null default true,
  scheduled_date date, -- null = not yet scheduled; set when activated
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users (id), -- for AI-generated moderation
  approved_at timestamptz,

  constraint daily_questions_text_length check (char_length(text) between 10 and 300)
);

create index daily_questions_scheduled_idx on public.daily_questions (scheduled_date)
  where scheduled_date is not null;
create index daily_questions_active_idx on public.daily_questions (scheduled_date)
  where is_active = true and scheduled_date is not null;

-- ----------------------------------------------------------------------------
-- 2. daily_answers (user responses to daily questions)
-- ----------------------------------------------------------------------------
create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  answer text not null,
  is_public boolean not null default true, -- share with friends/feed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint daily_answers_one_per_user unique (question_id, user_id),
  constraint daily_answers_length check (char_length(answer) between 1 and 2000)
);

create index daily_answers_question_idx on public.daily_answers (question_id, created_at desc);
create index daily_answers_user_idx on public.daily_answers (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. daily_answer_reactions (reactions to answers)
-- ----------------------------------------------------------------------------
create table public.daily_answer_reactions (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.daily_answers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),

  constraint daily_answer_reactions_unique unique (answer_id, user_id, emoji)
);

create index daily_answer_reactions_answer_idx on public.daily_answer_reactions (answer_id);

-- ----------------------------------------------------------------------------
-- 4. daily_question_skips (track skips for analytics)
-- ----------------------------------------------------------------------------
create table public.daily_question_skips (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint daily_question_skips_unique unique (question_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.daily_questions enable row level security;
alter table public.daily_answers enable row level security;
alter table public.daily_answer_reactions enable row level security;
alter table public.daily_question_skips enable row level security;

-- daily_questions: public read for active/scheduled questions
create policy "daily_questions_select_public"
  on public.daily_questions for select
  using (
    is_active = true
    and (scheduled_date is not null)
  );

-- daily_answers: public read for public answers; users can insert/update own
create policy "daily_answers_select_public"
  on public.daily_answers for select
  using (is_public = true);

create policy "daily_answers_select_own"
  on public.daily_answers for select
  using (auth.uid() = user_id);

create policy "daily_answers_insert_own"
  on public.daily_answers for insert
  with check (auth.uid() = user_id);

create policy "daily_answers_update_own"
  on public.daily_answers for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "daily_answers_delete_own"
  on public.daily_answers for delete
  using (auth.uid() = user_id);

-- daily_answer_reactions: public read; users can manage own
create policy "daily_answer_reactions_select_public"
  on public.daily_answer_reactions for select
  using (true);

create policy "daily_answer_reactions_insert_own"
  on public.daily_answer_reactions for insert
  with check (auth.uid() = user_id);

create policy "daily_answer_reactions_delete_own"
  on public.daily_answer_reactions for delete
  using (auth.uid() = user_id);

-- daily_question_skips: users can see/manage own
create policy "daily_question_skips_select_own"
  on public.daily_question_skips for select
  using (auth.uid() = user_id);

create policy "daily_question_skips_insert_own"
  on public.daily_question_skips for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Helper: get today's active question
-- ----------------------------------------------------------------------------
create or replace function public.get_today_question ()
returns setof public.daily_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
begin
  return query
  select * from public.daily_questions
  where is_active = true
    and scheduled_date = v_today
  limit 1;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Helper: get user's answer for today's question
-- ----------------------------------------------------------------------------
create or replace function public.get_my_answer (p_question_id uuid)
returns public.daily_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer public.daily_answers%rowtype;
begin
  select * into v_answer
  from public.daily_answers
  where question_id = p_question_id and user_id = auth.uid();

  if not found then
    return null;
  end if;

  return v_answer;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Helper: submit/upsert answer
-- ----------------------------------------------------------------------------
create or replace function public.submit_daily_answer (
  p_question_id uuid,
  p_answer text,
  p_is_public boolean default true
)
returns public.daily_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer public.daily_answers%rowtype;
begin
  -- Verify question exists and is today's (or any active)
  if not exists (
    select 1 from public.daily_questions
    where id = p_question_id and is_active = true
  ) then
    raise exception 'Question not available';
  end if;

  insert into public.daily_answers (question_id, user_id, answer, is_public)
  values (p_question_id, auth.uid(), p_answer, p_is_public)
  on conflict (question_id, user_id) do update set
    answer = excluded.answer,
    is_public = excluded.is_public,
    updated_at = now()
  returning * into v_answer;

  return v_answer;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Helper: react to answer
-- ----------------------------------------------------------------------------
create or replace function public.react_to_daily_answer (
  p_answer_id uuid,
  p_emoji text
)
returns public.daily_answer_reactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reaction public.daily_answer_reactions%rowtype;
begin
  insert into public.daily_answer_reactions (answer_id, user_id, emoji)
  values (p_answer_id, auth.uid(), p_emoji)
  on conflict (answer_id, user_id, emoji) do nothing
  returning * into v_reaction;

  return v_reaction;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Helper: remove reaction
-- ----------------------------------------------------------------------------
create or replace function public.unreact_to_daily_answer (
  p_answer_id uuid,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.daily_answer_reactions
  where answer_id = p_answer_id and user_id = auth.uid() and emoji = p_emoji;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. Helper: skip today's question
-- ----------------------------------------------------------------------------
create or replace function public.skip_daily_question (p_question_id uuid)
returns public.daily_question_skips
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skip public.daily_question_skips%rowtype;
begin
  insert into public.daily_question_skips (question_id, user_id)
  values (p_question_id, auth.uid())
  on conflict (question_id, user_id) do nothing
  returning * into v_skip;

  return v_skip;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. Helper: get answers for a question (with reaction counts)
-- ----------------------------------------------------------------------------
create or replace function public.get_daily_answers (
  p_question_id uuid,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  answer text,
  is_public boolean,
  created_at timestamptz,
  display_name text,
  username text,
  avatar_url text,
  reactions jsonb,
  my_reactions text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  select
    a.id,
    a.user_id,
    a.answer,
    a.is_public,
    a.created_at,
    p.display_name,
    p.username,
    p.avatar_url,
    (
      select jsonb_object_agg(r.emoji, r.count)
      from (
        select emoji, count(*) as count
        from public.daily_answer_reactions
        where answer_id = a.id
        group by emoji
      ) r
    ) as reactions,
    (
      select array_agg(emoji)
      from public.daily_answer_reactions
      where answer_id = a.id and user_id = v_user_id
    ) as my_reactions
  from public.daily_answers a
  join public.profiles p on p.id = a.user_id
  where a.question_id = p_question_id
    and a.is_public = true
  order by a.created_at desc
  limit p_limit offset p_offset;
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. Helper: get question stats
-- ----------------------------------------------------------------------------
create or replace function public.get_daily_question_stats (p_question_id uuid)
returns table (
  total_answers bigint,
  total_reactions bigint,
  total_skips bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    (select count(*) from public.daily_answers where question_id = p_question_id) as total_answers,
    (select count(*) from public.daily_answer_reactions r
     join public.daily_answers a on a.id = r.answer_id
     where a.question_id = p_question_id) as total_reactions,
    (select count(*) from public.daily_question_skips where question_id = p_question_id) as total_skips;
end;
$$;

-- ----------------------------------------------------------------------------
-- 14. Updated_at triggers
-- ----------------------------------------------------------------------------
create trigger daily_answers_set_updated_at
  before update on public.daily_answers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 15. Seed curated questions (28 days = 4 weeks)
-- ----------------------------------------------------------------------------
insert into public.daily_questions (text, category, source, scheduled_date) values
  ('What would you do with ₦10 million?', 'hypothetical', 'curated', '2026-09-13'),
  ('What is something that always makes you laugh?', 'fun', 'curated', '2026-09-14'),
  ('What''s your dream destination?', 'lifestyle', 'curated', '2026-09-15'),
  ('If you could have dinner with anyone (dead or alive), who would it be?', 'hypothetical', 'curated', '2026-09-16'),
  ('What''s the best advice you''ve ever received?', 'deep', 'curated', '2026-09-17'),
  ('What''s a skill you wish you had?', 'lifestyle', 'curated', '2026-09-18'),
  ('What''s your favorite childhood memory?', 'deep', 'curated', '2026-09-19'),
  ('If you could instantly master any language, which one?', 'hypothetical', 'curated', '2026-09-20'),
  ('What''s the most spontaneous thing you''ve ever done?', 'fun', 'curated', '2026-09-21'),
  ('What''s a book/movie that changed your perspective?', 'deep', 'curated', '2026-09-22'),
  ('If you could live in any fictional universe, which one?', 'fun', 'curated', '2026-09-23'),
  ('What''s something you''re proud of but rarely talk about?', 'deep', 'curated', '2026-09-24'),
  ('What would your perfect day look like?', 'lifestyle', 'curated', '2026-09-25'),
  ('If you could swap lives with someone for a day, who?', 'hypothetical', 'curated', '2026-09-26'),
  ('What''s the kindest thing a stranger has done for you?', 'deep', 'curated', '2026-09-27'),
  ('What''s a habit you''re trying to build?', 'lifestyle', 'curated', '2026-09-28'),
  ('If you could time travel, would you go past or future?', 'hypothetical', 'curated', '2026-09-29'),
  ('What''s your go-to comfort food?', 'fun', 'curated', '2026-09-30'),
  ('What''s something you believed as a kid that turned out false?', 'fun', 'curated', '2026-10-01'),
  ('If you could solve one world problem, what would it be?', 'deep', 'curated', '2026-10-02'),
  ('What''s the best gift you''ve ever received?', 'lifestyle', 'curated', '2026-10-03'),
  ('If you had a theme song that played when you entered a room, what would it be?', 'fun', 'curated', '2026-10-04'),
  ('What''s a small thing that makes your day better?', 'lifestyle', 'curated', '2026-10-05'),
  ('If you could master any instrument overnight, which one?', 'hypothetical', 'curated', '2026-10-06'),
  ('What''s your favorite way to relax after a long day?', 'lifestyle', 'curated', '2026-10-07'),
  ('What''s a random fact you love sharing?', 'fun', 'curated', '2026-10-08'),
  ('If you could have any superpower, what would it be?', 'hypothetical', 'curated', '2026-10-09'),
  ('What''s something you''re looking forward to?', 'lifestyle', 'curated', '2026-10-10')
on conflict do nothing;