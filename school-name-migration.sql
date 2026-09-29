-- BrightFuture School Management
-- Allows the login screen to display the school name before a user signs in.
-- This function exposes ONLY the school name; it does not expose the rest of
-- the school_settings row.

create or replace function public.get_school_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select nullif(trim(name), '') from public.school_settings where id = 1 limit 1),
    'Brightfuture Primary School'
  );
$$;

grant execute on function public.get_school_name() to anon, authenticated;
