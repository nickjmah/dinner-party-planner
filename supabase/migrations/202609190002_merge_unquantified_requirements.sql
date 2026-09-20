alter table public.shopping_items
  add column if not exists unquantified_required boolean not null default false;

update public.ingredients
set item = 'unsalted butter',
    quantity = null,
    unit = '',
    notes = case
      when lower(notes) like '%nonstick spray%' then notes
      when notes = '' then 'or nonstick spray; for greasing the pan'
      else notes || '; or nonstick spray; for greasing the pan'
    end
where lower(item) = 'unsalted butter or nonstick spray for greasing the pan'
   or lower(raw_text) = 'unsalted butter or nonstick spray, for greasing the pan';

with pairs as (
  select grease.id as grease_id,
         measured.id as measured_id,
         grease.raw_sources as grease_sources
  from public.shopping_items grease
  join public.shopping_items measured
    on measured.dinner_id = grease.dinner_id
   and measured.id <> grease.id
   and lower(measured.item) = 'unsalted butter'
   and measured.quantity is not null
  where lower(grease.item) = 'unsalted butter or nonstick spray for greasing the pan'
)
update public.shopping_items measured
set raw_sources = measured.raw_sources || pairs.grease_sources,
    unquantified_required = true,
    purchased = false,
    updated_at = timezone('utc', now())
from pairs
where measured.id = pairs.measured_id;

update public.shopping_items grease
set item = 'unsalted butter',
    key = 'unsalted butter|unquantified',
    unquantified_required = true,
    purchased = false,
    updated_at = timezone('utc', now())
where lower(grease.item) = 'unsalted butter or nonstick spray for greasing the pan'
  and not exists (
    select 1
    from public.shopping_items measured
    where measured.dinner_id = grease.dinner_id
      and measured.id <> grease.id
      and lower(measured.item) = 'unsalted butter'
      and measured.quantity is not null
  );

delete from public.shopping_items grease
where lower(grease.item) = 'unsalted butter or nonstick spray for greasing the pan'
  and exists (
    select 1
    from public.shopping_items measured
    where measured.dinner_id = grease.dinner_id
      and measured.id <> grease.id
      and lower(measured.item) = 'unsalted butter'
      and measured.quantity is not null
  );
