import { h } from "preact";
import type { CollectResult } from "../collect";
import { ExportResult } from "./result";
import { ExportDownload } from "./download";

/** 只接收结果快照，展示结果与下载入口。 */
export function ExportControls({ result }: { result: CollectResult | null }) {
  if (!result) return null;
  return (
    <div data-ui="export">
      <hr />
      <section aria-label="收集结果">
        <ExportResult result={result} />
        <div class="exports" hidden={!result.entries.length}>
          <ExportDownload result={result} format="csv" />
          <ExportDownload result={result} format="json" />
        </div>
      </section>
    </div>
  );
}
