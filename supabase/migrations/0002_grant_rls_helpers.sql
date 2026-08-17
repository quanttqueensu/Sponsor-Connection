-- RLS policies call these helpers as the current user. Revoking EXECUTE from
-- authenticated made every profile/feed query fail, which bounced logins
-- back to /login with no error.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.my_company_id() to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.member_applied_to_company(uuid, uuid) to authenticated;
grant execute on function public.is_in_app_job(public.posts) to authenticated;
