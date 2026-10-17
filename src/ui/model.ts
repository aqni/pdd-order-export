import type {
  ExportOptions,
  ReadonlyExportResult,
  FileFormat,
  Progress,
  LiveProgress,
} from '../core/types';

/** Only task state crosses the session/rendering boundary; draft inputs belong to the form. */
export interface TaskState {
  readonly running: boolean;
  readonly status: string;
  readonly error: string;
  readonly progress:
    | Readonly<Progress>
    | (Readonly<Progress> & {
        readonly current: Readonly<LiveProgress['current']>;
      })
    | null;
  readonly result: ReadonlyExportResult | null;
}

export interface ExportRequest {
  options: ExportOptions;
  format: FileFormat;
}
