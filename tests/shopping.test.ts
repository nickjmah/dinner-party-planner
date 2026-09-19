import { describe, expect, it } from 'vitest';
import { buildShoppingItems, ingredientDimension } from '../src/lib/shopping';
import type { Ingredient, Recipe, ShoppingItem } from '../src/types';

const recipe = (id: string, title = 'Recipe', source = 4, target = 4) => ({ id, dinner_id: 'dinner_1', owner_id: 'owner', title, short_title: '', source_url: '', source_host: '', source_type: 'manual', yield_text: '', yield_servings: source, target_servings: target, prep_minutes: null, cook_minutes: null, total_minutes: null, provenance: {}, fetched_at: null, translated_title: '', translated_yield_text: '', translation_language: '', translation_model: '', created_at: '', updated_at: '' } as Recipe);
const ingredient = (id: string, recipeId: string, item: string, quantity: number | null, unit: string, rawText = item) => ({ id, recipe_id: recipeId, dinner_id: 'dinner_1', owner_id: 'owner', position: 1, raw_text: rawText, translated_text: '', quantity, unit, item, notes: '', provenance: {} } as Ingredient);
const build = (recipes: Recipe[], ingredients: Ingredient[], existing: ShoppingItem[] = []) => buildShoppingItems({ dinnerId: 'dinner_1', ownerId: 'owner', guestCount: 4, recipes, ingredients, existing });

describe('shopping measurement dimensions', () => {
  it.each([
    ['cup', 1, 'volume'], ['lb', 1, 'weight'], ['each', 1, 'count'], ['', null, 'unquantified'],
  ])('classifies %s deterministically', (unit, quantity, dimension) => expect(ingredientDimension(unit, quantity)).toBe(dimension));
});

describe('shopping categories', () => {
  it.each([
    ['all purpose flour', 'Pantry'], ['olive oil', 'Oils, sauces & liquids'], ['chicken thighs', 'Meat & seafood'], ['cream cheese', 'Dairy & eggs'], ['plum tomato', 'Produce'],
  ])('places %s in %s', (item, category) => expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', item, 1, 'each')])[0].category).toBe(category));
});

describe('shopping consolidation', () => {
  it('combines compatible volume units', () => {
    const rows = build([recipe('recipe_1'), recipe('recipe_2')], [ingredient('ingredient_1', 'recipe_1', 'olive oil', 1, 'cup'), ingredient('ingredient_2', 'recipe_2', 'olive oil', 2, 'tbsp')]);
    expect(rows).toHaveLength(1); expect(rows[0].quantity).toBeCloseTo(1.125); expect(rows[0].unit).toBe('cup');
  });
  it('combines compatible weight units', () => {
    const row = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'chicken', 1, 'lb'), ingredient('ingredient_2', 'recipe_1', 'chicken', 8, 'oz')])[0];
    expect(row.quantity).toBe(1.5); expect(row.unit).toBe('lb');
  });
  it('scales each source recipe independently', () => expect(build([recipe('recipe_1', 'A', 4, 8), recipe('recipe_2', 'B', 2, 6)], [ingredient('ingredient_1', 'recipe_1', 'egg', 2, 'each'), ingredient('ingredient_2', 'recipe_2', 'egg', 1, 'each')])[0].quantity).toBe(7));
  it('keeps incompatible units on one mixed row', () => {
    const row = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'onion', 2, 'each'), ingredient('ingredient_2', 'recipe_1', 'onion', 8, 'oz')])[0];
    expect(row.quantity).toBeNull(); expect(row.component_requirements.map((part) => part.unit)).toEqual(['each', 'oz']);
  });
  it('keeps raw publisher wording in source metadata', () => expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'salt', null, '', 'Kosher salt, to taste')])[0].raw_sources).toEqual([expect.objectContaining({ rawText: 'Kosher salt, to taste' })]));
  it('clears purchased status when a rebuilt requirement increases', () => {
    const first = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 2, 'each')])[0];
    expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 3, 'each')], [{ ...first, purchased: true }])[0].purchased).toBe(false);
  });
  it('preserves purchased status when the requirement does not increase', () => {
    const first = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 3, 'each')])[0];
    expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 2, 'each')], [{ ...first, purchased: true }])[0].purchased).toBe(true);
  });
  it('preserves row notes during a rebuild', () => {
    const first = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 2, 'each')])[0];
    expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 2, 'each')], [{ ...first, notes: 'Buy free range' }])[0].notes).toBe('Buy free range');
  });
  it('clamps simple manual coverage to the rebuilt requirement', () => {
    const first = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 10, 'each')])[0];
    expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'egg', 3, 'each')], [{ ...first, manual_covered_quantity: 8 }])[0].manual_covered_quantity).toBe(3);
  });
  it('clamps each mixed manual component independently', () => {
    const first = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'onion', 2, 'each'), ingredient('ingredient_2', 'recipe_1', 'onion', 8, 'oz')])[0];
    const row = build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'onion', 2, 'each'), ingredient('ingredient_2', 'recipe_1', 'onion', 8, 'oz')], [{ ...first, manual_covered_components: { 'onion|count': 9, 'onion|weight': 3 } }])[0];
    expect(row.manual_covered_components).toEqual({ 'onion|count': 2, 'onion|weight': 3 });
  });
  it('does not combine distinct tomato varieties', () => expect(build([recipe('recipe_1')], [ingredient('ingredient_1', 'recipe_1', 'cherry tomato', 2, 'each'), ingredient('ingredient_2', 'recipe_1', 'plum tomato', 3, 'each')])).toHaveLength(2));
});
