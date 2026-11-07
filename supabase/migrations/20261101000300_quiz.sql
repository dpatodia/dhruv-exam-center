-- Pop quizzes (20 one-mark flashcards)
alter table public.exams drop constraint if exists exams_level_check;
alter table public.exams add constraint exams_level_check check (level in ('foundational','challenging','godmode','drill','school','external','quiz'));
