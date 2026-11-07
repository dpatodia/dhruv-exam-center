-- Cancel an unfinished practice paper (with a reason). The paper itself stays on the shelf
-- as a ready-made paper; only this attempt is marked cancelled and hidden from the app.
alter table public.attempts drop constraint if exists attempts_status_check;
alter table public.attempts add constraint attempts_status_check
  check (status in ('in_progress','submitted','grading','graded','error','cancelled'));
alter table public.attempts add column if not exists cancel_reason text;
alter table public.attempts add column if not exists cancelled_at timestamptz;
alter table public.attempts add column if not exists cancelled_by uuid references public.profiles(id);

create or replace function public.cancel_attempt(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.attempts;
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please give a reason for cancelling'; end if;
  select * into a from public.attempts where id = p_id for update;
  if not found then raise exception 'Paper not found'; end if;
  if not (a.student_id = auth.uid() or public.is_parent()) then raise exception 'Not allowed'; end if;
  if a.status not in ('in_progress','error') then raise exception 'Only unfinished papers can be cancelled (this one is %)', a.status; end if;
  update public.attempts set status = 'cancelled', cancel_reason = left(btrim(p_reason), 500),
    cancelled_at = now(), cancelled_by = auth.uid() where id = p_id;
end $$;
revoke all on function public.cancel_attempt(uuid, text) from public;
grant execute on function public.cancel_attempt(uuid, text) to authenticated;
