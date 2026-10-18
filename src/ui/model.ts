import type { ReadonlyExportResult, Progress, LiveProgress } from "../collect";

/** 会话提供给视图的只读状态；未提交的输入由表单自行维护。 */
export interface TaskState {
  readonly running: boolean;
  readonly status: string;
  readonly error: string;
  readonly progress:
    | Readonly<Progress>
    | (Readonly<Progress> & {
        readonly current: Readonly<LiveProgress["current"]>;
      })
    | null;
  readonly result: ReadonlyExportResult | null;
}
