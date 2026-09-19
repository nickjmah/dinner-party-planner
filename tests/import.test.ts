import { describe, expect, it } from 'vitest';
import { choosePdfImportSource } from '../src/lib/import';
import { detectRecipeLanguage, likelyNonEnglish, sourceMeasurements, sourceNumbers } from '../src/lib/translation';

describe('PDF import source selection', () => {
  it('uses a public URL when the file input contains the browser empty-file placeholder', () => {
    const emptyFile = new File([], '');
    expect(choosePdfImportSource(emptyFile, ' https://example.com/recipe.pdf ')).toEqual({ kind: 'url', url: 'https://example.com/recipe.pdf' });
  });

  it('prefers a selected PDF upload over a URL', () => {
    const file = new File(['recipe'], 'recipe.pdf', { type: 'application/pdf' });
    expect(choosePdfImportSource(file, 'https://example.com/recipe.pdf')).toEqual({ kind: 'file', file });
  });

  it('requires either a file or a URL', () => expect(() => choosePdfImportSource(null, '')).toThrow(/Upload a PDF/));
});

describe('automatic English translation detection', () => {
  it('recognizes Spanish recipes without translated section headings', () => {
    const recipe = {
      title: 'Tarta de queso vasca', yieldText: '8 raciones',
      ingredients: ['500 g queso crema', '3 huevos', '1 cucharada harina'],
      steps: [{ text: 'Batir hasta que quede suave.' }, { text: 'Verter en el molde y cocer hasta dorar.' }],
    };
    expect(likelyNonEnglish(recipe)).toBe(true);
    expect(detectRecipeLanguage(recipe)).toBe('es');
  });

  it('does not send an ordinary English recipe for translation', () => {
    expect(likelyNonEnglish({
      title: 'Roast chicken', yieldText: 'Serves 4', ingredients: ['1 chicken', '2 tbsp olive oil'],
      steps: [{ text: 'Season the chicken and roast until browned.' }],
    })).toBe(false);
  });

  it('treats decimal commas and decimal points as the same source number', () => {
    expect(sourceNumbers('1,5 kg at 180 °C')).toBe(sourceNumbers('1.5 kg at 180°C'));
  });

  it('normalizes translated measurement names but distinguishes incompatible units', () => {
    expect(sourceMeasurements('2 cucharadas durante 1 hora')).toBe(sourceMeasurements('2 tablespoons for 1 hour'));
    expect(sourceMeasurements('500 g')).not.toBe(sourceMeasurements('500 oz'));
  });
});
