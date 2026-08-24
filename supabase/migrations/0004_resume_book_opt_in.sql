-- Member consent for the resume book. Self-writable: this is the member's
-- own decision, so it is deliberately NOT added to profiles_protect_privileged.
--
-- Every statement here is idempotent. 0001_init.sql line 2 endorses pasting
-- migrations into the Supabase SQL editor, where each statement autocommits:
-- if the `add column`s landed and the `create trigger` then failed, the two
-- stamp columns would be client-writable with nothing stamping them, and
-- consent would be silently forgeable. Re-running this file must be safe.
alter table public.profiles
  add column if not exists resume_book_opt_in boolean not null default false,
  add column if not exists resume_book_opt_in_at timestamptz,
  add column if not exists resume_book_opt_in_by uuid references public.profiles (id);

-- Stamp the timestamp/grantor whenever consent is granted; clear both when
-- withdrawn; leave both untouched on any other update. Only the member
-- themself may grant consent -- an admin may only withdraw it (e.g. acting
-- on a student's emailed removal request). The auth.uid() is not null guard
-- exempts migrations and the service role from the grant restriction.
-- The timestamp drives the Principal early-access embargo in Phase 2.
--
-- The trigger fires on INSERT as well as UPDATE: profiles_admin_all is
-- `for all`, so without an INSERT arm a privileged INSERT could carry
-- resume_book_opt_in = true alongside a forged _at/_by. Client-supplied
-- values for those two columns are never trusted on either path.
--
-- The tg_op branch is load-bearing: on INSERT, OLD is unassigned, so any
-- reference to old.* -- including coalesce(old.resume_book_opt_in, false) --
-- raises `record "old" is not assigned yet` at runtime.
--
-- security invoker (the default -- no `security definer` here): the function
-- only touches NEW/OLD of the row the trigger already fired for, so it needs
-- no elevated rights, and running as invoker keeps it from becoming a
-- privilege-escalation surface. `set search_path = public` is still required
-- (Supabase's linter flags `function_search_path_mutable` regardless of the
-- security mode) so an attacker-controlled search_path cannot rebind now().
create or replace function public.profiles_stamp_opt_in()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.resume_book_opt_in then
      if auth.uid() is not null and auth.uid() is distinct from new.id then
        raise exception 'Only the member can grant resume book consent';
      end if;
      new.resume_book_opt_in_at := now();
      new.resume_book_opt_in_by := auth.uid();
    else
      new.resume_book_opt_in_at := null;
      new.resume_book_opt_in_by := null;
    end if;
    return new;
  end if;

  -- Compare against OLD.id, not NEW.id: an admin can write other people's
  -- rows, and comparing to NEW.id would let them re-key the row to their own
  -- uuid to satisfy the check. (Today only the profiles primary key stops
  -- that.) On the INSERT arm above there is no OLD, and NEW.id is correct.
  if new.resume_book_opt_in and not coalesce(old.resume_book_opt_in, false) then
    if auth.uid() is not null and auth.uid() is distinct from old.id then
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

-- Drop-then-create rather than PG14's `create or replace trigger`, so this
-- file stays re-runnable on any Postgres 13+ instance.
drop trigger if exists profiles_stamp_opt_in on public.profiles;
create trigger profiles_stamp_opt_in
  before insert or update on public.profiles
  for each row execute function public.profiles_stamp_opt_in();

-- Matching the revoke discipline at the end of 0001_init.sql. A trigger
-- function needs EXECUTE only at `create trigger` time, never when the
-- trigger fires, so no grant back to authenticated is required.
revoke execute on function public.profiles_stamp_opt_in() from public, anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ROLLBACK (copy-paste as a whole; order matters)
--
-- Dropping the columns FIRST bricks the table: the trigger stays installed and
-- every insert/update on public.profiles -- including handle_new_user() during
-- signup -- then fails with `record "new" has no field "resume_book_opt_in"`,
-- locking out all signups. Always drop the trigger, then the function, then
-- the columns.
--
--   drop trigger if exists profiles_stamp_opt_in on public.profiles;
--   drop function if exists public.profiles_stamp_opt_in();
--   alter table public.profiles
--     drop column if exists resume_book_opt_in_by,
--     drop column if exists resume_book_opt_in_at,
--     drop column if exists resume_book_opt_in;
--   notify pgrst, 'reload schema';
--
-- If 0005_consent_and_package_path_guards.sql has also been applied, drop its
-- consent constraint before the columns (it is dropped with the column anyway,
-- but being explicit keeps the order obvious):
--
--   alter table public.profiles
--     drop constraint if exists resume_book_opt_in_is_member;
-- ---------------------------------------------------------------------------
