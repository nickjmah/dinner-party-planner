-- RLS policies decide which owner rows are visible, but PostgreSQL table
-- privileges are still required before those policies can be evaluated.
grant usage on schema public to authenticated;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.dinners from anon, authenticated;
revoke all on table public.dinner_shares from anon, authenticated;
revoke all on table public.recipes from anon, authenticated;
revoke all on table public.ingredients from anon, authenticated;
revoke all on table public.steps from anon, authenticated;
revoke all on table public.shopping_items from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;
revoke all on table public.recipe_source_snapshots from anon, authenticated;
revoke all on table public.migration_runs from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.dinners to authenticated;
grant select, insert, update, delete on table public.dinner_shares to authenticated;
grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, update, delete on table public.ingredients to authenticated;
grant select, insert, update, delete on table public.steps to authenticated;
grant select, insert, update, delete on table public.shopping_items to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select on table public.recipe_source_snapshots to authenticated;
grant select on table public.migration_runs to authenticated;

revoke all on table public.guest_unlock_attempts from anon, authenticated;
