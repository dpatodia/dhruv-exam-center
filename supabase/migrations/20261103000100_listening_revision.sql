-- Listening practice (Spanish, Hindi) and cliff-note revision packs
alter table public.exams drop constraint if exists exams_level_check;
alter table public.exams add constraint exams_level_check check (level in ('foundational','challenging','godmode','drill','school','external','quiz','listening'));
alter table public.exams add column if not exists audio_script text;
alter table public.exams add column if not exists audio_lang text;

insert into public.topics (id, subject_id, code, name, paper, weight, sort) values
  ('spanish-L1', 'spanish', 'L1', 'Listening comprehension', 'Listening', 1, 50),
  ('hindi-L1', 'hindi', 'L1', 'Listening comprehension (Shravan)', 'Listening', 1, 50)
on conflict (id) do nothing;

create table if not exists public.revision_notes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.subjects(id) on delete cascade,
  content jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists revision_notes_subject_idx on public.revision_notes(subject_id, created_at desc);
alter table public.revision_notes enable row level security;
drop policy if exists "revision read" on public.revision_notes;
create policy "revision read" on public.revision_notes for select to authenticated using (true);
