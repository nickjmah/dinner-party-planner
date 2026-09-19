import { z } from 'zod';
import { sourceMeasurements, sourceNumbers } from './translation';

export const SourceLineSchema = z.object({
  sourceIndex: z.number().int().nonnegative(),
  sourceText: z.string().min(1),
  outputText: z.string().min(1),
});

export function normalizedTraceText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim().toLowerCase();
}

export function assertTracedLines(sourceText: string, lines: Array<{ sourceText: string }>): void {
  const normalizedSource = normalizedTraceText(sourceText);
  if (!lines.length) throw new Error('No source-grounded recipe lines were found.');
  lines.forEach((line, index) => {
    if (!normalizedSource.includes(normalizedTraceText(line.sourceText))) {
      throw new Error(`Line ${index + 1} cannot be traced to the fetched source.`);
    }
  });
}

export function assertTranslationNumbersPreserved(source: string, translation: string): void {
  if (sourceNumbers(source) !== sourceNumbers(translation) || sourceMeasurements(source) !== sourceMeasurements(translation)) {
    throw new Error('The translation changed a source quantity, unit, temperature, or time.');
  }
}

export function validateOneToOneTranslation(sourceLines: string[], translated: z.infer<typeof SourceLineSchema>[]): string[] {
  const parsed = z.array(SourceLineSchema).length(sourceLines.length).parse(translated);
  const seen = new Set<number>();
  parsed.forEach((line) => {
    if (seen.has(line.sourceIndex) || sourceLines[line.sourceIndex] !== line.sourceText) {
      throw new Error('Translation does not map one-to-one to source lines.');
    }
    seen.add(line.sourceIndex);
    assertTranslationNumbersPreserved(line.sourceText, line.outputText);
  });
  return parsed.sort((a, b) => a.sourceIndex - b.sourceIndex).map((line) => line.outputText);
}
