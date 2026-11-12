-- Retired papers (replaced by a newer version) stay in the database for history but are hidden from pickers and the library.
alter table public.exams add column if not exists retired_at timestamptz;
