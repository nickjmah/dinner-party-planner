import { buildShoppingItems } from './domain/shopping.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

export async function rebuildShopping(client: SupabaseClient, dinnerId: string, ownerId: string): Promise<number> {
  const [dinner, recipes, ingredients, existing, tasks] = await Promise.all([
    client.from('dinners').select('guest_count').eq('id', dinnerId).single(), client.from('recipes').select('*').eq('dinner_id', dinnerId),
    client.from('ingredients').select('*').eq('dinner_id', dinnerId), client.from('shopping_items').select('*').eq('dinner_id', dinnerId), client.from('tasks').select('*').eq('dinner_id', dinnerId),
  ]);
  const error = [dinner, recipes, ingredients, existing, tasks].find((result) => result.error)?.error; if (error) throw error;
  const rows = buildShoppingItems({ dinnerId, ownerId, guestCount: dinner.data.guest_count, recipes: recipes.data || [], ingredients: ingredients.data || [], existing: existing.data || [], tasks: tasks.data || [] });
  const keep = new Set(rows.map((row) => row.id));
  for (const old of existing.data || []) if (!keep.has(old.id)) { const { error: deleteError } = await client.from('shopping_items').delete().eq('id', old.id); if (deleteError) throw deleteError; }
  if (rows.length) { const { error: upsertError } = await client.from('shopping_items').upsert(rows); if (upsertError) throw upsertError; }
  return rows.length;
}
