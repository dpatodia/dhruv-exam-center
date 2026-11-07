alter table public.subjects add column if not exists goal_pct int not null default 80 check (goal_pct between 0 and 100);
