const NON_ENGLISH_SIGNALS = new Set([
  // Spanish
  'ingrediente', 'ingredientes', 'preparacion', 'porcion', 'porciones', 'racion', 'raciones',
  'tarta', 'queso', 'crema', 'aceite', 'huevo', 'huevos', 'azucar', 'harina', 'sal', 'pimienta',
  'cucharada', 'cucharadas', 'cucharadita', 'cucharaditas', 'batir', 'mezclar', 'hornear', 'hornea',
  'cocer', 'cocinar', 'anadir', 'agregar', 'verter', 'molde', 'hasta', 'durante', 'minutos', 'gramos',
  'caliente', 'frio', 'refrigerar', 'servir',
  // French, Italian, and Portuguese recipe vocabulary
  'ingredients', 'preparation', 'cuillere', 'melanger', 'ajouter', 'cuire', 'four',
  'ingredienti', 'preparazione', 'cucchiaio', 'mescolare', 'aggiungere', 'cuocere',
  'ingredientes', 'preparo', 'colher', 'misturar', 'adicionar', 'assar',
]);

function words(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) || [];
}

export interface TranslationCandidate {
  title: string;
  yieldText: string;
  ingredients: string[];
  steps: Array<{ text: string }>;
}

export function likelyNonEnglish(recipe: TranslationCandidate): boolean {
  const text = [recipe.title, recipe.yieldText, ...recipe.ingredients, ...recipe.steps.map((step) => step.text)].join(' ');
  if (/[¿¡]|[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return true;
  const signals = new Set(words(text).filter((word) => NON_ENGLISH_SIGNALS.has(word)));
  return signals.size >= 2;
}

const FRACTION_VALUES: Record<string, string> = {
  '¼': '0.25', '½': '0.5', '¾': '0.75', '⅓': '0.333333', '⅔': '0.666667',
  '⅛': '0.125', '⅜': '0.375', '⅝': '0.625', '⅞': '0.875',
};

export function sourceNumbers(value: string): string {
  return (value.match(/\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]/g) || [])
    .map((token) => FRACTION_VALUES[token] || String(Number(token.replace(',', '.'))))
    .join('|');
}
