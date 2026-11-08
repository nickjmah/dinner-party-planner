import type { Dinner, DinnerDetail, GuestDinner, Ingredient, Recipe, RecipeStep, ShoppingItem, TimelineTask } from '../types';
import { supabase } from './supabase';
import { buildShoppingItems } from './shopping';
import { parsePlannedMenu } from './menu';

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listDinners(): Promise<Dinner[]> {
  const { data, error } = await supabase.from('dinners').select('*').order('event_date', { ascending: false });
  fail(error);
  return (data || []) as Dinner[];
}

export async function getDinnerDetail(dinnerId: string): Promise<DinnerDetail> {
  const [dinner, recipes, ingredients, steps, shopping, tasks] = await Promise.all([
    supabase.from('dinners').select('*').eq('id', dinnerId).single(),
    supabase.from('recipes').select('*').eq('dinner_id', dinnerId).order('created_at'),
    supabase.from('ingredients').select('*').eq('dinner_id', dinnerId).order('position'),
    supabase.from('steps').select('*').eq('dinner_id', dinnerId).order('position'),
    supabase.from('shopping_items').select('*').eq('dinner_id', dinnerId).order('category').order('item'),
    supabase.from('tasks').select('*').eq('dinner_id', dinnerId).order('day_offset').order('sort_order'),
  ]);
  [dinner, recipes, ingredients, steps, shopping, tasks].forEach((result) => fail(result.error));
  return {
    dinner: dinner.data as Dinner,
    recipes: (recipes.data || []) as Recipe[],
    ingredients: (ingredients.data || []) as Ingredient[],
    steps: (steps.data || []) as RecipeStep[],
    shopping: (shopping.data || []) as ShoppingItem[],
    tasks: (tasks.data || []) as TimelineTask[],
    stale_at: new Date().toISOString(),
  };
}

export async function updateRow(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from(table).update(patch as never).eq('id', id);
  fail(error);
}

export async function deleteRecipe(recipeId: string, dinnerId: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
  fail(error);
  await rebuildShoppingForDinner(dinnerId);
}

export async function createPlannedMenu(dinnerId: string, guestCount: number, menuText: string): Promise<number> {
  const items = parsePlannedMenu(menuText);
  if (!items.length) throw new Error('Add at least one dish, with one dish per line.');
  if (items.length > 50) throw new Error('A menu can add up to 50 dishes at once.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again.');
  const rows = items.map((item) => ({
    id: `recipe_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    dinner_id: dinnerId,
    owner_id: user.id,
    title: item.title,
    source_type: 'planned',
    target_servings: guestCount,
    provenance: { rule: 'menu-only', status: 'recipe-needed', section: item.section },
  }));
  const { error } = await supabase.from('recipes').insert(rows as never);
  fail(error);
  return rows.length;
}

export async function completePlannedRecipe(planned: Recipe, importedRecipeId: string): Promise<void> {
  if (planned.source_type !== 'planned') throw new Error('Only planned menu items can be completed this way.');
  const plannedProvenance = planned.provenance && !Array.isArray(planned.provenance) && typeof planned.provenance === 'object' ? planned.provenance : {};
  const { data: imported, error: readError } = await supabase.from('recipes').select('provenance').eq('id', importedRecipeId).eq('dinner_id', planned.dinner_id).single();
  if (readError || !imported) {
    await supabase.from('recipes').delete().eq('id', importedRecipeId).eq('dinner_id', planned.dinner_id);
    await rebuildShoppingForDinner(planned.dinner_id);
    throw new Error(readError?.message || 'Imported recipe not found.');
  }
  const importedProvenance = imported.provenance && !Array.isArray(imported.provenance) && typeof imported.provenance === 'object' ? imported.provenance : {};
  const { error: updateError } = await supabase.from('recipes').update({
    short_title: planned.short_title || planned.title,
    target_servings: planned.target_servings,
    created_at: planned.created_at,
    provenance: { ...importedProvenance, planned_menu_notes: typeof plannedProvenance.menu_notes === 'string' ? plannedProvenance.menu_notes : '' },
  }).eq('id', importedRecipeId).eq('dinner_id', planned.dinner_id);
  if (updateError) {
    await supabase.from('recipes').delete().eq('id', importedRecipeId).eq('dinner_id', planned.dinner_id);
    throw new Error(updateError.message);
  }
  const { error: deleteError } = await supabase.from('recipes').delete().eq('id', planned.id).eq('source_type', 'planned');
  if (deleteError) {
    await supabase.from('recipes').delete().eq('id', importedRecipeId).eq('dinner_id', planned.dinner_id);
    await rebuildShoppingForDinner(planned.dinner_id);
    throw new Error(deleteError.message);
  }
  await rebuildShoppingForDinner(planned.dinner_id);
}

export async function rebuildShoppingForDinner(dinnerId: string): Promise<void> {
  const detail = await getDinnerDetail(dinnerId);
  const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Sign in again.');
  const rows = buildShoppingItems({ dinnerId, ownerId: user.id, guestCount: detail.dinner.guest_count, recipes: detail.recipes, ingredients: detail.ingredients, existing: detail.shopping, tasks: detail.tasks });
  const keep = new Set(rows.map((row) => row.id));
  const obsolete = detail.shopping.filter((row) => !keep.has(row.id)).map((row) => row.id);
  if (obsolete.length) { const { error } = await supabase.from('shopping_items').delete().in('id', obsolete); fail(error); }
  if (rows.length) { const { error } = await supabase.from('shopping_items').upsert(rows as never); fail(error); }
}

export async function invokeOwnerFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  fail(error);
  return data as T;
}

export async function unlockGuestDinner(shareId: string, code: string): Promise<string> {
  const response = await invokeOwnerFunction<{ token: string }>('guest-unlock', { shareId, code });
  sessionStorage.setItem(`dinner-guest:${shareId}`, response.token);
  return response.token;
}

export async function getGuestDinner(shareId: string, token?: string): Promise<GuestDinner> {
  const guestToken = token || sessionStorage.getItem(`dinner-guest:${shareId}`) || '';
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-dinner?shareId=${encodeURIComponent(shareId)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${guestToken}` } });
  if (!response.ok) throw new Error(response.status === 401 ? 'Enter this dinner’s access code.' : 'Unable to load this dinner.');
  return response.json() as Promise<GuestDinner>;
}
