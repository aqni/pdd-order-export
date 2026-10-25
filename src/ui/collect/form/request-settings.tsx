import { h } from "preact";
import type { CollectDraft } from "./form";

export function CollectRequestSettings({
  pageSize,
  maxPages,
}: Pick<CollectDraft, "pageSize" | "maxPages">) {
  return (
    <details
      data-ui="collect-requests"
      onInvalidCapture={(event) => {
        event.currentTarget.open = true;
      }}
    >
      <summary>请求设置</summary>
      <div class="fields">
        <label>
          每页订单数
          <input
            name="pageSize"
            type="number"
            value={pageSize}
            min={1}
            max={50}
            required
          />
        </label>
        <label title="达到页数上限时会停止收集，可导出部分结果。">
          最多读取页数
          <input
            name="maxPages"
            type="number"
            value={maxPages}
            min={1}
            required
          />
        </label>
      </div>
    </details>
  );
}
