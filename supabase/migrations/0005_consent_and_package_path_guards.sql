-- Two guards that belong at the database layer, not the app layer.
-- Idempotent: safe to re-run, and safe to paste statement-by-statement into
-- the Supabase SQL editor (see 0001_init.sql line 2).

-- ---------------------------------------------------------------------------
-- 1. Only members can be in the resume book.
--
-- profiles_self_update applies to every authenticated role, so without this a
-- sponsor-firm employee could set resume_book_opt_in = true on their own
-- profile row and land in the member resume book that Phase 2 builds. The
-- app-layer check in lib/actions/profile.ts is not a control -- PostgREST
-- accepts a direct PATCH.
--
-- Mirrors the existing admin_is_member constraint. It cannot break existing
-- rows: resume_book_opt_in was added in 0004 with `not null default false`
-- and nothing has flipped it yet, so every row satisfies the left disjunct.
-- It also cannot break handle_new_user(), which inserts into public.profiles
-- without naming resume_book_opt_in and therefore always gets the false
-- default, whatever role the invite carries.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'resume_book_opt_in_is_member'
  ) then
    alter table public.profiles
      add constraint resume_book_opt_in_is_member
      check (not resume_book_opt_in or role = 'member');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Hiring package storage paths must belong to the owning member.
--
-- applications_guard() validates that applications.resume_path's first
-- segment is the member's own uuid, but hiring_packages had no equivalent
-- check -- its only trigger handles is_default/updated_at. applyToJob copies
-- hiring_packages.resume_path with the SERVICE ROLE, which bypasses storage
-- RLS, so a member could insert a hiring_packages row via PostgREST whose
-- resume_path pointed at another student's file and have that student's
-- resume submitted to a sponsor under their own name.
--
-- Unlike applications_guard() this does NOT accept a 'snapshots/' prefix:
-- only applications legitimately reference snapshot copies. It also runs on
-- UPDATE, not just INSERT, so a path cannot be swapped in after the fact.
--
-- On UPDATE the check is skipped when neither path nor member_id changed.
-- That is deliberate: hiring_packages_default_guard() issues a blanket
-- `update ... set is_default = false` across the member's other rows, which
-- re-fires this trigger on rows this migration never inspected. Any row
-- predating this migration with a non-conforming path would otherwise make
-- toggling the default package fail. Nothing is weakened -- a path can only
-- be introduced or altered through a write that this guard does inspect.
--
-- security invoker (the default) and `set search_path = public`, per the
-- discipline in 0001_init.sql.
create or replace function public.hiring_packages_path_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and new.member_id is not distinct from old.member_id
    and new.resume_path is not distinct from old.resume_path
    and new.cover_letter_path is not distinct from old.cover_letter_path then
    return new;
  end if;

  if new.resume_path is null
    or split_part(new.resume_path, '/', 1) <> new.member_id::text then
    raise exception 'Invalid resume path';
  end if;
  if new.cover_letter_path is not null
    and split_part(new.cover_letter_path, '/', 1) <> new.member_id::text then
    raise exception 'Invalid cover letter path';
  end if;
  return new;
end;
$$;

drop trigger if exists hiring_packages_path_guard on public.hiring_packages;
create trigger hiring_packages_path_guard
  before insert or update on public.hiring_packages
  for each row execute function public.hiring_packages_path_guard();

revoke execute on function public.hiring_packages_path_guard() from public, anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- ROLLBACK (copy-paste as a whole)
--
--   drop trigger if exists hiring_packages_path_guard on public.hiring_packages;
--   drop function if exists public.hiring_packages_path_guard();
--   alter table public.profiles
--     drop constraint if exists resume_book_opt_in_is_member;
--   notify pgrst, 'reload schema';
-- ---------------------------------------------------------------------------
