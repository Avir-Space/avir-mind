-- 0008: handle_new_user_signup
-- On insert into auth.users, provision the user via seed_avir_demo. Runs as
-- SECURITY DEFINER (auth.uid() is null in this context, so seed_avir_demo's
-- self-only guard is bypassed for the internal trigger path).
--
-- Wrapped so a seeding failure can never block account creation.

create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    perform public.seed_avir_demo(new.id);
  exception when others then
    raise warning 'handle_new_user_signup: seeding failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_signup();
