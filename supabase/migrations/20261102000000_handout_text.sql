-- Word / text handouts: text is extracted in the browser and stored here for Claude to read
alter table public.handouts add column if not exists source_text text;
