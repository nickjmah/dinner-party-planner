import { detectRecipeLanguage, sourceNumbers } from './domain/translation.ts';

interface TranslatableRecipe {
  title: string;
  yieldText: string;
  ingredients: string[];
  steps: Array<{ section: string; text: string }>;
}

export interface TranslationResult { sourceLanguage: string; title: string; yieldText: string; ingredients: Array<{ sourceIndex: number; text: string }>; steps: Array<{ sourceIndex: number; section: string; text: string }>; }

const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean' };
const encoder = new TextEncoder();

function decodeEntities(value: string): string {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function translationChunks(value: string, maxBytes = 450): string[] {
  if (encoder.encode(value).length <= maxBytes) return value ? [value] : [];
  const words = value.split(/(\s+)/); const chunks: string[] = []; let current = '';
  for (const word of words) {
    if (encoder.encode(current + word).length <= maxBytes) { current += word; continue; }
    if (current.trim()) chunks.push(current.trim()); current = '';
    if (encoder.encode(word).length <= maxBytes) { current = word.trimStart(); continue; }
    let piece = '';
    for (const character of word) {
      if (encoder.encode(piece + character).length > maxBytes) { if (piece) chunks.push(piece); piece = character; } else piece += character;
    }
    current = piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function translatedSegment(value: string, language: string, fetcher: typeof fetch): Promise<string> {
  if (!value.trim()) return '';
  const output: string[] = [];
  for (const chunk of translationChunks(value)) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk); url.searchParams.set('langpair', `${language}|en`); url.searchParams.set('mt', '1');
    let response: Response;
    try { response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }); }
    catch { throw new Error('The free translation service could not be reached. Try the import again shortly.'); }
    if (!response.ok) throw new Error(response.status === 429 ? 'The free translation service daily limit has been reached. Try again tomorrow.' : `The free translation service returned HTTP ${response.status}.`);
    const body = await response.json() as { responseStatus?: number | string; responseDetails?: string; responseData?: { translatedText?: string } };
    const status = Number(body.responseStatus || response.status);
    if (status >= 400 || !body.responseData?.translatedText) throw new Error(status === 429 ? 'The free translation service daily limit has been reached. Try again tomorrow.' : `The free translation service could not translate this recipe${body.responseDetails ? `: ${body.responseDetails}` : '.'}`);
    output.push(decodeEntities(body.responseData.translatedText));
  }
  return output.join(' ');
}

export async function translateRecipe(recipe: TranslatableRecipe, fetcher: typeof fetch = fetch): Promise<TranslationResult | null> {
  const language = detectRecipeLanguage(recipe); if (!language) return null;
  const cache = new Map<string, Promise<string>>();
  const translate = (value: string) => {
    const key = `${language}\u0000${value}`;
    if (!cache.has(key)) cache.set(key, translatedSegment(value, language, fetcher));
    return cache.get(key)!;
  };
  const translated: TranslationResult = {
    sourceLanguage: LANGUAGE_NAMES[language] || language,
    title: await translate(recipe.title),
    yieldText: await translate(recipe.yieldText),
    ingredients: [], steps: [],
  };
  for (let index = 0; index < recipe.ingredients.length; index += 1) translated.ingredients.push({ sourceIndex: index, text: await translate(recipe.ingredients[index]) });
  for (let index = 0; index < recipe.steps.length; index += 1) translated.steps.push({ sourceIndex: index, section: await translate(recipe.steps[index].section), text: await translate(recipe.steps[index].text) });
  translated.ingredients.forEach((line, index) => { if (sourceNumbers(line.text) !== sourceNumbers(recipe.ingredients[index])) throw new Error(`Translation changed ingredient line ${index + 1}; the import was stopped to protect the source recipe.`); });
  translated.steps.forEach((line, index) => { if (sourceNumbers(line.text) !== sourceNumbers(recipe.steps[index].text)) throw new Error(`Translation changed instruction ${index + 1}; the import was stopped to protect the source recipe.`); });
  if (sourceNumbers(translated.yieldText) !== sourceNumbers(recipe.yieldText)) throw new Error('Translation changed the recipe yield; the import was stopped to protect the source recipe.');
  return translated;
}
