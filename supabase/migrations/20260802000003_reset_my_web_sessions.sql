-- Test/hygiene helper: let a user clear their own session history so the E2E
-- session tests (1.5.x) start from a known state. Deletes only the caller's rows.
create or replace function public.reset_my_web_sessions()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  delete from public.user_sessions where user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
grant execute on function public.reset_my_web_sessions() to authenticated;
