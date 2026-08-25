import { DOMParser } from 'npm:linkedom@0.18.12';
import { extractText } from 'npm:unpdf@0.12.1';

export interface SourceStep { section: string; text: string; }
export interface ParsedRecipe {
  title: string; yieldText: string; prepMinutes: number | null; cookMinutes: number | null; totalMinutes: number | null;
  ingredients: string[]; steps: SourceStep[]; sourceType: string; traceCorpus: string;
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const minutes = (value: unknown): number | null => {
  const text = normalize(value); if (!text) return null;
  const iso = text.match(/^PT(?:(\d+)H)?(?:(\d+)M)?/i); if (iso) return Number(iso[1] || 0) * 60 + Number(iso[2] || 0);
  const hour = text.match(/(\d+(?:\.\d+)?)\s*h/i); const minute = text.match(/(\d+)\s*m/i);
  const result = Number(hour?.[1] || 0) * 60 + Number(minute?.[1] || 0); return result || null;
};

function recipeNode(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) { for (const item of value) { const found = recipeNode(item); if (found) return found; } return null; }
  if (!value || typeof value !== 'object') return null;
  const node = value as Record<string, unknown>; const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  return recipeNode(node['@graph']);
}

function instructionLines(value: unknown, section = ''): SourceStep[] {
  if (typeof value === 'string') return value.split(/\n+/).map(normalize).filter(Boolean).map((text) => ({ section, text }));
  if (Array.isArray(value)) return value.flatMap((item) => instructionLines(item, section));
  if (!value || typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  if (node['@type'] === 'HowToSection') return instructionLines(node.itemListElement, normalize(node.name));
  const text = normalize(node.text || node.name); return text ? [{ section, text }] : instructionLines(node.itemListElement, section);
}

export function parseHtmlRecipe(html: string, fallbackTitle = 'Imported recipe'): ParsedRecipe {
  const document = new DOMParser().parseFromString(html, 'text/html');
  if (!document) throw new Error('The recipe page could not be read.');
  const traceCorpus = `${html}\n${document.documentElement?.textContent || ''}`;
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
    try {
      const node = recipeNode(JSON.parse(script.textContent || 'null')); if (!node) continue;
      const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : []).map(normalize).filter(Boolean);
      const steps = instructionLines(node.recipeInstructions);
      if (ingredients.length && steps.length) return { title: normalize(node.name) || fallbackTitle, yieldText: normalize(Array.isArray(node.recipeYield) ? node.recipeYield[0] : node.recipeYield), prepMinutes: minutes(node.prepTime), cookMinutes: minutes(node.cookTime), totalMinutes: minutes(node.totalTime), ingredients, steps, sourceType: 'json-ld', traceCorpus };
    } catch { /* Malformed unrelated JSON-LD is ignored. */ }
  }
  const itemText = (selector: string) => [...document.querySelectorAll(selector)].map((node) => normalize(node.getAttribute('content') || node.textContent)).filter(Boolean);
  let ingredients = itemText('[itemprop="recipeIngredient"]');
  let steps = itemText('[itemprop="recipeInstructions"]').map((text) => ({ section: '', text }));
  let sourceType = 'microdata';
  if (!ingredients.length || !steps.length) {
    ingredients = itemText('.wprm-recipe-ingredient');
    const sections = [...document.querySelectorAll('.wprm-recipe-instruction-group')];
    steps = sections.flatMap((group) => {
      const section = normalize(group.querySelector('.wprm-recipe-group-name')?.textContent);
      return [...group.querySelectorAll('.wprm-recipe-instruction')].map((node) => ({ section, text: normalize(node.textContent) })).filter((step) => step.text);
    });
    sourceType = 'wprm-print-html';
  }
  if (!ingredients.length || !steps.length) throw new Error('The page does not expose a traceable recipe. Try its print page, a public PDF, or a PDF upload.');
  return { title: normalize(document.querySelector('[itemprop="name"], .wprm-recipe-name, h1')?.textContent) || fallbackTitle, yieldText: normalize(document.querySelector('[itemprop="recipeYield"], .wprm-recipe-servings')?.textContent), prepMinutes: minutes(document.querySelector('[itemprop="prepTime"], .wprm-recipe-prep_time')?.textContent), cookMinutes: minutes(document.querySelector('[itemprop="cookTime"], .wprm-recipe-cook_time')?.textContent), totalMinutes: minutes(document.querySelector('[itemprop="totalTime"], .wprm-recipe-total_time')?.textContent), ingredients, steps, sourceType, traceCorpus };
}

export function parseMarkdownRecipe(markdown: string, fallbackTitle = 'Imported recipe'): ParsedRecipe {
  const title = normalize(markdown.match(/^#\s+(.+)$/m)?.[1] || markdown.match(/^Title:\s*(.+)$/mi)?.[1] || fallbackTitle);
  const yieldText = normalize(markdown.match(/(?:Servings|Yield|Makes):?\s*\n?\s*([^\n]+)/i)?.[1]);
  const ingredientBlock = markdown.match(/#{1,4}\s+(?:Ingredients|Ingredientes)\s*\n([\s\S]*?)(?=\n#{1,4}\s+|$)/i)?.[1] || '';
  const stepBlock = markdown.match(/#{1,4}\s+(?:Directions|Instructions|Preparation|Method|Preparación)\s*\n([\s\S]*?)(?=\n#{1,4}\s+|$)/i)?.[1] || '';
  const ingredients = ingredientBlock.split('\n').map((line) => normalize(line.replace(/^\s*[-*+]\s+/, ''))).filter(Boolean);
  const steps = stepBlock.split('\n').map((line) => normalize(line.replace(/^\s*(?:\d+[.)]|[-*+])\s+/, ''))).filter(Boolean).map((text) => ({ section: '', text }));
  if (!ingredients.length || !steps.length) throw new Error('The fallback reader did not expose complete ingredient and instruction sections.');
  return { title, yieldText, prepMinutes: minutes(markdown.match(/Prep Time:?\s*\n?\s*([^\n]+)/i)?.[1]), cookMinutes: minutes(markdown.match(/Cook Time:?\s*\n?\s*([^\n]+)/i)?.[1]), totalMinutes: minutes(markdown.match(/Total Time:?\s*\n?\s*([^\n]+)/i)?.[1]), ingredients, steps, sourceType: 'reader-proxy-markdown', traceCorpus: markdown };
}

export async function parsePdfRecipe(bytes: Uint8Array, fallbackTitle = 'Imported PDF recipe'): Promise<ParsedRecipe> {
  const result = await extractText(bytes, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join('\n') : String(result.text || '');
  const ingredientMatch = text.match(/(?:^|\n)\s*(?:INGREDIENTS|Ingredientes)\s*\n([\s\S]*?)(?=\n\s*(?:DIRECTIONS|INSTRUCTIONS|PREPARATION|METHOD|Preparación)\b)/i);
  const stepMatch = text.match(/(?:^|\n)\s*(?:DIRECTIONS|INSTRUCTIONS|PREPARATION|METHOD|Preparación)\s*\n([\s\S]*?)(?=\n\s*(?:NOTES?|PRIVATE NOTES?|Nutrition)\b|$)/i);
  if (!ingredientMatch || !stepMatch) throw new Error('The PDF does not contain clearly traceable ingredient and instruction sections.');
  const ingredients = ingredientMatch[1].split('\n').map(normalize).filter((line) => line && !/^\d+$/.test(line));
  const steps = stepMatch[1].split(/\n(?=(?:Step\s+)?\d+[.)]?\s+)/i).map((line) => normalize(line.replace(/^(?:Step\s+)?\d+[.)]?\s*/i, ''))).filter(Boolean).map((step) => ({ section: '', text: step }));
  if (!ingredients.length || !steps.length) throw new Error('The PDF sections were found, but their recipe lines could not be separated reliably.');
  const heading = text.split('\n').map(normalize).find((line) => line && !/ingredients|recipe from/i.test(line)) || fallbackTitle;
  return { title: heading, yieldText: normalize(text.match(/(?:yield|serves|servings)\s*:?[ \t]*([^\n]+)/i)?.[1]), prepMinutes: minutes(text.match(/prep time\s*:?[ \t]*([^\n]+)/i)?.[1]), cookMinutes: minutes(text.match(/cook time\s*:?[ \t]*([^\n]+)/i)?.[1]), totalMinutes: minutes(text.match(/total time\s*:?[ \t]*([^\n]+)/i)?.[1]), ingredients, steps, sourceType: 'pdf-text', traceCorpus: text };
}

export function assertSourceTrace(recipe: ParsedRecipe): void {
  const corpus = normalize(recipe.traceCorpus).toLowerCase();
  [...recipe.ingredients, ...recipe.steps.map((step) => step.text)].forEach((line, index) => {
    if (!corpus.includes(normalize(line).toLowerCase())) throw new Error(`Recipe line ${index + 1} cannot be traced to the fetched source.`);
  });
}

