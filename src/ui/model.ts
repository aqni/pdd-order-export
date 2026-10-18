import type { ReadonlyExportResult, Progress, LiveProgress } from "../collect";

/** Only task state crosses the session/rendering boundary; draft inputs belong to the form. */
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
