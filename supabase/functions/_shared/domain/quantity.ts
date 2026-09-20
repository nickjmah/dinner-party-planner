import type { Ingredient, QuantityComponent, Recipe, ShoppingItem } from './types.ts';

const FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

const UNIT_ALIASES: Record<string, string> = {
  tablespoons: 'tbsp', tablespoon: 'tbsp', tbsp: 'tbsp',
  teaspoons: 'tsp', teaspoon: 'tsp', tsp: 'tsp',
  cups: 'cup', cup: 'cup',
  pounds: 'lb', pound: 'lb', lbs: 'lb', lb: 'lb',
  ounces: 'oz', ounce: 'oz', oz: 'oz',
  grams: 'g', gram: 'g', g: 'g', kilograms: 'kg', kilogram: 'kg', kg: 'kg',
  milliliters: 'ml', milliliter: 'ml', ml: 'ml', liters: 'l', liter: 'l', l: 'l',
  cloves: 'each', clove: 'each', eggs: 'each', egg: 'each',
};

const PREP_PHRASES = /\b(?:finely|thinly|roughly)?\s*(?:chopped|diced|sliced|minced|peeled|seeded|halved|quartered|grated|crushed|melted|softened|divided|for serving|for garnish|to taste)\b.*$/i;

export interface ParsedIngredient {
  quantity: number | null;
  unit: string;
  item: string;
  notes: string;
}

export function parseNumber(value: string): number | null {
  const clean = value.trim().replace(',', '.');
  const unicode = Object.entries(FRACTIONS).find(([symbol]) => clean.includes(symbol));
  if (unicode) {
    const whole = Number(clean.replace(unicode[0], '').trim() || 0);
    return whole + unicode[1];
  }
  if (/^\d+\s+\d+\/\d+$/.test(clean)) {
    const [whole, fraction] = clean.split(/\s+/);
    const [top, bottom] = fraction.split('/').map(Number);
    return Number(whole) + top / bottom;
  }
  if (/^\d+\/\d+$/.test(clean)) {
    const [top, bottom] = clean.split('/').map(Number);
    return top / bottom;
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseYieldServings(value: string): number | null {
  const text = value.toLowerCase().replace(/,/g, '.');
  const number = '(\\d+(?:\\.\\d+)?)'; const range = `(?:\\s*(?:-|–|to|a)\\s*${number})?`;
  const label = '(?:serves?|servings?|makes?|yield|porciones?|raciones?|doses?|portions?)';
  const after = text.match(new RegExp(`${label}\\s*:?\\s*${number}${range}`, 'i'));
  const before = text.match(new RegExp(`${number}${range}\\s*${label}`, 'i'));
  const match = after || before || text.match(new RegExp(`${number}${range}`, 'i'));
  if (!match) return null;
  const values = match.slice(1).filter(Boolean).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function parseIngredient(rawText: string): ParsedIngredient {
  const source = rawText.trim().replace(/\s+/g, ' ');
  const amountMatch = source.match(/^(\d*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)(?:\s*(?:-|–|to)\s*(\d*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:[.,]\d+)?|\d+\/\d+))?/i);
  const quantity = amountMatch ? parseNumber(amountMatch[2] || amountMatch[1]) : null;
  let rest = amountMatch ? source.slice(amountMatch[0].length).trim() : source;
  rest = rest.replace(/^\s*[×x]\s*/, '');
  const unitMatch = rest.match(/^([a-zA-Z]+)\b/);
  const possibleUnit = unitMatch?.[1].toLowerCase() ?? '';
  const unit = UNIT_ALIASES[possibleUnit] ?? '';
  if (unit) rest = rest.slice(unitMatch?.[0].length ?? 0).trim();
  const [beforeNotes, ...notes] = rest.split(/,(.+)/).filter(Boolean);
  return {
    quantity,
    unit: unit || (quantity != null ? 'each' : ''),
    item: canonicalIngredient(beforeNotes.replace(/\([^)]*\)/g, '').replace(PREP_PHRASES, '').trim()),
    notes: notes.join(', ').trim(),
  };
}

export function canonicalIngredient(input: string): string {
  let value = input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  value = value
    .replace(/extra[- ]virgin/g, 'extra virgin')
    .replace(/\balli?oli\b|\bcupaioli\b/g, 'aioli')
    .replace(/vegetable of other neutral oil/g, 'neutral oil')
    .replace(/\bunsalted butter\s+or\s+nonstick spray(?:\s+for\s+greasing\s+(?:the\s+)?pan)?\b/g, 'unsalted butter')
    .replace(/pimenton picante/g, 'hot smoked spanish paprika')
    .replace(/\b(coarse sea|kosher|sea|fine sea) salt\b/g, 'salt')
    .replace(/\bripe plum tomatoes?\b|\bplum tomatoes?\b/g, 'plum tomato')
    .replace(/\bcloves? garlic\b/g, 'garlic')
    .replace(/\beggs\b/g, 'egg')
    .replace(/\bonions\b/g, 'onion')
    .replace(/\btomatoes\b/g, 'tomato')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value;
}

export function recipeScale(recipe: Pick<Recipe, 'yield_servings' | 'target_servings'>, fallbackGuests: number): number {
  const source = recipe.yield_servings || 0;
  const target = recipe.target_servings || fallbackGuests;
  return source > 0 ? target / source : 1;
}

export function scaledIngredient(ingredient: Ingredient, recipe: Recipe, fallbackGuests: number): Ingredient {
  const scale = recipeScale(recipe, fallbackGuests);
  return { ...ingredient, quantity: ingredient.quantity == null ? null : ingredient.quantity * scale };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function remainingComponents(item: ShoppingItem): QuantityComponent[] {
  return item.component_requirements.map((component) => {
    const taskCovered = item.covered_components[component.key] || 0;
    const manualCovered = item.manual_covered_components[component.key] || 0;
    return { ...component, quantity: clamp(component.quantity - taskCovered - manualCovered, 0, component.quantity) };
  });
}

export function remainingQuantity(item: ShoppingItem): number | null {
  if (item.component_requirements.length) return null;
  if (item.quantity == null) return null;
  return clamp(item.quantity - item.covered_quantity - item.manual_covered_quantity, 0, item.quantity);
}

export function formatQuantity(value: number | null): string {
  if (value == null) return 'As needed';
  if (Number.isInteger(value)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

type ShoppingQuantityView = Pick<ShoppingItem, 'quantity' | 'unit' | 'component_requirements' | 'unquantified_required'> & Partial<Pick<ShoppingItem, 'covered_quantity' | 'manual_covered_quantity' | 'covered_components' | 'manual_covered_components'>>;

export function shoppingQuantityLabels(item: ShoppingQuantityView): string[] {
  const requirements = Array.isArray(item.component_requirements) ? item.component_requirements : [];
  const labels = requirements.length
    ? requirements.map((component) => {
      const remaining = clamp(component.quantity - Number(item.covered_components?.[component.key] || 0) - Number(item.manual_covered_components?.[component.key] || 0), 0, component.quantity);
      return `${formatQuantity(remaining)} ${component.unit}`.trim();
    })
    : item.quantity == null ? [] : [`${formatQuantity(clamp(item.quantity - Number(item.covered_quantity || 0) - Number(item.manual_covered_quantity || 0), 0, item.quantity))} ${item.unit}`.trim()];
  if (item.unquantified_required || !labels.length) labels.push('As needed');
  return labels;
}
