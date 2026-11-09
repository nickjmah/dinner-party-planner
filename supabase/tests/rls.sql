begin;
select plan(22);

select has_table('public', 'dinners', 'dinners table exists');
select has_table('public', 'dinner_shares', 'dinner shares table exists');
select has_table('public', 'recipe_source_snapshots', 'source snapshots table exists');
select has_table('public', 'dinner_members', 'dinner editor membership table exists');
select has_table('public', 'dinner_editor_invites', 'one-time dinner editor invites table exists');
select has_function('public', 'rotate_dinner_share', array['text','text'], 'owner share rotation exists');
select has_function('public', 'verify_guest_code', array['text','text','text'], 'private guest verification exists');
select has_function('public', 'create_dinner_editor_invite', array['text','integer'], 'owner can create dinner editor invite');
select has_function('public', 'accept_dinner_editor_invite', array['text'], 'authenticated user can accept editor invite');
select has_function('public', 'revoke_dinner_editor', array['text','uuid'], 'owner can remove dinner editor');
select has_function('public', 'revoke_dinner_editor_invite', array['uuid'], 'owner can revoke unused editor invite');
select policies_are('public', 'dinners', array['owners and editors read dinners','owners create dinners','owners and editors update dinners','owners delete dinners'], 'dinner access separates owner-only actions from editor access');
select policies_are('public', 'recipes', array['dinner editors manage recipes'], 'editors can manage recipes for shared dinners');
select policies_are('public', 'ingredients', array['dinner editors manage ingredients'], 'editors can manage ingredients for shared dinners');
select policies_are('public', 'tasks', array['dinner editors manage tasks'], 'editors can manage tasks for shared dinners');
select policies_are('public', 'dinner_members', array['owners read dinner members'], 'membership rows are visible only to owner or member');
select policies_are('public', 'dinner_editor_invites', array['owners read editor invites'], 'editor invite rows are owner-only');
select table_privs_are('public', 'dinners', 'authenticated', array['DELETE', 'INSERT', 'SELECT', 'UPDATE'], 'authenticated owners can use dinners under RLS');
select ok(has_table_privilege('service_role', 'public.dinner_shares', 'SELECT'), 'guest Edge Function can read dinner shares with the private service role');
select ok(has_table_privilege('service_role', 'public.dinners', 'SELECT'), 'guest Edge Function can read sanitized dinner data with the private service role');
select table_privs_are('public', 'guest_unlock_attempts', 'authenticated', array[]::text[], 'authenticated clients cannot access guest rate-limit rows');
select is_empty($$select grantee from information_schema.routine_privileges where routine_schema='public' and routine_name='verify_guest_code' and grantee in ('anon','authenticated','PUBLIC') and privilege_type='EXECUTE'$$, 'guest code verifier is service-role only');

select * from finish();
rollback;
