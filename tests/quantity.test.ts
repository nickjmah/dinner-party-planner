import { describe, expect, it } from 'vitest';
import { canonicalIngredient, clamp, formatQuantity, parseIngredient, parseNumber, parseYieldServings, recipeScale, remainingComponents, remainingQuantity, shoppingQuantityLabels } from '../src/lib/quantity';
import type { Recipe, ShoppingItem } from '../src/types';

describe('source ingredient parsing', () => {
  it('parses mixed fractions', () => expect(parseIngredient('1 1/2 lb chicken thighs, sliced')).toMatchObject({ quantity: 1.5, unit: 'lb', item: 'chicken thighs' }));
  it('parses unicode fractions', () => expect(parseIngredient('2½ cups jasmine rice')).toMatchObject({ quantity: 2.5, unit: 'cup', item: 'jasmine rice' }));
  it('uses the upper end of a range', () => expect(parseIngredient('2-3 onions, sliced')).toMatchObject({ quantity: 3, unit: 'each', item: 'onion' }));
  it('keeps boneless chicken descriptive words', () => expect(parseIngredient('1 lb boneless skinless chicken thighs, at room temperature').item).toBe('boneless skinless chicken thighs'));
  it('does not mutate the caller’s source string', () => { const raw = '2 eggs, beaten'; parseIngredient(raw); expect(raw).toBe('2 eggs, beaten'); });
  it('parses standalone fractions', () => expect(parseNumber('3/4')).toBe(.75));
  it('parses decimal-comma quantities', () => expect(parseIngredient('1,5 kg queso crema')).toMatchObject({ quantity: 1.5, unit: 'kg', item: 'queso crema' }));
  it('uses the stated yield rather than a later parenthetical number', () => expect(parseYieldServings('Makes 12 cookies (3 per person)')).toBe(12));
  it('uses the upper end of a serving range', () => expect(parseYieldServings('6–8 servings')).toBe(8));
});

describe('deterministic canonical ingredients', () => {
  it.each([
    ['allioli', 'aioli'], ['cupaioli', 'aioli'], ['pimentón picante', 'hot smoked spanish paprika'],
    ['vegetable of other neutral oil', 'neutral oil'], ['Kosher salt', 'salt'], ['Coarse sea salt', 'salt'],
    ['ripe plum tomatoes', 'plum tomato'], ['plum tomatoes', 'plum tomato'], ['eggs', 'egg'], ['onions', 'onion'],
    ['Unsalted butter or nonstick spray for greasing the pan', 'unsalted butter'],
  ])('normalizes %s to %s', (input, output) => expect(canonicalIngredient(input)).toBe(output));
  it('keeps distinct tomato varieties distinct', () => expect(canonicalIngredient('cherry tomatoes')).not.toBe(canonicalIngredient('plum tomatoes')));
});

describe('scaling and progress', () => {
  const recipe = { yield_servings: 4, target_servings: 10 } as Recipe;
  it('scales from recipe yield to planned servings', () => expect(recipeScale(recipe, 15)).toBe(2.5));
  it('uses dinner guest count when target is blank', () => expect(recipeScale({ ...recipe, target_servings: null }, 12)).toBe(3));
  it('does not scale without a known source yield', () => expect(recipeScale({ ...recipe, yield_servings: null }, 12)).toBe(1));
  it('formats numbers compactly', () => expect(formatQuantity(2.3333)).toBe('2.33'));
  it('clamps progress without changing requirements', () => expect(clamp(12, 0, 10)).toBe(10));
  it('tracks mixed-unit components independently', () => {
    const item = { component_requirements: [{ key: 'onion|each', quantity: 2, unit: 'each' }, { key: 'onion|oz', quantity: 8, unit: 'oz' }], covered_components: { 'onion|each': 1, 'onion|oz': 2 }, manual_covered_components: { 'onion|each': 0, 'onion|oz': 3 } } as unknown as ShoppingItem;
    expect(remainingComponents(item)).toEqual([{ key: 'onion|each', quantity: 1, unit: 'each' }, { key: 'onion|oz', quantity: 3, unit: 'oz' }]);
  });
  it('subtracts task and manual coverage from simple quantities', () => expect(remainingQuantity({ quantity: 10, covered_quantity: 3, manual_covered_quantity: 2, component_requirements: [] } as unknown as ShoppingItem)).toBe(5));
  it('never lets remaining quantities go negative', () => expect(remainingQuantity({ quantity: 4, covered_quantity: 9, manual_covered_quantity: 2, component_requirements: [] } as unknown as ShoppingItem)).toBe(0));
  it('formats a measured requirement plus an as-needed requirement', () => expect(shoppingQuantityLabels({ quantity: 5, unit: 'tbsp', component_requirements: [], unquantified_required: true })).toEqual(['5 tbsp', 'As needed']));
});
