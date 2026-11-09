create table public.dinner_access_links (
  id uuid primary key default gen_random_uuid(),
  dinner_id text not null references public.dinners(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade
);

alter table public.dinner_members add column expires_at timestamptz;
alter table public.dinner_members add column access_link_id uuid references public.dinner_access_links(id) on delete cascade;
create index dinner_access_links_dinner_id_idx on public.dinner_access_links(dinner_id);
create index dinner_members_access_link_id_idx on public.dinner_members(access_link_id);

alter table public.dinner_access_links enable row level security;
create policy "owners read dinner access links" on public.dinner_access_links for select to authenticated using (owner_id = auth.uid());
revoke all on table public.dinner_access_links from anon, authenticated;
grant select on table public.dinner_access_links to authenticated;
grant select on table public.dinner_access_links to service_role;

create or replace function public.can_edit_dinner(p_dinner_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.dinners d where d.id = p_dinner_id and d.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.dinner_members m
    left join public.dinner_access_links l on l.id = m.access_link_id
    where m.dinner_id = p_dinner_id
      and m.user_id = auth.uid()
      and m.role = 'editor'
      and (m.expires_at is null or m.expires_at > timezone('utc', now()))
      and (m.access_link_id is null or (l.revoked_at is null and l.expires_at > timezone('utc', now())))
  )
$$;

drop policy if exists "owners create dinners" on public.dinners;
create policy "owners create dinners" on public.dinners for insert to authenticated
with check (owner_id = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

create or replace function public.create_dinner_access_link(p_dinner_id text)
returns table (access_link_id uuid, access_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_expires timestamptz := timezone('utc', now()) + interval '30 days';
begin
  if v_owner is null or not exists (select 1 from public.dinners where id = p_dinner_id and owner_id = v_owner) then
    raise exception 'Only the dinner owner can create access links';
  end if;
  insert into public.dinner_access_links (dinner_id, owner_id, token_hash, expires_at)
  values (p_dinner_id, v_owner, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires)
  returning id into v_id;
  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.redeem_dinner_access_link(p_token text)
returns table (dinner_id text)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_link public.dinner_access_links%rowtype;
begin
  if v_user is null then raise exception 'Open this access link again'; end if;
  select * into v_link from public.dinner_access_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null and expires_at > timezone('utc', now());
  if v_link.id is null then raise exception 'This access link is invalid, expired, or revoked'; end if;
  if v_link.owner_id <> v_user then
    insert into public.dinner_members (dinner_id, user_id, role, email, invited_by, expires_at, access_link_id)
    values (v_link.dinner_id, v_user, 'editor', '', v_link.owner_id, v_link.expires_at, v_link.id)
    on conflict on constraint dinner_members_pkey do update
      set expires_at = excluded.expires_at, access_link_id = excluded.access_link_id
      where public.dinner_members.access_link_id is not null;
  end if;
  return query select v_link.dinner_id;
end;
$$;

create or replace function public.revoke_dinner_access_link(p_access_link_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.dinner_access_links set revoked_at = timezone('utc', now())
  where id = p_access_link_id and owner_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'Access link not found'; end if;
  delete from public.dinner_members where access_link_id = p_access_link_id;
end;
$$;

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
  insert into public.dinner_members (dinner_id, user_id, role, email, invited_by, expires_at, access_link_id)
  values (v_invite.dinner_id, v_user, 'editor', v_email, v_invite.owner_id, null, null)
  on conflict on constraint dinner_members_pkey do update
    set role = 'editor', email = excluded.email, expires_at = null, access_link_id = null;
  update public.dinner_editor_invites set accepted_by = v_user, accepted_at = timezone('utc', now()) where id = v_invite.id;
  return query select v_invite.dinner_id;
end;
$$;

revoke all on function public.create_dinner_access_link(text) from public, anon, authenticated;
revoke all on function public.redeem_dinner_access_link(text) from public, anon, authenticated;
revoke all on function public.revoke_dinner_access_link(uuid) from public, anon, authenticated;
grant execute on function public.create_dinner_access_link(text) to authenticated;
grant execute on function public.redeem_dinner_access_link(text) to authenticated;
grant execute on function public.revoke_dinner_access_link(uuid) to authenticated;
