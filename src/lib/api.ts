import type { Dinner, DinnerDetail, GuestDinner, Ingredient, Recipe, RecipeStep, ShoppingItem, TimelineTask } from '../types';
import { supabase } from './supabase';
import { buildShoppingItems } from './shopping';

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
