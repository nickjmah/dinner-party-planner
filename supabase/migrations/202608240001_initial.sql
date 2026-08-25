create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.dinners (
  id text primary key check (id ~ '^dinner_[a-zA-Z0-9]+$'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  cuisine text not null default '',
  guest_count integer not null default 12 check (guest_count between 1 and 200),
  event_date date not null,
  serve_time time not null default '19:00',
  dietary_notes text not null default '',
  notes text not null default '',
  burners integer not null default 4 check (burners between 0 and 20),
  ovens integer not null default 1 check (ovens between 0 and 10),
  fryers integer not null default 1 check (fryers between 0 and 10),
  cooks integer not null default 1 check (cooks between 1 and 50),
  shopping_chef_notes text not null default '',
  timeline_chef_notes text not null default '',
  timeline_days integer not null default 4 check (timeline_days between 1 and 30),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, owner_id)
);

create table public.dinner_shares (
  id uuid primary key default gen_random_uuid(),
  dinner_id text not null unique references public.dinners(id) on delete cascade,
  owner_id uuid not null,
  share_id text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  code_hash text not null,
  share_version integer not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade
);

create table public.recipes (
  id text primary key check (id ~ '^recipe_[a-zA-Z0-9]+$'),
  dinner_id text not null,
  owner_id uuid not null,
  title text not null,
  short_title text not null default '',
  source_url text not null default '',
  source_host text not null default '',
  source_type text not null default 'manual',
  yield_text text not null default '',
  yield_servings numeric,
  target_servings numeric,
  prep_minutes integer,
  cook_minutes integer,
  total_minutes integer,
  provenance jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  translated_title text not null default '',
  translated_yield_text text not null default '',
  translation_language text not null default '',
  translation_model text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade,
  unique (id, dinner_id, owner_id)
);

create table public.ingredients (
  id text primary key check (id ~ '^ingredient_[a-zA-Z0-9]+$'),
  recipe_id text not null,
  dinner_id text not null,
  owner_id uuid not null,
  position integer not null,
  raw_text text not null,
  translated_text text not null default '',
  quantity numeric,
  unit text not null default '',
  item text not null default '',
  notes text not null default '',
  provenance jsonb not null default '{}'::jsonb,
  foreign key (recipe_id, dinner_id, owner_id) references public.recipes(id, dinner_id, owner_id) on delete cascade,
  unique (recipe_id, position)
);

create table public.steps (
  id text primary key check (id ~ '^step_[a-zA-Z0-9]+$'),
  recipe_id text not null,
  dinner_id text not null,
  owner_id uuid not null,
  position integer not null,
  section text not null default '',
  raw_text text not null,
  translated_section text not null default '',
  translated_text text not null default '',
  provenance jsonb not null default '{}'::jsonb,
  foreign key (recipe_id, dinner_id, owner_id) references public.recipes(id, dinner_id, owner_id) on delete cascade,
  unique (recipe_id, position)
);

create table public.shopping_items (
  id text primary key check (id ~ '^shop_[a-zA-Z0-9]+$'),
  dinner_id text not null,
  owner_id uuid not null,
  key text not null,
  item text not null,
  quantity numeric,
  unit text not null default '',
  raw_sources jsonb not null default '[]'::jsonb,
  category text not null default 'Other',
  purchased boolean not null default false,
  assignee text not null default '',
  covered_quantity numeric not null default 0 check (covered_quantity >= 0),
  manual_covered_quantity numeric not null default 0 check (manual_covered_quantity >= 0),
  component_requirements jsonb not null default '[]'::jsonb,
  covered_components jsonb not null default '{}'::jsonb,
  manual_covered_components jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade,
  unique (dinner_id, key)
);

create table public.tasks (
  id text primary key check (id ~ '^task_[a-zA-Z0-9]+$'),
  dinner_id text not null,
  recipe_id text,
  owner_id uuid not null,
  title text not null,
  source_step_ids text[] not null default '{}',
  day_offset integer not null default 0 check (day_offset between -30 and 1),
  start_time time not null default '10:00',
  duration_minutes integer not null default 15 check (duration_minutes between 1 and 2880),
  active_minutes integer not null default 15 check (active_minutes between 0 and 2880),
  passive_minutes integer not null default 0 check (passive_minutes between 0 and 10080),
  resource text not null default 'counter' check (resource in ('counter','burner','oven','fryer','fridge','freezer','none')),
  assignee text not null default '',
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  provenance jsonb not null default '{}'::jsonb,
  notes text not null default '',
  timing_basis text not null default '',
  storage_method text not null default '',
  timing_note text not null default '',
  freezer_suitable boolean not null default false,
  sort_order integer not null default 1,
  ingredient_progress jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (dinner_id, owner_id) references public.dinners(id, owner_id) on delete cascade,
  foreign key (recipe_id, dinner_id, owner_id) references public.recipes(id, dinner_id, owner_id) on delete cascade
);

create table public.recipe_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  recipe_id text,
  legacy_recipe_id text not null,
  dinner_id text,
  owner_id uuid not null,
  original_drive_file_id text,
  original_drive_name text not null default '',
  source_url text not null default '',
  source_type text not null,
  fetched_at timestamptz not null,
  content_sha256 text not null,
  source_content text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  foreign key (recipe_id, dinner_id, owner_id) references public.recipes(id, dinner_id, owner_id) on delete set null (recipe_id, dinner_id),
  check (source_content is not null or storage_path is not null),
  unique (owner_id, original_drive_file_id)
);

create table public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_spreadsheet_id text not null,
  status text not null check (status in ('started','validated','committed','failed')),
  source_counts jsonb not null default '{}'::jsonb,
  imported_counts jsonb not null default '{}'::jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table public.guest_unlock_attempts (
  id bigint generated always as identity primary key,
  share_id text not null,
  ip_hash text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default timezone('utc', now())
);

create index recipes_dinner_id_idx on public.recipes(dinner_id);
create index ingredients_dinner_recipe_idx on public.ingredients(dinner_id, recipe_id, position);
create index steps_dinner_recipe_idx on public.steps(dinner_id, recipe_id, position);
create index shopping_dinner_idx on public.shopping_items(dinner_id, category, item);
create index tasks_dinner_day_idx on public.tasks(dinner_id, day_offset, sort_order);
create index guest_attempts_lookup_idx on public.guest_unlock_attempts(share_id, ip_hash, attempted_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger dinners_updated_at before update on public.dinners for each row execute function public.set_updated_at();
create trigger shares_updated_at before update on public.dinner_shares for each row execute function public.set_updated_at();
create trigger recipes_updated_at before update on public.recipes for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.dinners enable row level security;
alter table public.dinner_shares enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.steps enable row level security;
alter table public.shopping_items enable row level security;
alter table public.tasks enable row level security;
alter table public.recipe_source_snapshots enable row level security;
alter table public.migration_runs enable row level security;
alter table public.guest_unlock_attempts enable row level security;

create policy "owner profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "owner dinners" on public.dinners for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner shares" on public.dinner_shares for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner recipes" on public.recipes for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.dinners d where d.id = dinner_id and d.owner_id = auth.uid()));
create policy "owner ingredients" on public.ingredients for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid() and r.dinner_id = dinner_id));
create policy "owner steps" on public.steps for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = auth.uid() and r.dinner_id = dinner_id));
create policy "owner shopping" on public.shopping_items for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.dinners d where d.id = dinner_id and d.owner_id = auth.uid()));
create policy "owner tasks" on public.tasks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.dinners d where d.id = dinner_id and d.owner_id = auth.uid()));
create policy "owner snapshots" on public.recipe_source_snapshots for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner migrations" on public.migration_runs for select to authenticated using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-pdfs', 'recipe-pdfs', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "owner recipe PDF reads" on storage.objects for select to authenticated using (bucket_id = 'recipe-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner recipe PDF uploads" on storage.objects for insert to authenticated with check (bucket_id = 'recipe-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner recipe PDF changes" on storage.objects for update to authenticated using (bucket_id = 'recipe-pdfs' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'recipe-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner recipe PDF deletes" on storage.objects for delete to authenticated using (bucket_id = 'recipe-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.rotate_dinner_share(p_dinner_id text, p_code text)
returns table (share_id text, share_version integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or not exists (select 1 from public.dinners where id = p_dinner_id and owner_id = v_owner) then
    raise exception 'Dinner not found';
  end if;
  if p_code !~ '^[A-Za-z0-9]{8}$' then
    raise exception 'Guest code must be exactly 8 letters or numbers';
  end if;
  insert into public.dinner_shares (dinner_id, owner_id, code_hash)
  values (p_dinner_id, v_owner, extensions.crypt(upper(p_code), extensions.gen_salt('bf', 10)))
  on conflict (dinner_id) do update set
    code_hash = excluded.code_hash,
    share_id = encode(extensions.gen_random_bytes(18), 'hex'),
    share_version = public.dinner_shares.share_version + 1,
    enabled = true;
  return query select s.share_id, s.share_version from public.dinner_shares s where s.dinner_id = p_dinner_id;
end;
$$;

create or replace function public.verify_guest_code(p_share_id text, p_code text, p_ip_hash text)
returns table (dinner_id text, share_version integer)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_share public.dinner_shares%rowtype;
  v_failures integer;
  v_ok boolean;
begin
  select * into v_share from public.dinner_shares where share_id = p_share_id and enabled = true;
  select count(*) into v_failures from public.guest_unlock_attempts
    where share_id = p_share_id and ip_hash = p_ip_hash and not succeeded and attempted_at > timezone('utc', now()) - interval '15 minutes';
  if v_failures >= 5 then raise exception 'Too many attempts. Try again later.' using errcode = 'P0001'; end if;
  v_ok := v_share.id is not null and v_share.code_hash = extensions.crypt(upper(p_code), v_share.code_hash);
  insert into public.guest_unlock_attempts (share_id, ip_hash, succeeded) values (p_share_id, p_ip_hash, v_ok);
  if not v_ok then raise exception 'Incorrect dinner code.' using errcode = 'P0001'; end if;
  return query select v_share.dinner_id, v_share.share_version;
end;
$$;

revoke all on function public.verify_guest_code(text, text, text) from public, anon, authenticated;
grant execute on function public.verify_guest_code(text, text, text) to service_role;
revoke all on table public.guest_unlock_attempts from public, anon, authenticated;
grant execute on function public.rotate_dinner_share(text, text) to authenticated;
