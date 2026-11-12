-- Dhruv's Exam Center — core schema
-- Run once on a fresh Supabase project (SQL editor or `supabase db push`).


-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table if not exists public.parent_emails (
  email text primary key
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','parent')),
  display_name text not null,
  avatar text default '🦊',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_parent boolean;
begin
  select exists(select 1 from public.parent_emails p where lower(p.email) = lower(new.email)) into is_parent;
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    case when is_parent then 'parent' else 'student' end,
    coalesce(new.raw_user_meta_data->>'display_name', case when is_parent then 'Parent' else 'Dhruv' end)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_parent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'parent');
$$;

-- ---------------------------------------------------------------------------
-- Syllabus
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id text primary key,                 -- 'ict', 'maths', ...
  name text not null,
  emoji text not null default '📘',
  color text not null default '#7c5cff',
  world_name text,                     -- game name, e.g. "Robot Foundry"
  practice_marks int not null default 50,
  papers jsonb not null default '[]',  -- [{name, marks, duration, date, time, notes}]
  exam_notes text,                     -- format notes Claude must respect when writing papers
  sort int not null default 100,
  active boolean not null default true,
  term text not null default 'Grade 6 · Term 1 · 2026-27'
);

create table if not exists public.topics (
  id text primary key,                 -- 'ict-R1'
  subject_id text not null references public.subjects(id) on delete cascade,
  code text not null,
  name text not null,
  paper text not null default 'Theory',
  weight numeric not null default 1,   -- relative share of the real exam
  details text,
  sort int not null default 100
);
create index if not exists topics_subject_idx on public.topics(subject_id);

create table if not exists public.handouts (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  title text not null,
  storage_path text not null,
  mime_type text,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','error')),
  notes text,                          -- Claude's extracted study notes (used when writing papers)
  topic_codes text[] default '{}',
  error text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Papers
-- ---------------------------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  title text not null,
  level text not null check (level in ('foundational','challenging','godmode','drill','school','external')),
  total_marks int not null,
  duration_min int not null default 60,
  instructions text,
  questions jsonb not null,            -- student-safe: no answers
  focus_topics text[] default '{}',
  source text not null default 'ai' check (source in ('ai','seed','upload')),
  model text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists exams_subject_idx on public.exams(subject_id, created_at desc);

-- Answer keys live apart so Dhruv's browser never downloads them.
create table if not exists public.exam_keys (
  exam_id uuid primary key references public.exams(id) on delete cascade,
  key jsonb not null                   -- {qid: {answer, markScheme:[...], explanation}}
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  subject_id text not null references public.subjects(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mode text not null default 'online' check (mode in ('online','paper','external','retry')),
  level text not null default 'foundational',
  question_ids text[],                 -- subset (retry of mistakes)
  retry_of uuid references public.attempts(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','grading','graded','error')),
  answers jsonb not null default '{}',
  photo_paths text[] not null default '{}',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  time_taken_sec int,
  score numeric,
  total numeric,
  results jsonb,                       -- [{qid, awarded, max, verdict, feedback, correctAnswer, why, topic}]
  topic_scores jsonb,                  -- {topicCode: {got, max}}
  summary text,
  tips jsonb,
  xp_awarded int default 0,
  error text
);
create index if not exists attempts_student_idx on public.attempts(student_id, started_at desc);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,
  reason text not null,
  kind text not null default 'paper',
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists xp_student_idx on public.xp_events(student_id, created_at desc);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  topic_code text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists lessons_topic_idx on public.lessons(subject_id, topic_code, created_at desc);

create table if not exists public.usage_log (
  id bigserial primary key,
  user_id uuid,
  fn text not null,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  unlock_all boolean not null default false,
  daily_generate_limit int not null default 8,
  daily_grade_limit int not null default 12,
  price_in_per_mtok numeric not null default 3,
  price_out_per_mtok numeric not null default 15,
  monthly_budget_usd numeric not null default 30
);
insert into public.app_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.parent_emails enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.handouts enable row level security;
alter table public.exams enable row level security;
alter table public.exam_keys enable row level security;
alter table public.attempts enable row level security;
alter table public.xp_events enable row level security;
alter table public.lessons enable row level security;
alter table public.usage_log enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));

create policy "parent_emails parent" on public.parent_emails for all to authenticated using (public.is_parent()) with check (public.is_parent());

create policy "subjects read" on public.subjects for select to authenticated using (true);
create policy "subjects parent write" on public.subjects for all to authenticated using (public.is_parent()) with check (public.is_parent());
create policy "topics read" on public.topics for select to authenticated using (true);
create policy "topics parent write" on public.topics for all to authenticated using (public.is_parent()) with check (public.is_parent());

create policy "handouts read" on public.handouts for select to authenticated using (true);
create policy "handouts insert" on public.handouts for insert to authenticated with check (uploaded_by = auth.uid());
create policy "handouts parent delete" on public.handouts for delete to authenticated using (public.is_parent());

create policy "exams read" on public.exams for select to authenticated using (true);
create policy "exams parent write" on public.exams for all to authenticated using (public.is_parent()) with check (public.is_parent());

create policy "keys parent read" on public.exam_keys for select to authenticated using (public.is_parent());

create policy "attempts read" on public.attempts for select to authenticated using (student_id = auth.uid() or public.is_parent());
create policy "attempts insert" on public.attempts for insert to authenticated
  with check (student_id = auth.uid() and status = 'in_progress');
create policy "attempts update own draft" on public.attempts for update to authenticated
  using (student_id = auth.uid() and status = 'in_progress')
  with check (student_id = auth.uid() and status in ('in_progress','submitted'));
create policy "attempts delete own draft" on public.attempts for delete to authenticated
  using ((student_id = auth.uid() and status = 'in_progress') or public.is_parent());

create policy "xp read" on public.xp_events for select to authenticated using (student_id = auth.uid() or public.is_parent());
create policy "lessons read" on public.lessons for select to authenticated using (true);
create policy "usage parent read" on public.usage_log for select to authenticated using (public.is_parent());
create policy "settings read" on public.app_settings for select to authenticated using (true);
create policy "settings parent write" on public.app_settings for update to authenticated using (public.is_parent()) with check (public.is_parent());

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('answer-photos','answer-photos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('handouts','handouts', false) on conflict do nothing;

create policy "answer photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'answer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "answer photos read" on storage.objects for select to authenticated
  using (bucket_id = 'answer-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_parent()));
create policy "handouts insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'handouts');
create policy "handouts read" on storage.objects for select to authenticated
  using (bucket_id = 'handouts');
create policy "handouts parent delete" on storage.objects for delete to authenticated
  using (bucket_id = 'handouts' and public.is_parent());
