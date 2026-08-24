-- Member consent for the resume book. Self-writable: this is the member's
-- own decision, so it is deliberately NOT added to profiles_protect_privileged.
alter table public.profiles
  add column resume_book_opt_in boolean not null default false,
  add column resume_book_opt_in_at timestamptz,
  add column resume_book_opt_in_by uuid references public.profiles (id);

-- Stamp the timestamp/grantor whenever consent is granted; clear both when
-- withdrawn; leave both untouched on any other update. Only the member
-- themself may grant consent -- an admin may only withdraw it (e.g. acting
-- on a student's emailed removal request). The auth.uid() is not null guard
-- exempts migrations and the service role from the grant restriction.
-- The timestamp drives the Principal early-access embargo in Phase 2.
create or replace function public.profiles_stamp_opt_in()
returns trigger
language plpgsql
as $$
begin
  if new.resume_book_opt_in and not coalesce(old.resume_book_opt_in, false) then
    if auth.uid() is not null and auth.uid() is distinct from new.id then
      raise exception 'Only the member can grant resume book consent';
    end if;
    new.resume_book_opt_in_at := now();
    new.resume_book_opt_in_by := auth.uid();
  elsif not new.resume_book_opt_in then
    new.resume_book_opt_in_at := null;
    new.resume_book_opt_in_by := null;
  else
    new.resume_book_opt_in_at := old.resume_book_opt_in_at;
    new.resume_book_opt_in_by := old.resume_book_opt_in_by;
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_opt_in
  before update on public.profiles
  for each row execute function public.profiles_stamp_opt_in();

notify pgrst, 'reload schema';
