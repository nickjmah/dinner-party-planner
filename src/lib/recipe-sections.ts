import type { Recipe, ShoppingItem } from '../types';

export type RecipeSection = 'food' | 'drinks';
type SectionRecipe = Pick<Recipe, 'title' | 'short_title' | 'provenance'>;

export function recipeSection(recipe: SectionRecipe): RecipeSection {
  const meta = recipe.provenance && typeof recipe.provenance === 'object' && !Array.isArray(recipe.provenance) ? recipe.provenance : {};
  if (meta.recipe_section === 'food' || meta.recipe_section === 'drinks') return meta.recipe_section;
  if (typeof meta.section === 'string' && /\b(drinks?|cocktails?|mocktails?|beverages?|aperitifs?)\b/i.test(meta.section)) return 'drinks';
  const title = recipe.short_title || recipe.title;
  if (/\b(ice cream|cake|cookies?|salad|sauce|marinade|bread|pastry)\b/i.test(title)) return 'food';
  return /\b(cocktails?|mocktails?|spritz|tea|coffee|lemonade|sangria|martini|negroni|mojito|margarita|punch|highball|gin and tonic)\b/i.test(title) ? 'drinks' : 'food';
}

export function shoppingSections(item: ShoppingItem, recipes: Recipe[]): RecipeSection[] {
  const sections = new Set<RecipeSection>();
  for (const raw of Array.isArray(item.raw_sources) ? item.raw_sources : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const recipe = recipes.find((recipe) => recipe.id === raw.recipeId);
    sections.add(recipeSection(recipe || { title: String(raw.recipeTitle || ''), short_title: '', provenance: {} }));
  }
  return sections.size ? [...sections] : ['food'];
}
