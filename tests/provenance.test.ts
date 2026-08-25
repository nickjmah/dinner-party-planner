import { describe, expect, it } from 'vitest';
import { assertTracedLines, assertTranslationNumbersPreserved, normalizedTraceText, validateOneToOneTranslation } from '../src/lib/provenance';

describe('source provenance', () => {
  it('normalizes typography without changing words', () => expect(normalizedTraceText('  Bake “slowly”  ')).toBe('bake "slowly"'));
  it('accepts exact source lines', () => expect(() => assertTracedLines('Ingredients\n2 eggs\nBake 20 minutes.', [{ sourceText: '2 eggs' }, { sourceText: 'Bake 20 minutes.' }])).not.toThrow());
  it('rejects untraceable generated content', () => expect(() => assertTracedLines('2 eggs', [{ sourceText: 'Add vanilla' }])).toThrow(/cannot be traced/));
  it('preserves source numbers in translations', () => expect(() => assertTranslationNumbersPreserved('Hornee a 180 °C durante 45 minutos.', 'Bake at 180 °C for 45 minutes.')).not.toThrow());
  it('rejects number-changing translations', () => expect(() => assertTranslationNumbersPreserved('Cocine 20 minutos.', 'Cook for 25 minutes.')).toThrow(/changed/));
  it('accepts one-to-one line translations', () => expect(validateOneToOneTranslation(['2 huevos', 'Mezcle 10 minutos.'], [{ sourceIndex: 0, sourceText: '2 huevos', outputText: '2 eggs' }, { sourceIndex: 1, sourceText: 'Mezcle 10 minutos.', outputText: 'Mix for 10 minutes.' }])).toEqual(['2 eggs', 'Mix for 10 minutes.']));
  it('rejects duplicate source indices', () => expect(() => validateOneToOneTranslation(['a', 'b'], [{ sourceIndex: 0, sourceText: 'a', outputText: 'a' }, { sourceIndex: 0, sourceText: 'a', outputText: 'a' }])).toThrow(/one-to-one/));
});

