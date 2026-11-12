-- Pop quizzes get their own daily cap so they don't use up the paper allowance
alter table public.app_settings add column if not exists daily_quiz_limit int not null default 10;
