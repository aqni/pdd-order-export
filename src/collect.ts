import { createIs, createValidate, type tags } from "typia";
import { PddError, type PddClient, type Order, type OrderDetail } from "./pdd";

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
  /** 尚未获取详情；取消或失败的任务也可能留下此值。 */
  detail: OrderDetail | null;
}

export interface Progress {
  pages: number;
  scanned: number;
  selected: number;
}

/** 当前请求的进度；最终结果只保存累计计数。 */
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
  /** 仅表示本次遍历正常结束，不保证接口覆盖全部历史订单。 */
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

const isCalendarDate = createIs<CalendarDate>();

/**
 * 从订单号前六位估算订单日期，不等同于支付时间。
 * @throws 无法识别日期或日期不存在时抛出错误。
 */
export function estimatedOrderDate(id: string): string {
  const parts = /^(\d{2})(\d{2})(\d{2})-/.exec(id);
  const date = parts ? `20${parts[1]}-${parts[2]}-${parts[3]}` : "";
  if (!isCalendarDate(date)) {
    throw new CollectionError("无法识别订单日期。");
  }
  return date;
}

const validateExportOptions = createValidate<ExportOptions>();

export function validateOptions(input: unknown): ExportOptions {
  const checked = validateExportOptions(input);
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

/** 收集过程中产生进度快照，结束时产生一次结果事件。 */
export type CollectionEvent =
  | { readonly type: "progress"; readonly progress: DeepReadonly<LiveProgress> }
  | { readonly type: "result"; readonly result: ReadonlyExportResult };

/**
 * 按日期倒序逐页收集订单，日期范围含起止日。
 *
 * 调用方须持续迭代到结果事件，才能取得取消或请求失败前保留的数据。
 * 收集期间的失败写入结果；无效选项在开始收集前抛出。
 */
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
      // 先保留本页选中的列表数据，避免详情请求失败时丢失同页其他订单。
      for (const order of orders) {
        const { order_sn } = order;
        progress.scanned++;
        if (options.startDate || options.endDate) {
          const date = estimatedOrderDate(order_sn);
          if (options.startDate && date < options.startDate) {
            // 协议约定列表日期倒序，后续订单也会超出范围。
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
      // offset 是上游返回的不透明游标，不从订单号或页数推算。
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
