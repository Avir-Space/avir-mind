-- Test/hygiene helper: let a user clear their own MFA enrollment so the 2FA
-- enrollment E2E (1.4.1) starts from a clean "Not enabled" state. A leftover
-- VERIFIED factor cannot be self-removed at AAL1 (Supabase requires AAL2 to
-- unenroll), so tests need a definer-level reset. Deletes only the caller's rows.
create or replace function public.reset_my_mfa()
returns int language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_n int;
begin
  delete from auth.mfa_factors where user_id = auth.uid();
  get diagnostics v_n = row_count;
  delete from public.user_2fa_configurations where user_id = auth.uid();
  return v_n;
end $$;
grant execute on function public.reset_my_mfa() to authenticated;
