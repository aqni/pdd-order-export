import type { collectOrders, CollectedOrder } from "../../collect";

export type CollectOptions = Parameters<typeof collectOrders>[1];
export type CollectStatus = "idle" | "collecting" | "cancelling" | "complete";
export interface CollectDraft {
  startDate: string;
  endDate: string;
  includeDetails: boolean;
  pageSize: number | string;
  maxPages: number | string;
}
export interface CollectResult {
  readonly entries: readonly CollectedOrder[];
  readonly partial: boolean;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
}
export interface CollectCounts {
  readonly pages: number;
  readonly orders: number;
  readonly details: number;
  readonly currentPage: {
    readonly completed: number;
    readonly total: number;
  } | null;
}
export interface CollectionState {
  status: CollectStatus;
  progress: CollectCounts | null;
  error: string | null;
}
