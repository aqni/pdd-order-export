import type { CollectResult } from "../collect";
import { ExportResult } from "./result";
import { ExportDownload } from "./download";

/** 只展示已交付结果，不订阅收集进度。 */
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
