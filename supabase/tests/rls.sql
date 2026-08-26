begin;
select plan(10);

select has_table('public', 'dinners', 'dinners table exists');
select has_table('public', 'dinner_shares', 'dinner shares table exists');
select has_table('public', 'recipe_source_snapshots', 'source snapshots table exists');
select has_function('public', 'rotate_dinner_share', array['text','text'], 'owner share rotation exists');
select has_function('public', 'verify_guest_code', array['text','text','text'], 'private guest verification exists');
select policies_are('public', 'dinners', array['owner dinners'], 'dinners expose only owner policy');
select policies_are('public', 'recipes', array['owner recipes'], 'recipes expose only owner policy');
select policies_are('public', 'ingredients', array['owner ingredients'], 'ingredients expose only owner policy');
select policies_are('public', 'tasks', array['owner tasks'], 'tasks expose only owner policy');
select table_privs_are('public', 'dinners', 'authenticated', array['DELETE', 'INSERT', 'SELECT', 'UPDATE'], 'authenticated owners can use dinners under RLS');
select table_privs_are('public', 'guest_unlock_attempts', 'authenticated', array[]::text[], 'authenticated clients cannot access guest rate-limit rows');
select is_empty($$select grantee from information_schema.routine_privileges where routine_schema='public' and routine_name='verify_guest_code' and grantee in ('anon','authenticated','PUBLIC') and privilege_type='EXECUTE'$$, 'guest code verifier is service-role only');

select * from finish();
rollback;
