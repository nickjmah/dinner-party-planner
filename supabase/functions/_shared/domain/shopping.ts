import type { Ingredient, QuantityComponent, Recipe, ShoppingItem, TimelineTask } from './types.ts';
import { canonicalIngredient, clamp, recipeScale } from './quantity.ts';

type Dimension = 'volume' | 'weight' | 'count' | 'unquantified';
interface SourcePart { ingredientId: string; recipeId: string; recipeTitle: string; rawText: string; quantity: number | null; unit: string; dimension: Dimension; baseQuantity: number; }
interface ShoppingBuildInput { dinnerId: string; ownerId: string; guestCount: number; recipes: Recipe[]; ingredients: Ingredient[]; existing: ShoppingItem[]; tasks?: TimelineTask[]; }

const UNITS: Record<string, { dimension: Dimension; factor: number }> = {
  tsp: { dimension: 'volume', factor: 1 }, tbsp: { dimension: 'volume', factor: 3 }, cup: { dimension: 'volume', factor: 48 }, ml: { dimension: 'volume', factor: 0.202884 }, l: { dimension: 'volume', factor: 202.884 },
  oz: { dimension: 'weight', factor: 1 }, lb: { dimension: 'weight', factor: 16 }, g: { dimension: 'weight', factor: 0.035274 }, kg: { dimension: 'weight', factor: 35.274 },
  each: { dimension: 'count', factor: 1 },
};

export function ingredientDimension(unit: string, quantity: number | null): Dimension {
  if (quantity == null) return 'unquantified';
  return UNITS[unit]?.dimension || 'count';
}

function displayComponent(item: string, dimension: Dimension, base: number, sourceUnits: string[]): QuantityComponent {
  if (dimension === 'volume') {
    if (sourceUnits.includes('cup') || base >= 24) return { key: `${item}|volume`, quantity: base / 48, unit: 'cup', dimension };
    if (sourceUnits.includes('tbsp') || base >= 3) return { key: `${item}|volume`, quantity: base / 3, unit: 'tbsp', dimension };
    return { key: `${item}|volume`, quantity: base, unit: 'tsp', dimension };
  }
  if (dimension === 'weight') {
    if (sourceUnits.includes('lb') || base >= 16) return { key: `${item}|weight`, quantity: base / 16, unit: 'lb', dimension };
    if (sourceUnits.includes('kg')) return { key: `${item}|weight`, quantity: base / 35.274, unit: 'kg', dimension };
    if (sourceUnits.includes('g') && !sourceUnits.includes('oz')) return { key: `${item}|weight`, quantity: base / 0.035274, unit: 'g', dimension };
    return { key: `${item}|weight`, quantity: base, unit: 'oz', dimension };
  }
  return { key: `${item}|count`, quantity: base, unit: 'each', dimension: 'count' };
}

function categoryFor(item: string): string {
  if (/salt|pepper|paprika|cumin|oregano|spice|sugar|flour|rice|pasta/.test(item)) return 'Pantry';
  if (/oil|vinegar|soy sauce|wine|stock|broth/.test(item)) return 'Oils, sauces & liquids';
  if (/chicken|beef|pork|ham|fish|shrimp|lamb/.test(item)) return 'Meat & seafood';
  if (/milk|cream|cheese|butter|egg|yogurt/.test(item)) return 'Dairy & eggs';
  if (/tomato|onion|garlic|pepper|carrot|lemon|lime|herb|parsley|cilantro|potato/.test(item)) return 'Produce';
  return 'Other';
}

function requirementsIncreased(previous: ShoppingItem | undefined, simple: number | null, requirements: QuantityComponent[]): boolean {
  if (!previous) return false;
  const priorMixed = Array.isArray(previous.component_requirements) && previous.component_requirements.length > 0;
  const nextMixed = requirements.length > 0;
  if (priorMixed !== nextMixed) return true;
  if (!nextMixed) {
    if (simple == null || previous.quantity == null) return simple !== previous.quantity;
    return simple > previous.quantity + 1e-9;
  }
  const prior = new Map(previous.component_requirements.map((part) => [part.key, Number(part.quantity)]));
  return requirements.some((part) => !prior.has(part.key) || part.quantity > (prior.get(part.key) || 0) + 1e-9);
}

export function buildShoppingItems(input: ShoppingBuildInput): ShoppingItem[] {
  const recipeById = new Map(input.recipes.map((recipe) => [recipe.id, recipe]));
  const grouped = new Map<string, SourcePart[]>();
  input.ingredients.forEach((ingredient) => {
    const recipe = recipeById.get(ingredient.recipe_id); if (!recipe) return;
    const item = canonicalIngredient(ingredient.item || ingredient.translated_text || ingredient.raw_text); if (!item) return;
    const dimension = ingredientDimension(ingredient.unit, ingredient.quantity);
    const factor = UNITS[ingredient.unit]?.factor || 1;
    const quantity = ingredient.quantity == null ? null : ingredient.quantity * recipeScale(recipe, input.guestCount);
    const part = { ingredientId: ingredient.id, recipeId: recipe.id, recipeTitle: recipe.short_title || recipe.translated_title || recipe.title, rawText: ingredient.raw_text, quantity, unit: ingredient.unit, dimension, baseQuantity: quantity == null ? 0 : quantity * factor };
    (grouped.get(item) || grouped.set(item, []).get(item)!).push(part);
  });
  const existingByItem = new Map(input.existing.map((row) => [canonicalIngredient(row.item), row]));
  const rows = [...grouped.entries()].map(([item, sources]) => {
    const quantified = [...new Set(sources.filter((source) => source.dimension !== 'unquantified').map((source) => source.dimension))];
    const components = quantified.map((dimension) => displayComponent(item, dimension, sources.filter((source) => source.dimension === dimension).reduce((sum, source) => sum + source.baseQuantity, 0), sources.filter((source) => source.dimension === dimension).map((source) => source.unit)));
    const mixed = components.length > 1;
    const key = `${item}|${mixed ? 'mixed' : components[0]?.dimension || 'unquantified'}`;
    const previous = existingByItem.get(item);
    const requirements = mixed ? components : [];
    const coveredComponents = Object.fromEntries(requirements.map((part) => [part.key, 0]));
    const manualComponents = Object.fromEntries(requirements.map((part) => [part.key, clamp(Number(previous?.manual_covered_components?.[part.key] || 0), 0, part.quantity)]));
    const simple = mixed ? null : components[0]?.quantity ?? null;
    return {
      id: previous?.id || `shop_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`, dinner_id: input.dinnerId, owner_id: input.ownerId, key, item,
      quantity: simple, unit: mixed ? components.map((part) => `${part.quantity} ${part.unit}`).join(' + ') : components[0]?.unit || '',
      raw_sources: sources.map((source) => ({ ingredientId: source.ingredientId, recipeId: source.recipeId, recipeTitle: source.recipeTitle, rawText: source.rawText, scaledQuantity: source.quantity, unit: source.unit })),
      category: previous?.category || categoryFor(item), purchased: Boolean(previous?.purchased) && !requirementsIncreased(previous, simple, requirements), assignee: previous?.assignee || '', notes: previous?.notes || '',
      covered_quantity: mixed ? 0 : input.tasks ? 0 : clamp(Number(previous?.covered_quantity || 0), 0, simple || 0),
      manual_covered_quantity: mixed ? 0 : clamp(Number(previous?.manual_covered_quantity || 0), 0, simple || 0),
      component_requirements: requirements, covered_components: coveredComponents, manual_covered_components: manualComponents,
      updated_at: new Date().toISOString(),
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));
  return input.tasks ? applyTaskCoverage(rows, input.tasks) : rows;
}

export function applyTaskCoverage(items: ShoppingItem[], tasks: TimelineTask[]): ShoppingItem[] {
  const selected = tasks.flatMap((task) => Array.isArray(task.ingredient_progress) ? task.ingredient_progress : []).map((value) => String(value).split(':')[0]);
  const occurrences = selected.reduce<Record<string, number>>((counts, id) => { counts[id] = (counts[id] || 0) + 1; return counts; }, {});
  return items.map((item) => {
    let simpleCovered = 0; const componentCovered: Record<string, number> = Object.fromEntries(item.component_requirements.map((part) => [part.key, 0]));
    for (const raw of Array.isArray(item.raw_sources) ? item.raw_sources : []) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const source = raw as Record<string, unknown>; const count = occurrences[String(source.ingredientId || '')] || 0; if (!count) continue;
      const quantity = Number(source.scaledQuantity); const unit = String(source.unit || ''); if (!Number.isFinite(quantity)) continue;
      if (!item.component_requirements.length) simpleCovered += quantity * count;
      else {
        const dimension = ingredientDimension(unit, quantity); const component = item.component_requirements.find((part) => part.dimension === dimension || part.key.endsWith(`|${dimension}`)); if (!component) continue;
        const sourceBase = quantity * (UNITS[unit]?.factor || 1); const targetFactor = UNITS[component.unit]?.factor || 1;
        componentCovered[component.key] = (componentCovered[component.key] || 0) + sourceBase / targetFactor * count;
      }
    }
    return { ...item, covered_quantity: item.component_requirements.length ? 0 : clamp(simpleCovered, 0, item.quantity || 0), covered_components: Object.fromEntries(item.component_requirements.map((part) => [part.key, clamp(componentCovered[part.key] || 0, 0, part.quantity)])) };
  });
}
