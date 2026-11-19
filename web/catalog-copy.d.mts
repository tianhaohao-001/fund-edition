export const CATALOG_EN: Record<string, Record<string, unknown>>;
export function localizedCatalogEntry<T>(item: T, language?: string): T;
export function catalogSampleLabel(kind: string, language?: string): string;
export function catalogAssumptions(item: { allocation?: number; model?: string }, language?: string): string[];
