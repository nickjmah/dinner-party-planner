alter table public.shopping_items
  add column if not exists notes text not null default '';
