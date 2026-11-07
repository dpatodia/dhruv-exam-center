-- Examiner chat (per marked paper), "Ask the tutor" chat, mark-change log and paper-error reports.
alter table public.app_settings add column if not exists daily_chat_limit int not null default 60;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('examiner','tutor')),
  attempt_id uuid references public.attempts(id) on delete cascade,
  subject_id text references public.subjects(id) on delete set null,
  title text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_threads_attempt on public.chat_threads(attempt_id);
create index if not exists chat_threads_user on public.chat_threads(user_id, kind, updated_at desc);

create table if not exists public.mark_changes (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  qid text not null, number text,
  old_awarded numeric not null, new_awarded numeric not null, max numeric,
  reason text not null,
  requested_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.paper_errors (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  attempt_id uuid references public.attempts(id) on delete set null,
  qid text, number text,
  description text not null,
  fix text,
  status text not null default 'open' check (status in ('open','fixed','not_an_error')),
  reported_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.chat_threads enable row level security;
alter table public.mark_changes enable row level security;
alter table public.paper_errors enable row level security;
-- Writes go through the chat edge function (service role). Reads: own threads, or the examiner thread of
-- your own paper; the parent sees everything.
create policy "chat read" on public.chat_threads for select to authenticated using (
  user_id = auth.uid() or public.is_parent()
  or (attempt_id is not null and exists (select 1 from public.attempts a where a.id = attempt_id and a.student_id = auth.uid())));
create policy "mark changes read" on public.mark_changes for select to authenticated using (
  public.is_parent() or exists (select 1 from public.attempts a where a.id = attempt_id and a.student_id = auth.uid()));
create policy "paper errors read" on public.paper_errors for select to authenticated using (true);
create policy "paper errors parent update" on public.paper_errors for update to authenticated using (public.is_parent()) with check (public.is_parent());
