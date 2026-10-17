/** Shared contracts; raw JSON stays separate from presentation and export fields. */
export interface JsonNumber {
  readonly rawJSON: string;
}
export type Json =
  null | boolean | number | string | JsonNumber | Json[] | JsonObject;
export type JsonObject = { [key: string]: Json };
/** Raw data is immutable to consumers; collection retains its own mutable contracts. */
export type ReadonlyJson =
  | null
  | boolean
  | number
  | string
  | JsonNumber
  | readonly ReadonlyJson[]
  | ReadonlyJsonObject;
export interface ReadonlyJsonObject {
  readonly [key: string]: ReadonlyJson;
}
export type FileFormat = 'csv' | 'json';
export type DatePreset = 'month' | 'previous' | 'all';
export type StopReason = 'end' | 'limit' | 'stalled' | 'cancelled' | 'failed';
export interface Order {
  id: string;
  raw: JsonObject;
}

export interface Page {
  orders: Order[];
  /** Opaque JSON text, encoded by the source; never reinterpret it as business data. */
  nextCursor: string | undefined;
}

export interface OrderSource {
  list(
    cursor: string | undefined,
    size: number,
    signal: AbortSignal,
  ): Promise<Page>;
  details(id: string, signal: AbortSignal): Promise<JsonObject>;
}

export interface ExportOptions {
  startDate: string;
  endDate: string;
  pageSize: number;
  maxPages: number;
  includeDetails: boolean;
}

export interface ExportEntry {
  order: JsonObject;
  detail: JsonObject | null;
  detailStatus: 'ok' | 'failed' | 'skipped';
}

export interface Progress {
  pages: number;
  scanned: number;
  selected: number;
  duplicates: number;
  unknownDates: number;
  detailFailures: number;
}

/** Request-local progress is reported live and does not change the exported protocol. */
export interface LiveProgress extends Progress {
  current:
    | { kind: 'list'; page: number }
    | { kind: 'details'; page: number; completed: number; total: number };
}

export interface ExportResult {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  options: ExportOptions;
  reason: StopReason;
  complete: boolean;
  message: string;
  progress: Progress;
  entries: ExportEntry[];
}

export interface ReadonlyExportEntry {
  readonly order: ReadonlyJsonObject;
  readonly detail: ReadonlyJsonObject | null;
  readonly detailStatus: ExportEntry['detailStatus'];
}

export type ReadonlyExportResult = Readonly<
  Omit<ExportResult, 'entries' | 'options' | 'progress'>
> & {
  readonly entries: readonly ReadonlyExportEntry[];
  readonly options: Readonly<ExportOptions>;
  readonly progress: Readonly<Progress>;
};
