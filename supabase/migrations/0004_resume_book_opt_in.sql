-- Member consent for the resume book. Self-writable: this is the member's
-- own decision, so it is deliberately NOT added to profiles_protect_privileged.
alter table public.profiles
  add column resume_book_opt_in boolean not null default false,
  add column resume_book_opt_in_at timestamptz;

-- Stamp the timestamp whenever consent is granted; clear it when withdrawn.
-- The timestamp drives the Principal early-access embargo in Phase 2.
create or replace function public.profiles_stamp_opt_in()
returns trigger
language plpgsql
as $$
begin
  if new.resume_book_opt_in and not coalesce(old.resume_book_opt_in, false) then
    new.resume_book_opt_in_at := now();
  elsif not new.resume_book_opt_in then
    new.resume_book_opt_in_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_opt_in
  before update on public.profiles
  for each row execute function public.profiles_stamp_opt_in();

notify pgrst, 'reload schema';
