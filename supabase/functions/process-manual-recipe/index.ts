import { parseIngredient } from '../_shared/domain/quantity.ts';
import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import type { ParsedRecipe } from '../_shared/recipe-parser.ts';
import { assertOwnsDinner, authenticatedOwner } from '../_shared/supabase.ts';
import { translateRecipe } from '../_shared/translate.ts';
import { rebuildShopping } from '../_shared/rebuild-shopping.ts';

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const lines = (value: unknown) => String(value || '').split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    const { user, client } = await authenticatedOwner(request); const body = await request.json(); const dinnerId = String(body.dinnerId || '');
    await assertOwnsDinner(client, dinnerId);
    const ingredients = lines(body.ingredients); const stepLines = lines(body.steps);
    if (!String(body.title || '').trim() || !ingredients.length || !stepLines.length) throw new Error('Manual recipes need a title, ingredients, and instructions.');
    const recipe: ParsedRecipe = { title: String(body.title).trim(), yieldText: String(body.yieldText || '').trim(), prepMinutes: Number(body.prepMinutes) || null, cookMinutes: Number(body.cookMinutes) || null, totalMinutes: Number(body.totalMinutes) || null, ingredients, steps: stepLines.map((text) => ({ section: '', text })), sourceType: 'manual', traceCorpus: [body.title, body.yieldText, ...ingredients, ...stepLines].join('\n') };
    const translation = await translateRecipe(recipe); const existingId = String(body.recipeId || ''); const recipeId = existingId || newId('recipe');
    const servings = Number(recipe.yieldText.match(/\d+(?:\.\d+)?/g)?.at(-1) || 0) || null;
    if (existingId) {
      const { data: existing, error } = await client.from('recipes').select('target_servings,short_title').eq('id', existingId).eq('dinner_id', dinnerId).eq('source_type', 'manual').single();
      if (error || !existing) throw new Error('Only manual recipes can be edited here.');
      const { error: updateError } = await client.from('recipes').update({ title: recipe.title, yield_text: recipe.yieldText, yield_servings: servings, prep_minutes: recipe.prepMinutes, cook_minutes: recipe.cookMinutes, total_minutes: recipe.totalMinutes, translated_title: translation?.title || '', translated_yield_text: translation?.yieldText || '', translation_language: translation?.sourceLanguage || '', translation_model: translation ? (Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini') : '', provenance: { rule: 'user-entered-source', editedAt: new Date().toISOString() } }).eq('id', recipeId);
      if (updateError) throw updateError;
      await client.from('ingredients').delete().eq('recipe_id', recipeId); await client.from('steps').delete().eq('recipe_id', recipeId);
    } else {
      const { error } = await client.from('recipes').insert({ id: recipeId, dinner_id: dinnerId, owner_id: user.id, title: recipe.title, source_type: 'manual', yield_text: recipe.yieldText, yield_servings: servings, prep_minutes: recipe.prepMinutes, cook_minutes: recipe.cookMinutes, total_minutes: recipe.totalMinutes, provenance: { rule: 'user-entered-source' }, translated_title: translation?.title || '', translated_yield_text: translation?.yieldText || '', translation_language: translation?.sourceLanguage || '', translation_model: translation ? (Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini') : '' }); if (error) throw error;
    }
    const ingredientRows = ingredients.map((rawText, position) => { const translatedText = translation?.ingredients[position]?.text || ''; const parsed = parseIngredient(translatedText || rawText); return { id: newId('ingredient'), recipe_id: recipeId, dinner_id: dinnerId, owner_id: user.id, position: position + 1, raw_text: rawText, translated_text: translatedText, quantity: parsed.quantity, unit: parsed.unit, item: parsed.item, notes: parsed.notes, provenance: { sourceIndex: position, trace: 'user-entered-line' } }; });
    const stepRows = stepLines.map((rawText, position) => ({ id: newId('step'), recipe_id: recipeId, dinner_id: dinnerId, owner_id: user.id, position: position + 1, section: '', raw_text: rawText, translated_section: translation?.steps[position]?.section || '', translated_text: translation?.steps[position]?.text || '', provenance: { sourceIndex: position, trace: 'user-entered-line' } }));
    const { error: ingredientError } = await client.from('ingredients').insert(ingredientRows); if (ingredientError) throw ingredientError;
    const { error: stepError } = await client.from('steps').insert(stepRows); if (stepError) throw stepError;
    const shoppingItems = await rebuildShopping(client, dinnerId, user.id);
    return json({ recipeId, edited: Boolean(existingId), translated: Boolean(translation), shoppingItems });
  } catch (error) { return errorResponse(error); }
});
