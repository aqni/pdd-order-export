import { Component, h } from "preact";
import type { CollectResult } from "../collect";
import { ExportResult } from "./result";
import { ExportDownload } from "./download";

/** 持有已交付结果，收集区域内部的进度更新不会触及导出区域。 */
export class ExportControls extends Component<
  {},
  { result: CollectResult | null }
> {
  state = { result: null as CollectResult | null };
  setResult(result: CollectResult | null) {
    this.setState({ result });
  }
  render() {
    const { result } = this.state;
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
}
