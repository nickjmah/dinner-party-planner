import { describe, expect, it } from 'vitest';
import { recipeSection, shoppingSections } from '../src/lib/recipe-sections';
import type { Recipe, ShoppingItem } from '../src/types';
const recipe = (id: string, title: string, provenance = {}) => ({ id, title, short_title:'', provenance } as Recipe);
const item = (raw_sources: unknown) => ({ raw_sources } as ShoppingItem);
describe('food and drink sections', () => {
 it('recognizes cocktails, tea, and planned drink sections', () => {
  expect(recipeSection(recipe('a','Moroccan mint tea'))).toBe('drinks');
  expect(recipeSection(recipe('b','Orange-blossom vermouth spritz'))).toBe('drinks');
  expect(recipeSection(recipe('c','House special',{section:'Cocktails'}))).toBe('drinks');
 });
 it('does not mistake food flavored with drinks for a drink', () => {
  for(const title of ['Green tea ice cream','Coffee cake','Orange-blossom ice cream','Tea marinade']) expect(recipeSection(recipe('a',title))).toBe('food');
 });
 it('honors a manual move over title detection', () => {
  expect(recipeSection(recipe('a','Coffee cake',{recipe_section:'drinks'}))).toBe('drinks');
  expect(recipeSection(recipe('a','Mint tea',{recipe_section:'food'}))).toBe('food');
 });
 it('keeps shared shopping ingredients linked to both sections', () => {
  const recipes=[recipe('f','Zaalouk'),recipe('d','Mint tea')];
  expect(shoppingSections(item([{recipeId:'f'},{recipeId:'d'},{recipeId:'d'}]),recipes)).toEqual(['food','drinks']);
  recipes[1].provenance={recipe_section:'food'};
  expect(shoppingSections(item([{recipeId:'f'},{recipeId:'d'}]),recipes)).toEqual(['food']);
 });
 it('retains ingredients with missing or old source metadata', () => {
  expect(shoppingSections(item(null),[])).toEqual(['food']);
  expect(shoppingSections(item([{recipeTitle:'Mint tea'}]),[])).toEqual(['drinks']);
 });
});
