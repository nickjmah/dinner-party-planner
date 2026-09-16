import { parseIngredient } from '../_shared/domain/quantity.ts';
import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { assertSourceTrace, parseHtmlRecipe, parseMarkdownRecipe, parsePdfRecipe, type ParsedRecipe } from '../_shared/recipe-parser.ts';
import { assertOwnsDinner, authenticatedOwner } from '../_shared/supabase.ts';
import { translateRecipe } from '../_shared/translate.ts';
import { rebuildShopping } from '../_shared/rebuild-shopping.ts';

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const isPrivateIpv4 = (host: string) => /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);

async function assertPublicUrl(input: string): Promise<URL> {
  let url: URL; try { url = new URL(input); } catch { throw new Error('Enter a valid public recipe URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP or HTTPS recipe links are supported.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || isPrivateIpv4(host)) throw new Error('Private network recipe URLs are not allowed.');
  try {
    const addresses = await Deno.resolveDns(host, 'A');
    if (!addresses.length || addresses.some(isPrivateIpv4)) throw new Error('Private network recipe URLs are not allowed.');
  } catch (error) { if (/Private network/.test(String(error))) throw error; }
  return url;
}

async function fetchWithSafeRedirects(initial: URL): Promise<Response> {
  let url = initial;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'DinnerPartyPlanner/2.0 (+source-grounded recipe import)', Accept: 'text/html,application/pdf,text/plain' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location'); if (!location) throw new Error('Recipe source returned an invalid redirect.');
    url = await assertPublicUrl(new URL(location, url).href);
  }
  throw new Error('Recipe source redirected too many times.');
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchedRecipe(url: URL): Promise<{ recipe: ParsedRecipe; bytes: Uint8Array; finalUrl: string; contentType: string }> {
  let response = await fetchWithSafeRedirects(url);
  if ([401, 402, 403].includes(response.status)) {
    const jinaUrl = new URL(`https://r.jina.ai/${url.href}`);
    const headers: HeadersInit = { Accept: 'text/plain' }; const jinaKey = Deno.env.get('JINA_API_KEY'); if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
    response = await fetch(jinaUrl, { headers });
    if (!response.ok) throw new Error(`The publisher blocked access (${response.status}) and the source-preserving reader fallback also failed.`);
    const markdown = await response.text();
    return { recipe: parseMarkdownRecipe(markdown, url.hostname), bytes: new TextEncoder().encode(markdown), finalUrl: url.href, contentType: 'text/markdown' };
  }
  if (!response.ok) throw new Error(`The recipe source returned HTTP ${response.status}.`);
  const length = Number(response.headers.get('content-length') || 0); if (length > 15_000_000) throw new Error('Recipe source exceeds the 15 MB import limit.');
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > 15_000_000) throw new Error('Recipe source exceeds the 15 MB import limit.');
  const contentType = response.headers.get('content-type') || '';
  const recipe = /pdf/i.test(contentType) || url.pathname.toLowerCase().endsWith('.pdf') ? await parsePdfRecipe(bytes, url.hostname) : parseHtmlRecipe(new TextDecoder().decode(bytes), url.hostname);
  return { recipe, bytes, finalUrl: response.url || url.href, contentType };
}

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  let rollback: (() => Promise<void>) | null = null;
  try {
    const { user, client, service } = await authenticatedOwner(request);
    const body = await request.json(); const dinnerId = String(body.dinnerId || '');
    await assertOwnsDinner(client, dinnerId);
    let source: { recipe: ParsedRecipe; bytes: Uint8Array; finalUrl: string; contentType: string };
    let storagePath = '';
    if (body.storagePath) {
      storagePath = String(body.storagePath); if (!storagePath.startsWith(`${user.id}/`)) throw new Error('The uploaded PDF does not belong to this account.');
      const { data, error } = await service.storage.from('recipe-pdfs').download(storagePath); if (error || !data) throw new Error('Uploaded PDF not found.');
      const bytes = new Uint8Array(await data.arrayBuffer()); if (bytes.length > 15_000_000) throw new Error('PDF exceeds the 15 MB import limit.');
      source = { recipe: await parsePdfRecipe(bytes), bytes, finalUrl: `storage://${storagePath}`, contentType: 'application/pdf' };
    } else {
      source = await fetchedRecipe(await assertPublicUrl(String(body.url || '')));
    }
    assertSourceTrace(source.recipe);
    const translation = await translateRecipe(source.recipe);
    const recipeId = newId('recipe');
    const servings = Number(source.recipe.yieldText.match(/\d+(?:\.\d+)?/g)?.at(-1) || 0) || null;
    const sourceUrl = storagePath ? '' : String(body.url || source.finalUrl);
    const recipeRow = { id: recipeId, dinner_id: dinnerId, owner_id: user.id, title: source.recipe.title, short_title: '', source_url: sourceUrl, source_host: sourceUrl ? new URL(sourceUrl).hostname : 'Uploaded PDF', source_type: source.recipe.sourceType, yield_text: source.recipe.yieldText, yield_servings: servings, target_servings: null, prep_minutes: source.recipe.prepMinutes, cook_minutes: source.recipe.cookMinutes, total_minutes: source.recipe.totalMinutes, provenance: { rule: 'source-traced', fetch: storagePath ? 'private-storage' : 'server', parser: source.recipe.sourceType }, fetched_at: new Date().toISOString(), translated_title: translation?.title || '', translated_yield_text: translation?.yieldText || '', translation_language: translation?.sourceLanguage || '', translation_model: translation ? 'mymemory-free' : '' };
    const { error: recipeError } = await client.from('recipes').insert(recipeRow); if (recipeError) throw recipeError;
    rollback = async () => { await service.from('recipes').delete().eq('id', recipeId).eq('owner_id', user.id); };
    const ingredientRows = source.recipe.ingredients.map((rawText, position) => { const translatedText = translation?.ingredients[position]?.text || ''; const parsed = parseIngredient(translatedText || rawText); return { id: newId('ingredient'), recipe_id: recipeId, dinner_id: dinnerId, owner_id: user.id, position: position + 1, raw_text: rawText, translated_text: translatedText, quantity: parsed.quantity, unit: parsed.unit, item: parsed.item, notes: parsed.notes, provenance: { sourceIndex: position, trace: 'exact-source-line' } }; });
    const stepRows = source.recipe.steps.map((step, position) => ({ id: newId('step'), recipe_id: recipeId, dinner_id: dinnerId, owner_id: user.id, position: position + 1, section: step.section, raw_text: step.text, translated_section: translation?.steps[position]?.section || '', translated_text: translation?.steps[position]?.text || '', provenance: { sourceIndex: position, trace: 'exact-source-line' } }));
    const { error: ingredientsError } = await client.from('ingredients').insert(ingredientRows); if (ingredientsError) throw ingredientsError;
    const { error: stepsError } = await client.from('steps').insert(stepRows); if (stepsError) throw stepsError;
    const { error: snapshotError } = await client.from('recipe_source_snapshots').insert({ recipe_id: recipeId, legacy_recipe_id: recipeId, dinner_id: dinnerId, owner_id: user.id, source_url: sourceUrl, source_type: source.recipe.sourceType, fetched_at: new Date().toISOString(), content_sha256: await sha256(source.bytes), source_content: storagePath ? null : new TextDecoder().decode(source.bytes), storage_path: storagePath || null, metadata: { finalUrl: source.finalUrl, contentType: source.contentType, bytes: source.bytes.length } }); if (snapshotError) throw snapshotError;
    const shoppingItems = await rebuildShopping(client, dinnerId, user.id);
    rollback = null;
    return json({ recipeId, title: translation?.title || source.recipe.title, ingredients: ingredientRows.length, steps: stepRows.length, shoppingItems, translated: Boolean(translation), sourceType: source.recipe.sourceType });
  } catch (error) {
    if (rollback) { try { await rollback(); } catch { /* best effort rollback */ } }
    return errorResponse(error);
  }
});
