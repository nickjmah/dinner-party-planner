import type { Recipe } from '../types';

export interface PlannedMenuItem {
  title: string;
  section: string;
}

export function isPlannedRecipe(recipe: Pick<Recipe, 'source_type'>): boolean {
  return recipe.source_type === 'planned';
}

export function parsePlannedMenu(value: string): PlannedMenuItem[] {
  const items: PlannedMenuItem[] = [];
  const seen = new Set<string>();
  let section = '';

  for (const sourceLine of value.split(/\r?\n/)) {
    const line = sourceLine
      .replace(/^\s*(?:[-*\u2022]+|\d+[.)])\s+/, '')
      .trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() || (line.endsWith(':') ? line.slice(0, -1).trim() : '');
    if (heading) {
      section = heading;
      continue;
    }

    const key = line.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title: line, section });
  }

  return items;
}

export function plannedMenuSection(recipe: Pick<Recipe, 'provenance'>): string {
  if (!recipe.provenance || Array.isArray(recipe.provenance) || typeof recipe.provenance !== 'object') return '';
  const section = recipe.provenance.section;
  return typeof section === 'string' ? section : '';
}
