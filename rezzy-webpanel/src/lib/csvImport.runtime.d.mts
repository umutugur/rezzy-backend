export declare const OUR_FIELDS: string[];

export interface GuessColumnMapResult {
  title?: string;
  category?: string;
  defaultPrice?: string;
  barcode?: string;
  unit?: string;
  defaultDiscountPrice?: string;
  [key: string]: string | undefined;
}

export interface NormalizePriceOptions {
  decimalSeparator?: "." | ",";
  stripCurrency?: boolean;
}

export interface ApplyMappingOptions {
  decimalSeparator?: "." | ",";
  stripCurrency?: boolean;
  unitMap?: Record<string, string>;
}

export interface NormalizedRow {
  title: string;
  category: string;
  defaultPrice: number;
  barcode: string;
  unit: string;
  defaultDiscountPrice?: number;
}

export interface ApplyMappingError {
  row: number;
  message: string;
}

export interface CategoryLike {
  _id: string;
  title?: string;
  key?: string;
}

export interface ParsedWorkbook {
  headers: string[];
  rows: Record<string, string>[];
}
export declare function parseWorkbook(arrayBuffer: ArrayBuffer): ParsedWorkbook;

export declare function guessColumnMap(headers: string[]): GuessColumnMapResult;
export declare function normalizePrice(raw: unknown, options?: NormalizePriceOptions): number | null;
export declare function normalizeUnit(raw: unknown, unitMap?: Record<string, string>): string;
export declare function headerFingerprint(headers: string[]): string;
export declare function detectDecimalSeparator(samples: unknown[]): "." | ",";
export declare function guessCategoryMatch(value: unknown, categories: CategoryLike[]): string | null;
export declare function applyMapping(
  rows: Record<string, unknown>[],
  columnMap: GuessColumnMapResult,
  categoryMap: Record<string, string>,
  options: ApplyMappingOptions,
): { rows: NormalizedRow[]; errors: ApplyMappingError[] };
