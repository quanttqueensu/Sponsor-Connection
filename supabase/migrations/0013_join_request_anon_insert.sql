-- Public /join inserts run as the `anon` role. join_requests_admin was
-- FOR ALL with no TO clause, so Postgres also evaluated is_admin() for
-- anonymous inserts. EXECUTE on is_admin() is authenticated-only (0002),
-- which raised `permission denied for function is_admin` and aborted the
-- row even though join_requests_insert_anon would have allowed it.
-- Scope the admin policy, and let a signed-in visitor submit too.
-- Idempotent.

drop policy if exists join_requests_admin on public.company_join_requests;
create policy join_requests_admin on public.company_join_requests
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists join_requests_insert_authenticated on public.company_join_requests;
create policy join_requests_insert_authenticated on public.company_join_requests
  for insert to authenticated
  with check (status = 'pending');

grant insert on public.company_join_requests to authenticated;

notify pgrst, 'reload schema';
