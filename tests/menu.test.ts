import { describe, expect, it } from 'vitest';
import { isPlannedRecipe, parsePlannedMenu, plannedMenuSection } from '../src/lib/menu';

describe('planning mode menu parsing', () => {
  it('creates one deterministic placeholder per dish and preserves section headings', () => {
    expect(parsePlannedMenu('Appetizers:\n- Croquetas\n- Pan con tomate\n\nMains:\n1. Paella')).toEqual([
      { title: 'Croquetas', section: 'Appetizers' },
      { title: 'Pan con tomate', section: 'Appetizers' },
      { title: 'Paella', section: 'Mains' },
    ]);
  });

  it('deduplicates dish names without changing source wording', () => {
    expect(parsePlannedMenu('Basque cheesecake\nBASQUE CHEESECAKE\nChurros')).toEqual([
      { title: 'Basque cheesecake', section: '' },
      { title: 'Churros', section: '' },
    ]);
  });

  it('recognizes placeholders and reads their optional section', () => {
    expect(isPlannedRecipe({ source_type: 'planned' })).toBe(true);
    expect(isPlannedRecipe({ source_type: 'manual' })).toBe(false);
    expect(plannedMenuSection({ provenance: { rule: 'menu-only', section: 'Dessert' } })).toBe('Dessert');
  });
});
