import type { ParsedRecipe } from './recipe-parser.ts';

const likelyNonEnglish = (recipe: ParsedRecipe) => /\b(?:ingredientes|preparación|porciones|mezcla|hornea|aceite|huevos|azúcar|harina|durante|cucharada)\b/i.test([recipe.title, recipe.yieldText, ...recipe.ingredients, ...recipe.steps.map((step) => step.text)].join(' '));
const sourceNumbers = (value: string) => (value.match(/\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]/g) || []).join('|');

interface TranslationResult { sourceLanguage: string; title: string; yieldText: string; ingredients: Array<{ sourceIndex: number; text: string }>; steps: Array<{ sourceIndex: number; section: string; text: string }>; }

export async function translateRecipe(recipe: ParsedRecipe): Promise<TranslationResult | null> {
  if (!likelyNonEnglish(recipe)) return null;
  const apiKey = Deno.env.get('OPENAI_API_KEY'); if (!apiKey) throw new Error('This recipe needs English translation, but the OpenAI integration is not configured.');
  const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini', temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: 'Translate the supplied recipe to natural English. Return JSON only. Preserve every number, unit, temperature, time, qualification, and source-line order exactly. Do not add, remove, combine, split, or correct recipe content. ingredients and steps must each contain every sourceIndex exactly once.' }, { role: 'user', content: JSON.stringify({ expectedShape: { sourceLanguage: 'language name', title: 'English title', yieldText: 'English yield', ingredients: [{ sourceIndex: 0, text: 'translation' }], steps: [{ sourceIndex: 0, section: 'translated section', text: 'translation' }] }, title: recipe.title, yieldText: recipe.yieldText, ingredients: recipe.ingredients.map((text, sourceIndex) => ({ sourceIndex, text })), steps: recipe.steps.map((step, sourceIndex) => ({ sourceIndex, section: step.section, text: step.text })) }) }],
  }) });
  if (!response.ok) throw new Error(response.status === 429 ? 'OpenAI quota or rate limit prevented translation.' : 'OpenAI could not translate this recipe.');
  const raw = await response.json(); const translated = JSON.parse(raw.choices?.[0]?.message?.content || '{}') as TranslationResult;
  if (translated.ingredients?.length !== recipe.ingredients.length || translated.steps?.length !== recipe.steps.length) throw new Error('The translation did not map one-to-one to the source recipe.');
  translated.ingredients.forEach((line, index) => { if (line.sourceIndex !== index || sourceNumbers(line.text) !== sourceNumbers(recipe.ingredients[index])) throw new Error(`Translation changed ingredient line ${index + 1}.`); });
  translated.steps.forEach((line, index) => { if (line.sourceIndex !== index || sourceNumbers(line.text) !== sourceNumbers(recipe.steps[index].text)) throw new Error(`Translation changed instruction ${index + 1}.`); });
  if (sourceNumbers(translated.yieldText) !== sourceNumbers(recipe.yieldText)) throw new Error('Translation changed the recipe yield.');
  return translated;
}

