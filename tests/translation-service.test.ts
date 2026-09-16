import { describe, expect, it, vi } from 'vitest';
import { translateRecipe, translationChunks } from '../supabase/functions/_shared/translate';

const recipe = {
  title: 'Tarta de queso vasca', yieldText: '8 raciones', prepMinutes: null, cookMinutes: null, totalMinutes: null,
  ingredients: ['500 g queso crema', '3 huevos'],
  steps: [{ section: 'Preparacion', text: 'Hornear 40 minutos a 200 C.' }],
  sourceType: 'manual' as const, traceCorpus: '',
};

describe('free source-preserving translation', () => {
  it('uses one Spanish-to-English request per source field and preserves indices', async () => {
    const translations: Record<string, string> = {
      'Tarta de queso vasca': 'Basque cheesecake', '8 raciones': '8 servings',
      '500 g queso crema': '500 g cream cheese', '3 huevos': '3 eggs',
      Preparacion: 'Preparation', 'Hornear 40 minutos a 200 C.': 'Bake 40 minutes at 200 C.',
    };
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('langpair')).toBe('es|en');
      return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: translations[url.searchParams.get('q') || ''] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const translated = await translateRecipe(recipe, fetcher);
    expect(translated?.sourceLanguage).toBe('Spanish');
    expect(translated?.ingredients).toEqual([{ sourceIndex: 0, text: '500 g cream cheese' }, { sourceIndex: 1, text: '3 eggs' }]);
    expect(translated?.steps[0]).toEqual({ sourceIndex: 0, section: 'Preparation', text: 'Bake 40 minutes at 200 C.' });
  });

  it('stops an import if a translation changes a source quantity', async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const source = new URL(String(input)).searchParams.get('q') || '';
      const translated = source === '500 g queso crema' ? '600 g cream cheese' : source;
      return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: translated } }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(translateRecipe(recipe, fetcher)).rejects.toThrow(/changed ingredient line 1/);
  });

  it('keeps every request below the provider byte limit', () => {
    const chunks = translationChunks('palabra '.repeat(100), 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).length <= 100)).toBe(true);
  });
});
