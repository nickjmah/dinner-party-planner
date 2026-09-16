export type PdfImportSource =
  | { kind: 'file'; file: File }
  | { kind: 'url'; url: string };

function isNonEmptyFile(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object'
    && value !== null
    && 'name' in value
    && 'size' in value
    && typeof value.name === 'string'
    && value.name.length > 0
    && Number(value.size) > 0;
}

export function choosePdfImportSource(fileValue: FormDataEntryValue | null, urlValue: FormDataEntryValue | null): PdfImportSource {
  if (isNonEmptyFile(fileValue)) return { kind: 'file', file: fileValue };
  const url = typeof urlValue === 'string' ? urlValue.trim() : '';
  if (url) return { kind: 'url', url };
  throw new Error('Upload a PDF or enter a public PDF link.');
}
