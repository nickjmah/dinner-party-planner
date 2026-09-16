const LANGUAGE_SIGNALS: Record<string, Set<string>> = {
  es: new Set([
    'ingrediente', 'ingredientes', 'preparacion', 'porcion', 'porciones', 'racion', 'raciones',
    'tarta', 'queso', 'aceite', 'huevo', 'huevos', 'azucar', 'harina', 'pimienta', 'cucharada',
    'cucharadas', 'cucharadita', 'cucharaditas', 'batir', 'mezclar', 'hornear', 'hornea', 'cocer',
    'cocinar', 'anadir', 'agregar', 'verter', 'molde', 'hasta', 'durante', 'minutos', 'gramos',
    'caliente', 'frio', 'refrigerar', 'servir',
  ]),
  fr: new Set([
    'recette', 'cuillere', 'cuilleres', 'melanger', 'ajouter', 'cuire', 'oeuf', 'oeufs', 'farine',
    'sucre', 'beurre', 'fromage', 'pendant', 'minutes', 'servir', 'refrigerer', 'four',
  ]),
  it: new Set([
    'ingredienti', 'preparazione', 'cucchiaio', 'cucchiai', 'mescolare', 'aggiungere', 'cuocere',
    'uovo', 'uova', 'farina', 'zucchero', 'burro', 'formaggio', 'minuti', 'servire', 'forno',
  ]),
  pt: new Set([
    'ingredientes', 'preparo', 'colher', 'colheres', 'misturar', 'adicionar', 'assar', 'ovo', 'ovos',
    'farinha', 'acucar', 'manteiga', 'queijo', 'durante', 'minutos', 'servir', 'forno',
  ]),
};

function words(value: string): string[] {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+/g) || [];
}

export interface TranslationCandidate {
  title: string;
  yieldText: string;
  ingredients: string[];
  steps: Array<{ text: string }>;
}

export function detectRecipeLanguage(recipe: TranslationCandidate): string | null {
  const text = [recipe.title, recipe.yieldText, ...recipe.ingredients, ...recipe.steps.map((step) => step.text)].join(' ');
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Han}/u.test(text)) return 'zh';
  if (/\p{Script=Arabic}/u.test(text)) return 'ar';
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru';

  const tokens = new Set(words(text));
  const scores = Object.entries(LANGUAGE_SIGNALS).map(([language, signals]) => ({
    language,
    score: [...signals].filter((signal) => tokens.has(signal)).length,
  })).sort((left, right) => right.score - left.score);
  return scores[0]?.score >= 2 ? scores[0].language : null;
}

export function likelyNonEnglish(recipe: TranslationCandidate): boolean {
  return detectRecipeLanguage(recipe) !== null;
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
