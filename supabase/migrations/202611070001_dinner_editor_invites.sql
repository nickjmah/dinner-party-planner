create table if not exists public.dinner_members (
  dinner_id text not null references public.dinners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check (role = 'editor'),
  email text not null default '',
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (dinner_id, user_id)
);

create table if not exists public.dinner_editor_invites (
  id uuid primary key default gen_random_uuid(),
  dinner_id text not null references public.dinners(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade
);

create index if not exists dinner_members_user_id_idx on public.dinner_members(user_id);
create index if not exists dinner_editor_invites_dinner_id_idx on public.dinner_editor_invites(dinner_id);

create or replace function public.dinner_owner_id(p_dinner_id text)
returns uuid
language sql stable security definer set search_path = public
as $$ select owner_id from public.dinners where id = p_dinner_id $$;

create or replace function public.can_edit_dinner(p_dinner_id text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.dinners d where d.id = p_dinner_id and d.owner_id = auth.uid()
  ) or exists (
    select 1 from public.dinner_members m where m.dinner_id = p_dinner_id and m.user_id = auth.uid() and m.role = 'editor'
  )
$$;

create or replace function public.prevent_dinner_owner_change()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'Dinner ownership cannot be changed'; end if;
  return new;
end;
$$;

drop trigger if exists prevent_dinner_owner_change on public.dinners;
create trigger prevent_dinner_owner_change before update of owner_id on public.dinners for each row execute function public.prevent_dinner_owner_change();

alter table public.dinner_members enable row level security;
alter table public.dinner_editor_invites enable row level security;

drop policy if exists "owner dinners" on public.dinners;
create policy "owners and editors read dinners" on public.dinners for select to authenticated using (public.can_edit_dinner(id));
create policy "owners create dinners" on public.dinners for insert to authenticated with check (owner_id = auth.uid());
create policy "owners and editors update dinners" on public.dinners for update to authenticated using (public.can_edit_dinner(id)) with check (public.can_edit_dinner(id) and owner_id = public.dinner_owner_id(id));
create policy "owners delete dinners" on public.dinners for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "owner recipes" on public.recipes;
create policy "dinner editors manage recipes" on public.recipes for all to authenticated using (public.can_edit_dinner(dinner_id)) with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

drop policy if exists "owner ingredients" on public.ingredients;
create policy "dinner editors manage ingredients" on public.ingredients for all to authenticated using (public.can_edit_dinner(dinner_id)) with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

drop policy if exists "owner steps" on public.steps;
create policy "dinner editors manage steps" on public.steps for all to authenticated using (public.can_edit_dinner(dinner_id)) with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

drop policy if exists "owner shopping" on public.shopping_items;
create policy "dinner editors manage shopping" on public.shopping_items for all to authenticated using (public.can_edit_dinner(dinner_id)) with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

drop policy if exists "owner tasks" on public.tasks;
create policy "dinner editors manage tasks" on public.tasks for all to authenticated using (public.can_edit_dinner(dinner_id)) with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

drop policy if exists "owner snapshots" on public.recipe_source_snapshots;
create policy "dinner editors read snapshots" on public.recipe_source_snapshots for select to authenticated using (public.can_edit_dinner(dinner_id));
create policy "dinner editors add snapshots" on public.recipe_source_snapshots for insert to authenticated with check (public.can_edit_dinner(dinner_id) and owner_id = public.dinner_owner_id(dinner_id));

create policy "owners read dinner members" on public.dinner_members for select to authenticated using (public.dinner_owner_id(dinner_id) = auth.uid() or user_id = auth.uid());
create policy "owners read editor invites" on public.dinner_editor_invites for select to authenticated using (owner_id = auth.uid());

revoke all on table public.dinner_members from anon, authenticated;
revoke all on table public.dinner_editor_invites from anon, authenticated;
grant select on table public.dinner_members to authenticated;
grant select on table public.dinner_editor_invites to authenticated;
grant select, insert on table public.recipe_source_snapshots to authenticated;

create or replace function public.create_dinner_editor_invite(p_dinner_id text, p_expires_days integer default 7)
returns table (invite_id uuid, invite_token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_owner uuid := auth.uid();
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid;
  v_expires timestamptz;
begin
  if v_owner is null or not exists (select 1 from public.dinners where id = p_dinner_id and owner_id = v_owner) then
    raise exception 'Only the dinner owner can invite editors';
  end if;
  if p_expires_days < 1 or p_expires_days > 30 then raise exception 'Invite expiry must be between 1 and 30 days'; end if;
  v_expires := timezone('utc', now()) + make_interval(days => p_expires_days);
  insert into public.dinner_editor_invites (dinner_id, owner_id, token_hash, expires_at)
  values (p_dinner_id, v_owner, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires)
  returning id into v_id;
  return query select v_id, v_token, v_expires;
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
  insert into public.dinner_members (dinner_id, user_id, role, email, invited_by)
  values (v_invite.dinner_id, v_user, 'editor', v_email, v_invite.owner_id)
  on conflict (dinner_id, user_id) do update set role = 'editor', email = excluded.email;
  update public.dinner_editor_invites set accepted_by = v_user, accepted_at = timezone('utc', now()) where id = v_invite.id;
  return query select v_invite.dinner_id;
end;
$$;

create or replace function public.revoke_dinner_editor(p_dinner_id text, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.dinner_owner_id(p_dinner_id) <> auth.uid() then raise exception 'Only the dinner owner can remove editors'; end if;
  delete from public.dinner_members where dinner_id = p_dinner_id and user_id = p_user_id;
end;
$$;

create or replace function public.revoke_dinner_editor_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.dinner_editor_invites set revoked_at = timezone('utc', now()) where id = p_invite_id and owner_id = auth.uid() and accepted_at is null;
  if not found then raise exception 'Editor invite not found'; end if;
end;
$$;

revoke all on function public.dinner_owner_id(text) from public, anon, authenticated;
revoke all on function public.can_edit_dinner(text) from public, anon, authenticated;
revoke all on function public.create_dinner_editor_invite(text, integer) from public, anon, authenticated;
revoke all on function public.accept_dinner_editor_invite(text) from public, anon, authenticated;
revoke all on function public.revoke_dinner_editor(text, uuid) from public, anon, authenticated;
revoke all on function public.revoke_dinner_editor_invite(uuid) from public, anon, authenticated;
grant execute on function public.dinner_owner_id(text) to authenticated;
grant execute on function public.can_edit_dinner(text) to authenticated;
grant execute on function public.create_dinner_editor_invite(text, integer) to authenticated;
grant execute on function public.accept_dinner_editor_invite(text) to authenticated;
grant execute on function public.revoke_dinner_editor(text, uuid) to authenticated;
grant execute on function public.revoke_dinner_editor_invite(uuid) to authenticated;
