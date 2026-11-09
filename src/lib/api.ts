import type { Dinner, DinnerAccessLink, DinnerDetail, DinnerEditor, DinnerEditorInvite, GuestDinner, Ingredient, Recipe, RecipeStep, ShoppingItem, TimelineTask } from '../types';
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

export async function createPlannedMenu(dinnerId: string, ownerId: string, guestCount: number, menuText: string): Promise<number> {
  const items = parsePlannedMenu(menuText);
  if (!items.length) throw new Error('Add at least one dish, with one dish per line.');
  if (items.length > 50) throw new Error('A menu can add up to 50 dishes at once.');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again.');
  const rows = items.map((item) => ({
    id: `recipe_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    dinner_id: dinnerId,
    owner_id: ownerId,
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
  const rows = buildShoppingItems({ dinnerId, ownerId: detail.dinner.owner_id, guestCount: detail.dinner.guest_count, recipes: detail.recipes, ingredients: detail.ingredients, existing: detail.shopping, tasks: detail.tasks });
  const keep = new Set(rows.map((row) => row.id));
  const obsolete = detail.shopping.filter((row) => !keep.has(row.id)).map((row) => row.id);
  if (obsolete.length) { const { error } = await supabase.from('shopping_items').delete().in('id', obsolete); fail(error); }
  if (rows.length) { const { error } = await supabase.from('shopping_items').upsert(rows as never); fail(error); }
}

export async function listDinnerEditors(dinnerId: string): Promise<{ editors: DinnerEditor[]; invites: DinnerEditorInvite[]; accessLinks: DinnerAccessLink[] }> {
  const [editors, invites, accessLinks] = await Promise.all([
    supabase.from('dinner_members').select('*').eq('dinner_id', dinnerId).order('created_at'),
    supabase.from('dinner_editor_invites').select('*').eq('dinner_id', dinnerId).order('created_at', { ascending: false }),
    supabase.from('dinner_access_links').select('*').eq('dinner_id', dinnerId).order('created_at', { ascending: false }),
  ]);
  fail(editors.error); fail(invites.error); fail(accessLinks.error);
  return { editors: (editors.data || []) as DinnerEditor[], invites: (invites.data || []) as DinnerEditorInvite[], accessLinks: (accessLinks.data || []) as DinnerAccessLink[] };
}

export async function createDinnerEditorInvite(dinnerId: string, expiresDays = 7): Promise<{ inviteId: string; token: string; expiresAt: string; link: string }> {
  const { data, error } = await supabase.rpc('create_dinner_editor_invite', { p_dinner_id: dinnerId, p_expires_days: expiresDays });
  fail(error);
  const row = data?.[0]; if (!row) throw new Error('Editor invite was not created.');
  return { inviteId: row.invite_id, token: row.invite_token, expiresAt: row.expires_at, link: `${location.origin}${location.pathname}#/join/${row.invite_token}` };
}

export async function acceptDinnerEditorInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_dinner_editor_invite', { p_token: token });
  fail(error);
  const dinnerId = data?.[0]?.dinner_id; if (!dinnerId) throw new Error('Editor invite could not be accepted.');
  return dinnerId;
}

export async function revokeDinnerEditor(dinnerId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_dinner_editor', { p_dinner_id: dinnerId, p_user_id: userId }); fail(error);
}

export async function revokeDinnerEditorInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_dinner_editor_invite', { p_invite_id: inviteId }); fail(error);
}

export async function createDinnerAccessLink(dinnerId: string): Promise<{ accessLinkId: string; link: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('create_dinner_access_link', { p_dinner_id: dinnerId }); fail(error);
  const row = data?.[0]; if (!row) throw new Error('30-day access link was not created.');
  return { accessLinkId: row.access_link_id, expiresAt: row.expires_at, link: `${location.origin}${location.pathname}#/access/${row.access_token}` };
}

export async function redeemDinnerAccessLink(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_dinner_access_link', { p_token: token }); fail(error);
  const dinnerId = data?.[0]?.dinner_id; if (!dinnerId) throw new Error('30-day access could not be opened.');
  return dinnerId;
}

export async function revokeDinnerAccessLink(accessLinkId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_dinner_access_link', { p_access_link_id: accessLinkId }); fail(error);
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
  const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${guestToken}` }, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || (response.status === 401 ? 'Enter this dinner’s access code.' : 'Unable to load this dinner.'));
    }
    return response.json() as Promise<GuestDinner>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The dinner took too long to load. Please try again.');
    throw error;
  } finally { window.clearTimeout(timeout); }
}
