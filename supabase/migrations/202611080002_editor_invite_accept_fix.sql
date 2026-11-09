create or replace function public.accept_dinner_editor_invite(p_token text)
returns table (dinner_id text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_email text := coalesce(auth.jwt()->>'email', '');
  v_invite public.dinner_editor_invites%rowtype;
begin
  if v_user is null then raise exception 'Sign in to accept this editor invite'; end if;
  select * into v_invite from public.dinner_editor_invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null and accepted_at is null and expires_at > timezone('utc', now())
  for update;
  if v_invite.id is null then raise exception 'This editor invite is invalid, expired, or already used'; end if;
  if v_invite.owner_id = v_user then raise exception 'You already own this dinner'; end if;
  insert into public.dinner_members (dinner_id, user_id, role, email, invited_by)
  values (v_invite.dinner_id, v_user, 'editor', v_email, v_invite.owner_id)
  on conflict on constraint dinner_members_pkey do update set role = 'editor', email = excluded.email;
  update public.dinner_editor_invites set accepted_by = v_user, accepted_at = timezone('utc', now()) where id = v_invite.id;
  return query select v_invite.dinner_id;
end;
$$;

revoke all on function public.accept_dinner_editor_invite(text) from public, anon, authenticated;
grant execute on function public.accept_dinner_editor_invite(text) to authenticated;
