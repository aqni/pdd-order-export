import { is, validate, type tags } from "typia";
import { PddError, type PddClient, type Order, type OrderDetail } from "./pdd";

/** Collection contracts keep raw wire values separate from task state. */
export type DatePreset = "month" | "previous" | "all";
export type StopReason = "end" | "range" | "limit" | "cancelled" | "failed";
type CalendarDate = string & tags.Format<"date">;
type PositiveInteger<Max extends number> = number &
  tags.Type<"int32"> &
  tags.Minimum<1> &
  tags.Maximum<Max>;

export interface ExportOptions {
  startDate: "" | CalendarDate;
  endDate: "" | CalendarDate;
  pageSize: PositiveInteger<50>;
  maxPages: PositiveInteger<500>;
  includeDetails: boolean;
}

export interface ExportEntry {
  order: Order;
  detail: OrderDetail | null;
}

export interface Progress {
  pages: number;
  scanned: number;
  selected: number;
}

/** Request-local progress is reported live and does not change the exported protocol. */
export interface LiveProgress extends Progress {
  current:
    | { kind: "list"; page: number }
    | { kind: "details"; page: number; completed: number; total: number };
}

export interface ExportResult {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  options: ExportOptions;
  reason: StopReason;
  complete: boolean;
  error: string | null;
  progress: Progress;
  entries: ExportEntry[];
}

type DeepReadonly<T> = T extends object
  ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

export type ReadonlyExportEntry = DeepReadonly<ExportEntry>;
export type ReadonlyExportResult = DeepReadonly<ExportResult>;

export class InputError extends Error {
  constructor(readonly field: string) {
    super(`Invalid export option: ${field}`);
    this.name = "InputError";
  }
}

class CollectionError extends Error {}

function calendarDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Estimate the filtering date without modifying the original order. */
export function estimatedOrderDate(id: string): string {
  const parts = /^(\d{2})(\d{2})(\d{2})-/.exec(id);
  const date = parts ? `20${parts[1]}-${parts[2]}-${parts[3]}` : "";
  if (!is<CalendarDate>(date)) {
    throw new CollectionError("无法识别订单日期。");
  }
  return date;
}

export function presetDates(preset: DatePreset, today = new Date()) {
  if (preset === "all") {
    return { startDate: "", endDate: "" };
  }
  const month = preset === "previous" ? today.getMonth() - 1 : today.getMonth();
  const first = new Date(today.getFullYear(), month, 1);
  const last =
    preset === "month" ? today : new Date(today.getFullYear(), month + 1, 0);
  return { startDate: calendarDate(first), endDate: calendarDate(last) };
}

export function validateOptions(input: unknown): ExportOptions {
  const checked = validate<ExportOptions>(input);
  if (!checked.success) {
    const field = checked.errors[0]?.path.replace("$input.", "") ?? "";
    throw new InputError(field);
  }
  const { startDate, endDate } = checked.data;
  if (startDate && endDate && startDate > endDate) {
    throw new InputError("range");
  }
  return { ...checked.data };
}

/** Collection yields progress snapshots followed by one final result, including partial data. */
export type CollectionEvent =
  | { readonly type: "progress"; readonly progress: DeepReadonly<LiveProgress> }
  | { readonly type: "result"; readonly result: ReadonlyExportResult };

export async function* collectOrders(
  source: Pick<PddClient, "getOrders" | "getOrderDetail">,
  input: ExportOptions,
  signal: AbortSignal,
): AsyncGenerator<CollectionEvent, void, void> {
  const options = validateOptions(input);
  const progress: Progress = {
    pages: 0,
    scanned: 0,
    selected: 0,
  };
  const result: ExportResult = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    options,
    reason: "limit",
    complete: false,
    error: null,
    progress,
    entries: [],
  };
  let cursor: string | null = null;
  const snapshot = (current: LiveProgress["current"]): CollectionEvent => ({
    type: "progress",
    progress: { ...progress, current: { ...current } },
  });
  try {
    while (progress.pages < options.maxPages) {
      yield snapshot({ kind: "list", page: progress.pages + 1 });
      signal.throwIfAborted();
      const orders = await source.getOrders(cursor, options.pageSize, signal);
      progress.pages++;
      if (orders.length === 0) {
        yield snapshot({ kind: "list", page: progress.pages });
        signal.throwIfAborted();
        result.reason = "end";
        break;
      }
      const pendingDetails: ExportEntry[] = [];
      let reachedStart = false;
      // Save selected orders before the first cancellable detail request.
      for (const order of orders) {
        const { order_sn } = order;
        progress.scanned++;
        if (options.startDate || options.endDate) {
          const date = estimatedOrderDate(order_sn);
          if (options.startDate && date < options.startDate) {
            reachedStart = true;
            break;
          }
          if (options.endDate && date > options.endDate) {
            continue;
          }
        }
        const entry: ExportEntry = {
          order,
          detail: null,
        };
        result.entries.push(entry);
        pendingDetails.push(entry);
        progress.selected++;
      }
      yield snapshot({ kind: "list", page: progress.pages });
      signal.throwIfAborted();
      if (options.includeDetails && pendingDetails.length > 0) {
        const current: LiveProgress["current"] = {
          kind: "details",
          page: progress.pages,
          completed: 0,
          total: pendingDetails.length,
        };
        yield snapshot(current);
        for (const entry of pendingDetails) {
          signal.throwIfAborted();
          entry.detail = await source.getOrderDetail(
            entry.order.order_sn,
            signal,
          );
          current.completed++;
          yield snapshot(current);
        }
      }
      signal.throwIfAborted();
      if (reachedStart) {
        result.reason = "range";
        break;
      }
      cursor = orders.at(-1)!.offset;
    }
  } catch (error) {
    result.reason = signal.aborted ? "cancelled" : "failed";
    if (
      !signal.aborted &&
      (error instanceof PddError || error instanceof CollectionError)
    ) {
      result.error = error.message;
    }
  }
  result.complete = result.reason === "end" || result.reason === "range";
  result.finishedAt = new Date().toISOString();
  yield { type: "result", result };
}
