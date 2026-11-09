-- Edge Functions use the private service role for sanitized guest responses.
-- Client roles remain restricted by the grants and RLS policies in earlier migrations.
grant usage on schema public to service_role;

grant select on table public.profiles to service_role;
grant select on table public.dinners to service_role;
grant select on table public.dinner_shares to service_role;
grant select on table public.recipes to service_role;
grant select on table public.ingredients to service_role;
grant select on table public.steps to service_role;
grant select on table public.shopping_items to service_role;
grant select on table public.tasks to service_role;
grant select on table public.recipe_source_snapshots to service_role;
grant select on table public.migration_runs to service_role;
grant select on table public.dinner_members to service_role;
grant select on table public.dinner_editor_invites to service_role;
grant select, insert on table public.guest_unlock_attempts to service_role;
