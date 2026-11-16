import { assertSourceTrace, parseHtmlRecipe } from '../functions/_shared/recipe-parser.ts';

function check(value: boolean, message: string) { if (!value) throw new Error(message); }

Deno.test('EasyRecipe cards preserve ingredient and instruction lines', () => {
  const recipe = parseHtmlRecipe('<h1>Ice cream</h1><div class="easyrecipe"><ul><li class="ingredient">700 ml milk</li><li class="ingredient">100 g sugar</li></ul><ol><li class="instruction">Warm the milk.</li><li class="instruction">Cool and churn.</li></ol></div>');
  check(recipe.ingredients.length === 2 && recipe.steps.length === 2, 'Incomplete EasyRecipe card');
  assertSourceTrace(recipe);
});

Deno.test('JSON-LD source values remain traceable despite encoded punctuation', () => {
  const node = { '@type': 'Recipe', name: 'Salad', recipeIngredient: ['1 carrot'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Don&#039;t overcook.\nDrain well.' }] };
  const recipe = parseHtmlRecipe(`<script type="application/ld+json">${JSON.stringify(node)}</script>`);
  assertSourceTrace(recipe);
  let rejected = false;
  try { assertSourceTrace({ ...recipe, ingredients: ['99 g invented ingredient'] }); } catch { rejected = true; }
  check(rejected, 'Invented ingredients must still be rejected');
});

Deno.test('Plain article recipe stops before promotional paragraphs', () => {
  const recipe = parseHtmlRecipe('<h1>Bread</h1><div class="entry-content"><p>Story about bread.</p><p>2 cups flour<br>1 tsp salt</p><p>Mix the dough.<br>Bake until golden.</p><p>Total cooking time: 1 hour</p><p>Buy our cookbook.</p></div>');
  check(recipe.ingredients.length === 2 && recipe.steps.length === 2, 'Article boundaries were not respected');
  check(!recipe.steps.some((step) => step.text.includes('cookbook')), 'Promotion included as a step');
  assertSourceTrace(recipe);
});

Deno.test('Multiple article components cannot become an incomplete recipe', () => {
  let rejected = false;
  try { parseHtmlRecipe('<div class="entry-content"><p>2 cups flour<br>1 tsp salt</p><ol><li>Mix.</li><li>Rest.</li></ol><p>3 eggs<br>2 cups milk</p></div>'); } catch { rejected = true; }
  check(rejected, 'Multiple components need explicit selection, not the first ingredient list');
});
